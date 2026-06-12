// The abstract composition plan the backend planner emits over the new `plan` SSE
// event. It says WHICH capabilities participate and HOW they relate — never WHERE
// (no coordinates, sizes, card ids, or Bigsail vocabulary). Bigsail is the first
// consumer; any future consumer maps this to its own geometry. Mirrors the backend
// CompositionPlan shape in backend/src/planner.ts.

import type { CardCapability } from "./cards";

export interface PlanIntent {
  capability: CardCapability;
  // Optional human-readable subject ("France/Germany/Spain populations"). Used to
  // order/label cards; never required.
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
