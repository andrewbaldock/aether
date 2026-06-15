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

// The capability vocabulary. Keep aligned with the backend render tools and the
// planner's PlanCapability.
export type Capability =
  | "table"
  | "chart"
  | "timeline"
  | "knowledge-graph"
  | "images";

export interface PlanIntent {
  capability: Capability;
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
