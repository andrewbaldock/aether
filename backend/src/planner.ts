import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "./anthropicClient";

// The Strongification intelligence pre-pass: a cheap router that decides whether a
// turn is complex enough to warrant planning, and a conditional planner that emits
// an ABSTRACT composition plan (which capabilities + how they relate — never
// coordinates). The plan has two consumers: the agent loop (folded into the
// conversation preamble to steer tool choice) and Bigsail (over the new `plan` SSE
// event, to order cards and draw flowchart edges). The planner knows NOTHING about
// Bigsail — see the frontend mirror in
// frontend/src/capabilities/widgets/Bigsail/plan.ts.
//
// Everything here runs on Haiku regardless of the conversation's selected model
// (like generateTitle) so it's the cheapest call we make, and it's best-effort:
// any failure returns null and the turn proceeds exactly as before.

// The capability vocabulary + composition-plan shapes now live in the shared FE↔BE
// contract (shared/contract, plan 001) — they ride the `plan` SSE event, so one
// definition serves both sides. Re-exported here so existing planner imports are
// unchanged. `PlanCapability` is kept as a local alias of the contract's `Capability`.
import type {
  Capability,
  CompositionPlan,
  PlanIntent,
  PlanRelationship,
} from "@contract/plan";

export type PlanCapability = Capability;
// Re-export so existing importers of these from ./planner are unchanged.
export type { CompositionPlan, PlanIntent, PlanRelationship };

// A clarifying pre-pass result: when a request is THIN but one well-aimed question
// would massively expand a rich answer ("explode the concept"), the planner asks
// that ONE question first — with concrete, tappable options — instead of composing
// a flat reply. 2–4 options; the frontend also always allows a free-form answer.
export interface ClarifyResult {
  question: string;
  options: string[];
}

// The planner's verdict for a turn. Exactly one of:
// - { kind: "plan" }    — today's composition path (multi-capability turn)
// - { kind: "clarify" } — ask one expanding question first, then compose next turn
// - null                — plain ReAct (most turns)
export type PlannerResult =
  | { kind: "plan"; plan: CompositionPlan }
  | { kind: "clarify"; clarify: ClarifyResult }
  | null;

const PLANNER_MODEL = "claude-haiku-4-5-20251001";

const VALID_CAPABILITIES: ReadonlySet<string> = new Set<PlanCapability>([
  "table",
  "chart",
  "timeline",
  "knowledge-graph",
  "images",
]);

// --- Router heuristic ------------------------------------------------------
// The cheap gate BEFORE any model call. Most turns ("what's 2+2", "thanks",
// short factual asks) plainly don't need a multi-capability plan; skipping them
// keeps the planner from firing on every turn. We only escalate to the classifier
// when a turn LOOKS like it might compose several capabilities: it's long, or it
// uses shapes that signal multiple outputs ("compare … and chart", "timeline of",
// "table of", "and", "vs"). Conservative on purpose — a false negative just means
// the turn runs as plain ReAct (today's behaviour); a false positive costs one
// cheap Haiku call.

const PLAN_SHAPE_HINTS = [
  /\bcompare\b/i,
  /\bvs\.?\b/i,
  /\bversus\b/i,
  /\btimeline\b/i,
  /\bchart\b/i,
  /\bgraph\b/i,
  /\btable\b/i,
  /\bmap out\b/i,
  /\bbreak down\b/i,
  /\band\b.*\b(chart|table|timeline|graph|images?|map)\b/i,
];

export function mightNeedPlan(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 40) return false; // short turns are almost never multi-capability
  if (PLAN_SHAPE_HINTS.some((re) => re.test(trimmed))) return true;
  // Long, multi-clause asks (several sentences / conjunctions) are plausible
  // candidates even without an explicit shape word.
  const clauses = trimmed.split(/[,;]|\band\b|\bthen\b/i).length;
  return trimmed.length > 160 || clauses >= 3;
}

