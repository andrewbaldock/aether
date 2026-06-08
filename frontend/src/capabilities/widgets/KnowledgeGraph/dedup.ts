// Deduplication smarts for the knowledge graph. The model coins entity ids as
// "stable slugs", but across turns it drifts — `marie-curie` one turn,
// `marie-sklodowska-curie` the next — and the additive merge keys only on exact
// id, so the same real-world entity lands as two nodes. These pure helpers detect
// "same entity, different slug" so the reducer can fold a drifted entity into the
// node already on screen and re-point its links, instead of adding a twin.
//
// Two-stage match, both gated on identical `type` (we never fold across types —
// person Mercury and planet Mercury stay separate):
//   1. exact canonical-key equality (accents/casing/punctuation/articles), O(1)
//      via a Map the caller maintains;
//   2. a tight fuzzy fallback for abbreviation/expansion drift
//      (`us-army` ≡ `united-states-army`).
// The fuzzy rule is deliberately conservative: when in doubt, DON'T fold. A stray
// duplicate is recoverable; a wrong merge silently loses a real entity.

import type { EntityType, GraphLink } from "./types";

// Just the identity fields dedup cares about — accepts RawEntity, GraphNode, or
// any future shape carrying these three.
interface Identifiable {
  id: string;
  label: string;
  type: EntityType;
}

// Articles / connectives dropped at token boundaries so `the-louvre` ≡ `louvre`
// and `united states of america` ≡ `united states america`. Kept tiny on
// purpose — every extra stop word is a chance to fold two distinct names.
const STOP_WORDS: ReadonlySet<string> = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
]);

