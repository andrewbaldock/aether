// The abstract composition plan the backend planner emits over the `plan` SSE event:
// WHICH capabilities participate and HOW they relate — never WHERE (no coordinates,
// sizes, or card ids). Part of the wire contract (it rides the `plan` SSE event), so
// it lives here as the single source of truth (plan 001). Was previously declared in
// backend/src/planner.ts AND frontend/src/lib/composition.ts ("Mirrors backend…").

// The capability vocabulary, aligned with the backend render tools / planner.
export type Capability =
  | "table"
  | "chart"
  | "timeline"
  | "knowledge-graph"
  | "images";

export interface PlanIntent {
  capability: Capability;
  // Optional human-readable subject; used to order/label cards, never required.
  subject?: string;
}

export interface PlanRelationship {
  // Indices into intents[]. Directed: from → to.
  from: number;
  to: number;
  label?: string;
}

export interface CompositionPlan {
  intents: PlanIntent[];
  relationships: PlanRelationship[];
}
