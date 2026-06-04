// The shape Claude emits via build_knowledge_graph, and the merged graph the
// widget renders. The node/link types extend d3-force's mutable simulation
// fields (x/y/vx/vy) so the simulation can write positions in place.

export type EntityType = "person" | "place" | "concept" | "org" | "event";

// One entity as it arrives in a tool_result payload.
export interface RawEntity {
  id: string;
  label: string;
  type: EntityType;
  wikipediaTitle?: string;
}

// One relationship as it arrives in a tool_result payload.
export interface RawRelationship {
  from: string;
  to: string;
  label?: string;
}

// The full payload of one build_knowledge_graph call.
export interface GraphPayload {
  entities: RawEntity[];
  relationships: RawRelationship[];
}

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
