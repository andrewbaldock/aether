// Per-tool versioning for persisted JSON state.
//
// Every tool that persists structured JSON (the knowledge graph, the render-tool
// widget specs, the Tiles layout) stamps its blob with a schemaVersion integer.
// On load we compare the stored stamp against the tool's CURRENT version and run
// a shallow shape guard. A mismatch — old version, missing stamp, or corrupt
// shape — means we DISCARD the blob and fall back to first-run (empty) state, so
// stale JSON from an older shape can never render. The next conversation turn
// repopulates it naturally (these snapshots are turn byproducts; we never fire a
// Claude call just to rebuild them — see docs/ARCHITECTURE.md).
//
// Each tool owns its OWN integer here — there is no global app version, and no
// forward-migration chain. We regenerate, never migrate.
//
// VERSION-BUMP POLICY:
//   - BUMP a tool's number on a BREAKING shape change: rename/remove a field,
//     change a field's type, restructure nesting. Bumping is the deliberate lever
//     to blow away every already-saved blob for that tool.
//   - DON'T bump for purely additive optional fields — read those defensively
//     (`x ?? default`) on load; the old blobs stay valid.
//   - The shape guard is the safety net for corruption/partial writes that slip
//     through WITHOUT a bump.
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

// Validate a loaded blob. Returns the payload only when its stamp matches the
// tool's CURRENT version AND it passes the supplied shape guard; otherwise null
// (→ caller clears to first-run state and toasts). Missing/old/NaN stamps and
// guard failures are all treated the same: discard.
export function validate<T>(
  key: VersionedKey,
  raw: unknown,
  guard: (v: unknown) => v is T
): T | null {
  if (!raw || typeof raw !== "object") return null;
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version !== SCHEMA_VERSIONS[key]) return null;
  return guard(raw) ? raw : null;
}
