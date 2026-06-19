// Cross-cutting contracts that neither the shell nor any single widget owns:
//   • Capability       — the five-way capability vocabulary, aligned with the
//                         backend render tools / planner PlanCapability.
//   • CompositionPlan  — the abstract plan the backend planner emits over the
//                         `plan` SSE event: WHICH capabilities participate and HOW
//                         they relate — never WHERE (no coordinates, sizes, card
//                         ids, or widget vocabulary). Mirrors backend/src/planner.ts.
//   • TilesLayoutItem  — one placed card in grid units, persisted in the session's
//                         ui_state.tilesLayout and mirrored by GridStack's node.
//
// These live in lib/ (a neutral home) so the shell's event bus and the session
// hooks can type against them WITHOUT reaching into capabilities/widgets/Bigsail/.
// Bigsail consumes them like any other consumer; it does not own them.

// The capability vocabulary + the composition plan now live in the shared FE↔BE
// contract (shared/contract, plan 001) — they ride the `plan` SSE event, so both sides
// import one definition. Re-exported here so existing `lib/composition` importers are
// unchanged. TilesLayoutItem stays below (it's a persisted jsonb shape, not a wire event).
export type {
  Capability,
  CompositionPlan,
  PlanIntent,
  PlanRelationship,
} from "@contract/plan";

// One placed card in grid units. Mirrors the backend UiState.tilesLayout shape and
// GridStack's serialized node ({id,x,y,w,h}).
export interface TilesLayoutItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  // True once the USER has dragged/resized this card. User-moved cards are pinned
  // (restored verbatim, never auto-rejiggered); everything else is re-packed by the
  // template on each card-set change, so e.g. a late-hydrating KG re-pairs with the
  // timeline instead of being dumped in a gap. Absent/false → auto-arranged.
  userMoved?: boolean;
}
