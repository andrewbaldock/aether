import type { GraphSnapshot } from "./useKnowledgeGraphState";

// Shallow shape guard for a persisted graph snapshot. Deliberately not a full
// schema validator — it catches BREAKING shape drift / corruption that slips
// through without a schemaVersion bump. The version stamp is the primary signal;
// this is the safety net. Additive optional fields pass through untouched.
export function isGraphSnapshot(v: unknown): v is GraphSnapshot {
  if (!v || typeof v !== "object") return false;
  const { nodes, links } = v as { nodes?: unknown; links?: unknown };
  if (!Array.isArray(nodes) || !Array.isArray(links)) return false;
  // Spot-check the first node has the identifying fields we depend on.
  if (nodes.length > 0) {
    const n = nodes[0] as Record<string, unknown>;
    if (typeof n.id !== "string" || typeof n.type !== "string") return false;
  }
  return true;
}

// Whether a loaded (but invalid) blob actually held graph content worth warning
// about. A brand-new session returns an empty/null graph with no stamp — that's
// not a "reset", it's just empty — so we suppress the toast there and only fire
// when there were genuinely persisted nodes that we're discarding.
export function hasSavedContent(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const { nodes } = raw as { nodes?: unknown };
  return Array.isArray(nodes) && nodes.length > 0;
}
