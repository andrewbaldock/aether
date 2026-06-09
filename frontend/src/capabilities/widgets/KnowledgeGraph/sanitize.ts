// Last-line-of-defence sanitisation for the data ForceGraph hands to d3-force.
// d3-force's forceLink resolves every link's source/target against the node set
// and throws "node not found: <id>" — synchronously and uncaught — the instant an
// endpoint doesn't resolve. A duplicate node id, meanwhile, trips React's "two
// children with the same key" warning and confuses the keyed render. The reducer
// (useKnowledgeGraphState) tries to keep nodes/links consistent, but a persisted
// snapshot, a loadGraph race, or any future reducer bug can still deliver a
// dangling link or a duplicate id. These pure helpers make the view crash-proof:
// dedupe nodes by id (first wins) and drop links whose endpoint isn't a live node.

import type { GraphLink, GraphNode } from "./types";

// A link endpoint is a string id pre-simulation, or a node ref once d3 has bound
// it. Normalise either to its id.
export function endpointId(endpoint: string | GraphNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

// Collapse nodes sharing an id, keeping the first occurrence. Guards the keyed
// render against duplicate-key warnings regardless of how the dup arose upstream.
export function dedupeNodes(nodes: readonly GraphNode[]): GraphNode[] {
  const seen = new Set<string>();
  const out: GraphNode[] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

// Drop any link with an endpoint absent from `liveIds`. This is the guarantee
// that forceLink never sees a dangling endpoint and never throws.
export function filterDanglingLinks(
  links: readonly GraphLink[],
  liveIds: ReadonlySet<string>
): GraphLink[] {
  return links.filter(
    (l) =>
      liveIds.has(endpointId(l.source)) && liveIds.has(endpointId(l.target))
  );
}
