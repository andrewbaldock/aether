// Knowledge-graph types. The WIRE PAYLOAD (what Claude emits via build_knowledge_graph,
// what crosses the tool_result seam) now lives in the shared FE↔BE contract
// (shared/contract, plan 001) and is re-exported here. The LIVE-SIMULATION render types
// (GraphNode/GraphLink) are frontend-only — d3-force mutates x/y/vx/vy in place — so they
// are intentionally NOT part of the contract and stay here.

import type { RawEntity } from "@contract/widgets";

export type {
  EntityType,
  GraphPayload,
  RawEntity,
  RawRelationship,
} from "@contract/widgets";

// A node in the live simulation. d3-force mutates x/y/vx/vy in place; fx/fy pin a
// node when dragged (unused in v1 but part of the type d3 expects).
export interface GraphNode extends RawEntity {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

// A link. d3-force replaces the string endpoints with node object references once
// the simulation initialises, so source/target are `string | GraphNode`.
export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  label?: string;
}
