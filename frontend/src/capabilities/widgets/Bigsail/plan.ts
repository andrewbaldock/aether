// The abstract composition plan the backend planner emits over the `plan` SSE
// event. It says WHICH capabilities participate and HOW they relate — never WHERE
// (no coordinates, sizes, card ids, or Bigsail vocabulary). Bigsail is the first
// consumer; any future consumer maps this to its own geometry.
//
// The canonical definitions now live in the neutral lib/composition module (so the
// shell can type against them without depending on this widget); this file re-exports
// them for the Bigsail-local import path. Mirrors backend/src/planner.ts.
export type {
  CompositionPlan,
  PlanIntent,
  PlanRelationship,
} from "../../../lib/composition";
