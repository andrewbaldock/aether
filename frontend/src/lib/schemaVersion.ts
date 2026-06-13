// Per-tool versioning for persisted JSON state.
//
// Every tool that persists structured JSON (the knowledge graph, the render-tool
// widget specs, the Tiles layout) stamps its blob with a schemaVersion integer.
//
// LOAD PHILOSOPHY: do everything possible to RENDER the user's data — never show
// them an error, never silently wipe their work. The only thing that can reject a
// blob is the shape GUARD (genuinely corrupt / structurally wrong data that can't
// render). The version stamp is advisory: a stale-or-missing stamp does NOT
// discard. We render the old-shaped blob best-effort and HEAL it — re-save it
// with the current stamp on load — so the mismatch resolves itself. (The next
// tool re-run would re-stamp it anyway; healing on load just does it sooner.)
//
// Toasts about resets are DEV-ONLY (see shell/toast.ts) — users should never see
// versioning churn.
//
// Each tool owns its OWN integer here — there is no global app version, and no
// forward-migration chain.
//
// VERSION-BUMP POLICY:
//   - BUMP a tool's number on a BREAKING shape change so the stored stamp drifts
//     from current and the blob gets re-stamped (healed) on next load/save. This
//     is bookkeeping, NOT a wipe — old data still renders if its shape passes the
//     guard, so pair a breaking bump with a guard that rejects the old shape if
//     it genuinely can't render.
//   - DON'T bump for purely additive optional fields — read those defensively
//     (`x ?? default`) on load; the old blobs stay valid and current.
export const SCHEMA_VERSIONS = {
  graph: 1,
  widgets: 1,
  tilesLayout: 1,
} as const;

export type VersionedKey = keyof typeof SCHEMA_VERSIONS;

// A persisted blob carries its stamp inline alongside its payload, e.g.
// `{ schemaVersion: 1, nodes: [...], links: [...] }`.
export type Versioned<T> = T & { schemaVersion: number };

// Stamp a payload with the tool's current version, ready to persist.
export function stamp<T extends object>(
  key: VersionedKey,
  data: T
): Versioned<T> {
  return { ...data, schemaVersion: SCHEMA_VERSIONS[key] };
}

// Result of validating a loaded blob.
//   - data: the payload to render, or null ONLY when the shape guard rejects it
//     (truly unusable data). A stale/missing version never lands here as null.
//   - stale: true when data is usable but its stamp wasn't the current version
//     (old or missing). The caller should re-save (heal) so the stamp catches up.
export type ValidateResult<T> = {
  data: T | null;
  stale: boolean;
};

// Validate a loaded blob. The shape GUARD is the only gate on whether we render:
// pass → render, fail → null. The version is advisory — a mismatch flags `stale`
// (→ caller heals by re-saving) but does NOT discard usable data. We never wipe
// the user's work over a version number.
export function validate<T>(
  key: VersionedKey,
  raw: unknown,
  guard: (v: unknown) => v is T
): ValidateResult<T> {
  if (!guard(raw)) return { data: null, stale: false };
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  return { data: raw, stale: version !== SCHEMA_VERSIONS[key] };
}