// Strip accents/diacritics: NFKD splits e.g. `ł`/`é` into base + combining mark,
// then we drop the marks. (`ł` has no decomposition in NFKD, so handle it
// explicitly — it's common enough in names like Skłodowska to be worth it.)
function stripDiacritics(s: string): string {
  return s
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

// Normalize a name into lowercase, ASCII, stop-word-free tokens. Shared by the
// canonical key and the fuzzy matcher so both see the same view of a name.
export function normalizeTokens(raw: string): string[] {
  return stripDiacritics(raw)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

// A normalized key for exact-duplicate detection. Keyed off the LABEL (the human
// name — more stable than the model's slug), falling back to the id when the
// label is empty. Namespaced by type so a person and a place sharing a name don't
// collide. `person:marie-curie` ≡ `person:marie-curie` regardless of which slug
// the model invented around it.
export function canonicalKey(entity: Identifiable): string {
  const basis = entity.label.trim() ? entity.label : entity.id;
  const slug = normalizeTokens(basis).join("-");
  return `${entity.type}:${slug}`;
}

// Levenshtein edit distance, iterative two-row. Small inputs (single name
// tokens), so the simple O(n·m) form is plenty.
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

// Max edit distance for two tokens to count as "the same word" (typo / spelling
// drift like `colour`/`color`). Tuned tiny — one or two char difference only.
const TOKEN_EDIT_THRESHOLD = 2;

// Does token `t` plausibly correspond to `other` (a single token from the other
// name)? True when they're an exact match, a short edit-distance apart, or one is
// a prefix of the other (e.g. `uni` → `university`).
function tokenMatches(t: string, other: string): boolean {
  if (t === other) return true;
  if (other.startsWith(t) || t.startsWith(other)) return true;
  // Don't let edit-distance swallow very short tokens, where 2 edits is most of
  // the word (e.g. `cat`/`dog` would be distance 3, but `cat`/`car` is 1).
  const minLen = Math.min(t.length, other.length);
  if (minLen <= 3) return false;
  return editDistance(t, other) <= TOKEN_EDIT_THRESHOLD;
}

// How many leading tokens of `tokens` does `token` expand to as an acronym?
// `us` ⇒ ["united","states","army"] returns 2 (consumes united+states); returns 0
// when it isn't a leading initialism. Plain initialisms only — Roman numerals /
// digits (`wwii`/`ww2`) are out of scope.
function acronymRunLength(token: string, tokens: string[]): number {
  if (token.length < 2 || tokens.length < token.length) return 0;
  for (let i = 0; i < token.length; i++) {
    if (tokens[i]?.[0] !== token[i]) return 0;
  }
  return token.length;
}

// The fuzzy duplicate test. Returns true when the shorter name is a *subset* of
// the longer one — i.e. every token of the shorter name is accounted for in the
// longer name (exact / prefix / small-edit / acronym expansion). The longer name
// is allowed to carry extra tokens the shorter one doesn't: `louvre` folds into
// `louvre museum`, and `marie curie` folds into `marie sklodowska curie`.
//
// Returns false the moment a shorter-name token has NO counterpart, which is what
// keeps genuinely different names apart: `marie curie` vs `pierre curie` (the
// first token conflicts → not a subset). Callers gate this on identical type, so
// the aggressive subset rule can't fold a person into a place.
//
// Trade-off (chosen deliberately): because the longer name may add tokens, this
// also folds `john adams` into `john quincy adams`. We accept the occasional
// over-merge of same-surname relatives of the same type in exchange for catching
// the far more common maiden-name / middle-name / suffix drift the model produces.
export function isFuzzyDuplicate(aRaw: string, bRaw: string): boolean {
  const at = normalizeTokens(aRaw);
  const bt = normalizeTokens(bRaw);
  if (at.length === 0 || bt.length === 0) return false;

  // Walk the shorter name's tokens against a consumable copy of the longer name's.
  // Every shorter-name token must be matched by: a direct token match
  // (exact/prefix/small-edit), or an acronym expansion eating a leading run of the
  // longer name (`us` → `united states`). Leftover tokens in the longer name are
  // fine — the shorter name being a subset is what makes them the same entity.
  const [shorter, longer] = at.length <= bt.length ? [at, bt] : [bt, at];
  const remaining = [...longer];

  for (const tok of shorter) {
    // Prefer an acronym expansion when one is available and would consume more
    // than a single token — otherwise the eager prefix rule in tokenMatches lets
    // `us` greedily match just `united`, stranding `states`. A genuine acronym
    // (`us`→united+states) should eat its whole run.
    const run = acronymRunLength(tok, remaining);
    if (run > 1) {
      remaining.splice(0, run);
      continue;
    }
    const idx = remaining.findIndex((o) => tokenMatches(tok, o));
    if (idx !== -1) {
      remaining.splice(idx, 1);
      continue;
    }
    return false; // a shorter-name token with no counterpart → distinct entities
  }

  return true; // shorter name fully covered by the longer → same entity
}

// Find an existing node that is (exactly or fuzzily) the same entity as `entity`.
// `byCanonical` is the caller-maintained canonicalKey → nodeId index for the O(1)
// exact path; `nodes` backs the fuzzy fallback (scanned only among same-type
// candidates). Returns the surviving node's id, or undefined when `entity` is new.
export function findDuplicateId(
  entity: Identifiable,
  byCanonical: ReadonlyMap<string, string>,
  nodes: readonly Identifiable[]
): string | undefined {
  const exact = byCanonical.get(canonicalKey(entity));
  if (exact) return exact;

  for (const node of nodes) {
    if (node.type !== entity.type) continue;
    if (node.id === entity.id) return node.id; // belt-and-suspenders
    if (isFuzzyDuplicate(entity.label || entity.id, node.label || node.id)) {
      return node.id;
    }
  }
  return undefined;
}

// Re-point a link's endpoints through an id-remap (absorbed id → survivor id).
// Shared by the alias-fold (drift duplicate folded into an existing node) and the
// model-driven `merge` op so there's one remap implementation. Endpoints may be
// raw strings or, post-simulation, node refs — normalise to ids.
export function remapLinkEndpoints(
  link: GraphLink,
  remap: ReadonlyMap<string, string>
): { source: string; target: string } {
  const src = typeof link.source === "string" ? link.source : link.source.id;
  const tgt = typeof link.target === "string" ? link.target : link.target.id;
  return {
    source: remap.get(src) ?? src,
    target: remap.get(tgt) ?? tgt,
  };
}