// --- Clarifier gate --------------------------------------------------------
// A SEPARATE, looser gate from mightNeedPlan: the clarifier's target is exactly
// the short, broad question mightNeedPlan skips ("how many kinds of art are
// there?"). So this can't inherit the <40-char bail. We still want to stay cheap,
// so we cull the turns a clarifier could never help: greetings/acks, and
// trivially-closed questions (arithmetic, yes/no, single-fact lookups) that have
// one right answer no clarification could expand. Everything else is a candidate —
// the Haiku call itself makes the real "is it explodable?" judgment.

// Greetings / acknowledgements — no question to explode.
const CLARIFY_SKIP_GREETING =
  /^(hi|hey|hello|yo|sup|thanks?|thank you|thx|ok(ay)?|cool|nice|great|got it|sure|yes|no|nope|yeah|yep)\b[\s!.?]*$/i;

// Looks like simple arithmetic ("what's 2+2", "12 * 7?") — one right answer.
const CLARIFY_SKIP_ARITHMETIC = /^[\s\d+\-*/^().,%×÷=]+\??$/;
const CLARIFY_ARITHMETIC_WITH_LEAD =
  /^(what'?s|whats|calculate|compute|how much is)\b[\s\d+\-*/^().,%×÷=]+\??$/i;

export function mightClarify(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (CLARIFY_SKIP_GREETING.test(trimmed)) return false;
  if (CLARIFY_SKIP_ARITHMETIC.test(trimmed)) return false;
  if (CLARIFY_ARITHMETIC_WITH_LEAD.test(trimmed)) return false;
  return true;
}

// --- Planner ---------------------------------------------------------------
// One structured Haiku call. Asks for the ordered capabilities a good answer would
// compose and how they relate, as strict JSON. Best-effort: returns null on any
// failure (no key, bad JSON, empty plan) and the turn runs as plain ReAct.

const PLANNER_SYSTEM = `You are the planner for Aether, a conversational explorer that answers by rendering live widgets beside the chat.

You may be given recent conversation context followed by the latest request. Judge the request IN THAT CONTEXT: if it's a generic "build from what we've discussed", the conversation IS the subject — plan around it, never treat it as topicless.

Decide which of these capabilities a strong answer would compose, in the order they should appear, and how they relate:
- "table" — structured/tabular data, comparisons, ranked lists
- "chart" — quantitative trends, distributions, comparisons over a dimension
- "timeline" — chronological sequences, histories, schedules
- "knowledge-graph" — entities and how they connect
- "images" — photos/pictures of a subject

Reply with ONLY a JSON object, no prose, of this exact shape:
{"intents":[{"capability":"chart","subject":"short phrase"}],"relationships":[{"from":0,"to":1,"label":"short verb"}]}

Rules:
- intents: ordered; each capability is one of the five above; subject is a short phrase (optional).
- relationships: index pairs into intents (from/to), with an optional short label; only include real relationships, often none.
- Prefer 2-8 intents for any substantive request — compose a RICH canvas (e.g. a table AND a chart AND a timeline AND a knowledge-graph AND images), not the bare minimum; reach for several complementary capabilities whenever the subject supports them. If the request needs only a plain text reply, return {"intents":[],"relationships":[]}.
- NEVER include coordinates, sizes, or layout — only which capabilities and how they relate.

BEFORE planning, judge how fruitful this request is AS ASKED. If the request is THIN
but a single clarifying question would massively expand a rich answer (pick a
sub-area, a lens, a scope, an era), return a clarify object INSTEAD of a plan:
{"clarify":{"question":"one short question","options":["concrete option","concrete option","concrete option"]}}
- Only clarify when it genuinely EXPLODES the concept — e.g. "how many kinds of art are there?" → ask which tradition/era/medium to explore. Never clarify a request already rich or specific enough to answer well (a comparison, a named subject, a clear scope) — and never clarify when the conversation context already gives a clear subject to build from. Clarify only when there's truly little or nothing to go on.
- question: ONE short, friendly question. options: 2–4 concrete, tempting choices (not vague). The user can always answer free-form too, so make the options inviting starting points, not a cage.
- When you return a clarify object, return ONLY that object (no intents/relationships).`;

// Validate + coerce the model's JSON into a CompositionPlan, dropping anything
// malformed. Returns null if there's nothing usable (so callers skip the plan).
// Exported for unit testing — the rest of the module reaches it via planTurn.
export function parsePlan(raw: string): CompositionPlan | null {
  let data: unknown;
  try {
    // The model may wrap JSON in prose or a code fence despite instructions —
    // extract the first {...} block defensively.
    const match = raw.match(/\{[\s\S]*\}/);
    data = JSON.parse(match ? match[0] : raw);
  } catch {
    return null;
  }
  if (data == null || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  const rawIntents = Array.isArray(obj.intents) ? obj.intents : [];
  const intents: PlanIntent[] = [];
  for (const it of rawIntents) {
    if (it == null || typeof it !== "object") continue;
    const cap = (it as Record<string, unknown>).capability;
    if (typeof cap !== "string" || !VALID_CAPABILITIES.has(cap)) continue;
    const subject = (it as Record<string, unknown>).subject;
    intents.push({
      capability: cap as PlanCapability,
      ...(typeof subject === "string" && subject.trim()
        ? { subject: subject.trim() }
        : {}),
    });
  }
  if (intents.length === 0) return null; // nothing to compose → no plan

  const rawRels = Array.isArray(obj.relationships) ? obj.relationships : [];
  const relationships: PlanRelationship[] = [];
  for (const r of rawRels) {
    if (r == null || typeof r !== "object") continue;
    const from = (r as Record<string, unknown>).from;
    const to = (r as Record<string, unknown>).to;
    // Indices must point at real intents.
    if (
      typeof from !== "number" ||
      typeof to !== "number" ||
      from < 0 ||
      to < 0 ||
      from >= intents.length ||
      to >= intents.length ||
      from === to
    ) {
      continue;
    }
    const label = (r as Record<string, unknown>).label;
    relationships.push({
      from,
      to,
      ...(typeof label === "string" && label.trim()
        ? { label: label.trim() }
        : {}),
    });
  }

  return { intents, relationships };
}

// Extract a clarify object from the model's JSON, if present and well-formed.
// Returns null when there's no usable clarifier (no `clarify` key, empty/blank
// question, or no concrete options) so callers fall through to plan-or-ReAct.
// Exported for unit testing. We cap options at 4 and drop blanks — the prompt
// asks for 2–4, but the parse is the guardrail, not the prompt.
export function parseClarify(raw: string): ClarifyResult | null {
  let data: unknown;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    data = JSON.parse(match ? match[0] : raw);
  } catch {
    return null;
  }
  if (data == null || typeof data !== "object") return null;
  const clarify = (data as Record<string, unknown>).clarify;
  if (clarify == null || typeof clarify !== "object") return null;

  const question = (clarify as Record<string, unknown>).question;
  if (typeof question !== "string" || !question.trim()) return null;

  const rawOptions = (clarify as Record<string, unknown>).options;
  const options = (Array.isArray(rawOptions) ? rawOptions : [])
    .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
    .map((o) => o.trim())
    .slice(0, 4);
  // A clarifier with no concrete options is just an open question — that's worse
  // than answering. Require at least two tappable choices to be worth the wait.
  if (options.length < 2) return null;

  return { question: question.trim(), options };
}

// Run the router + planner for a turn. Returns a PlannerResult: a clarifier when
// the turn is thin-but-explodable, a plan when it warrants composition, else null
// (plain ReAct). `message` is the planner's view of the turn. `clarified` is true
// when this turn is itself the answer to a prior clarifier — it suppresses a second
// clarifier so we never interrogate in a loop, AND it FORCES the planner to run.
//
// Why force on clarified: a clarifier only fires on a thin-but-EXPLODABLE concept,
// and the answer ("Demons", a tapped chip) is by construction that explosion — the
// exact turn we most want to compose. But the answer alone is short, so the cheap
// mightNeedPlan gate (which bails under 40 chars) would skip it and we'd lose the
// skeletons. So on a clarified turn we never gate: we always make the Haiku call.
// (The caller feeds us the original question + answer as `message`, so the planner
// sees "magic → Demons", not a bare "Demons".)
//
// The two gates are otherwise independent: the clarifier targets the SHORT/broad
// turns mightNeedPlan skips, so on a turn that passes only the clarifier gate we
// still make the call. Best-effort throughout — never throws; any failure means no
// plan/clarify.
export async function planTurn(
  message: string,
  opts: { clarified?: boolean; prompt?: string } = {}
): Promise<PlannerResult> {
  if (!message) return null;
  // The cheap router gates on the RAW latest message (so greetings/arithmetic/short
  // turns still get culled), but the Haiku call sees `prompt` — the context-enriched
  // view (recent conversation tail) when the caller built one — so it judges
  // fruitfulness against what's actually been discussed. Falls back to `message`.
  const canClarify = !opts.clarified && mightClarify(message);
  // A clarified turn ALWAYS plans (see above) — never let the cheap gate skip the
  // very turn the clarifier set up to be rich.
  const canPlan = opts.clarified === true || mightNeedPlan(message);
  if (!canClarify && !canPlan) return null;

  const client = getAnthropicClient();
  if (!client) return null;

  try {
    const response = await client.messages.create({
      model: PLANNER_MODEL,
      max_tokens: 256,
      system: PLANNER_SYSTEM,
      messages: [{ role: "user", content: opts.prompt ?? message }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // Clarifier takes precedence on a thin-but-explodable turn — but only when
    // this turn isn't already a clarifier answer, and only when the model
    // actually returned a well-formed clarify object.
    if (canClarify) {
      const clarify = parseClarify(text);
      if (clarify) return { kind: "clarify", clarify };
    }
    const plan = parsePlan(text);
    return plan ? { kind: "plan", plan } : null;
  } catch (err) {
    console.error("planTurn failed:", err);
    return null;
  }
}

// Render the plan as a short natural-language preamble folded into the conversation
// so the agent loop is STEERED (not constrained) by it. Kept terse — it rides the
// conversation cache, appended once before the loop.
export function planPreamble(plan: CompositionPlan): string {
  const parts = plan.intents.map((it) =>
    it.subject ? `${it.capability} of ${it.subject}` : it.capability
  );
  let text = `Composition plan for this turn: compose ${parts.join(", then ")}.`;
  if (plan.relationships.length > 0) {
    const rels = plan.relationships
      .map((r) => {
        const from = plan.intents[r.from]?.capability;
        const to = plan.intents[r.to]?.capability;
        return `${from} ${r.label ?? "relates to"} ${to}`;
      })
      .join("; ");
    text += ` Relationships: ${rels}.`;
  }
  // Directive, not advisory, and biased toward PRODUCING output (this is a live
  // demo of what Aether can render): for each planned capability, design the best
  // version from the material and call its render tool. If a literal subject comes
  // back empty, BROADEN it and try again before giving up (no photos of "Mammon"?
  // search "demon" / "occult art"). Skipping is the rare last resort — only after a
  // broadened attempt truly yields nothing — and when you do skip, tell the user in
  // ONE warm, plain sentence why (never silently, never apologetically).
  text +=
    " For EACH capability above, design the best version from the material and call" +
    " its render tool — producing output is the goal. If a search comes back empty," +
    " broaden the query and try again before concluding a capability is empty. Only" +
    " if a broadened attempt still yields nothing should you skip it, and then note" +
    " that to the user in a single friendly sentence. You may also add a capability" +
    " the plan missed if the answer calls for it.";
  return text;
}
