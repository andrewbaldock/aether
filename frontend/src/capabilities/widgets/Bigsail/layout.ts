// PARKED — future graph/flowchart surface. The Tiles canvas (GridStack) replaced
// this for the current pass, but this pure layout engine is kept intentionally:
// it's the seam for the planned "web of ideas" surface where the planner's
// composition plan becomes a node-graph of cards connected by edges. The
// flowchart ordering + edge derivation here is exactly what that surface needs;
// don't delete it. Tested in layout.test.ts. Not imported by the active Tiles path.
//
// Pure, framework-free: given cards, a mode, and the viewport, it returns absolute
// (x,y) positions plus an edge list. NO DOM measurement, NO state — same input
// always yields the same output. The optional plan steers flowchart ordering and
// turns relationships into edges; it never supplies geometry.

import type { Card } from "./cards";
import type { CompositionPlan } from "./plan";

export type LayoutMode = "masonry" | "flowchart";

export interface Viewport {
  width: number;
  height: number;
}

export interface Positioned extends Card {
  x: number;
  y: number;
}

export interface Edge {
  from: string; // card id
  to: string; // card id
  label?: string;
}

export interface LayoutResult {
  cards: Positioned[];
  edges: Edge[];
}

// Gap between cards in both layouts.
const GUTTER = 28;
// Outer padding so cards don't hug the world origin.
const PAD = 32;
// Minimum sensible column count when the viewport is tiny/unknown.
const MIN_COLUMNS = 1;

// Shortest-column-next masonry packing. Columns are fixed-width lanes; each card
// drops into the currently-shortest column. Deterministic given card order →
// identical every render. Card widths vary by type, so lane width is the widest
// card width (keeps columns aligned without measuring).
function masonry(cards: Card[], vp: Viewport): Positioned[] {
  if (cards.length === 0) return [];

  const laneWidth = Math.max(...cards.map((c) => c.sizeHint.w));
  const usable = Math.max(vp.width - PAD * 2, laneWidth);
  const columns = Math.max(
    MIN_COLUMNS,
    Math.floor((usable + GUTTER) / (laneWidth + GUTTER))
  );

  // Running y-offset (height) of each column.
  const colHeights = new Array<number>(columns).fill(PAD);
  const out: Positioned[] = [];

  for (const card of cards) {
    // Pick the shortest column; ties go to the leftmost for determinism.
    let col = 0;
    for (let i = 1; i < columns; i++) {
      if (colHeights[i]! < colHeights[col]!) col = i;
    }
    const x = PAD + col * (laneWidth + GUTTER);
    const y = colHeights[col]!;
    out.push({ ...card, x, y });
    colHeights[col] = y + card.sizeHint.h + GUTTER;
  }

  return out;
}

// Flowchart layout: cards laid out in source order on a generous grid so the
// connector geometry is clean. v1 (no plan / no relationships) returns edges:[];
// the arrangement is connector-ready. When a plan arrives, cards are ordered by
// the plan's intents and relationships become edges (data into the existing edge
// render path — no geometry from the planner).
function flowchart(
  cards: Card[],
  vp: Viewport,
  plan?: CompositionPlan
): LayoutResult {
  if (cards.length === 0) return { cards: [], edges: [] };

  // Order cards by the plan's intents when present: group cards by capability and
  // hand them out in intent order. Cards with no matching intent keep source order
  // at the end. Stable + deterministic.
  const ordered = plan ? orderByPlan(cards, plan) : cards;

  const laneWidth = Math.max(...ordered.map((c) => c.sizeHint.w));
  const usable = Math.max(vp.width - PAD * 2, laneWidth);
  // Flowchart wants wider gutters than masonry so arrows have room to breathe.
  const gutter = GUTTER * 2;
  const columns = Math.max(
    MIN_COLUMNS,
    Math.floor((usable + gutter) / (laneWidth + gutter))
  );

  // Row-major grid placement; row height is the tallest card in that row so rows
  // don't overlap.
  const out: Positioned[] = [];
  let rowTopY = PAD;
  let rowMaxH = 0;
  ordered.forEach((card, i) => {
    const col = i % columns;
    if (col === 0 && i > 0) {
      rowTopY += rowMaxH + gutter;
      rowMaxH = 0;
    }
    const x = PAD + col * (laneWidth + gutter);
    out.push({ ...card, x, y: rowTopY });
    rowMaxH = Math.max(rowMaxH, card.sizeHint.h);
  });

  const edges = plan ? edgesFromPlan(ordered, plan) : [];
  return { cards: out, edges };
}

// Order cards to match the plan's intent sequence. Each intent consumes the next
// unused card of its capability; leftovers (no matching intent) append in source
// order. Deterministic.
function orderByPlan(cards: Card[], plan: CompositionPlan): Card[] {
  const byCap = new Map<string, Card[]>();
  for (const c of cards) {
    const list = byCap.get(c.capabilityType) ?? [];
    list.push(c);
    byCap.set(c.capabilityType, list);
  }
  const used = new Set<string>();
  const ordered: Card[] = [];
  for (const intent of plan.intents) {
    const pool = byCap.get(intent.capability);
    const next = pool?.find((c) => !used.has(c.id));
    if (next) {
      ordered.push(next);
      used.add(next.id);
    }
  }
  for (const c of cards) if (!used.has(c.id)) ordered.push(c);
  return ordered;
}

// Translate the plan's index-pair relationships into card-id edges, using the same
// intent→card assignment orderByPlan used. A relationship index that doesn't map
// to a placed card is skipped (the plan may reference a capability that produced
// no card this turn).
function edgesFromPlan(ordered: Card[], plan: CompositionPlan): Edge[] {
  // Re-derive intent index → card id by walking intents in order against the
  // ordered cards, matching by capability (mirrors orderByPlan's assignment).
  const intentCard: (string | undefined)[] = [];
  const used = new Set<string>();
  for (const intent of plan.intents) {
    const match = ordered.find(
      (c) => c.capabilityType === intent.capability && !used.has(c.id)
    );
    if (match) {
      used.add(match.id);
      intentCard.push(match.id);
    } else {
      intentCard.push(undefined);
    }
  }

  const edges: Edge[] = [];
  for (const rel of plan.relationships) {
    const from = intentCard[rel.from];
    const to = intentCard[rel.to];
    if (from && to && from !== to) {
      edges.push({ from, to, label: rel.label });
    }
  }
  return edges;
}

export function layout(
  cards: Card[],
  mode: LayoutMode,
  vp: Viewport,
  plan?: CompositionPlan
): LayoutResult {
  if (mode === "flowchart") return flowchart(cards, vp, plan);
  return { cards: masonry(cards, vp), edges: [] };
}
