// Bigsail's card model. A Card is a thin wrapper around an EXISTING widget spec
// (table / chart / timeline / images) or the knowledge graph — never a new spec
// type. The canvas derives Card[] from the same per-widget state hooks the tabs
// read, runs the layout engine over them, and renders each card with the shared
// Spec* renderer. Bigsail "mirrors" the tabs: every spec that appears in a tab
// also appears here as a live card.

import type { ChartSpec } from "../Chart/types";
import type { ImagesSpec } from "../Images/types";
import type { GraphLink, GraphNode } from "../KnowledgeGraph/types";
import type { TableSpec } from "../Table/types";
import type { TimelineSpec } from "../Timeline/types";

export type CardCapability =
  | "table"
  | "chart"
  | "timeline"
  | "knowledge-graph"
  | "images";

export interface SizeHint {
  w: number;
  h: number;
}

// The knowledge graph collapses to a single whole-graph card in v1, so its spec
// is the live nodes+links snapshot. toCards keeps this as the seam where a future
// per-node split could live. `title` is the conversation title, shown as the card
// header so the graph card reads as "the graph of THIS conversation".
export interface GraphCardSpec {
  nodes: GraphNode[];
  links: GraphLink[];
  title?: string;
}

export type CardSpec =
  | TableSpec
  | ChartSpec
  | TimelineSpec
  | ImagesSpec
  | GraphCardSpec;

export interface Card<S extends CardSpec = CardSpec> {
  // Stable across re-derivations: `${capabilityType}:${sourceEntryId}`. The KG
  // card has a fixed id since it's a singleton.
  id: string;
  capabilityType: CardCapability;
  // The EXISTING widget spec, rendered by the shared Spec* component. Null only
  // for a placeholder skeleton card (no data yet — see placeholder).
  spec: S;
  // Derived purely from the spec (no DOM measurement) so the layout is identical
  // on every load and every device.
  sizeHint: SizeHint;
  // True for a skeleton card placed from the composition plan BEFORE its tool has
  // returned. It occupies its real masonry slot (same capabilityType → same span)
  // and renders a shimmer; a real card of the same capability supersedes it the
  // instant its tool_result lands. `spec` is a typed-but-empty stand-in.
  placeholder?: boolean;
}

// Default size hint for a capability, used both as the base for content growth
// (sizeHintFor) and as a skeleton's size before any data exists. Exported so the
// skeleton builder sizes placeholders identically to the real card they precede.
export function baseSizeHint(type: CardCapability): SizeHint {
  return BASE_SIZE[type];
}

// Starting size hints per capability. Heights for content-bearing cards grow with
// the amount of content so the masonry packer doesn't clip; widths are fixed per
// type. Tuned by eye — these are the only "magic numbers" and they're all here.
const BASE_SIZE: Record<CardCapability, SizeHint> = {
  table: { w: 420, h: 280 },
  chart: { w: 360, h: 320 },
  timeline: { w: 560, h: 220 },
  images: { w: 280, h: 420 },
  "knowledge-graph": { w: 480, h: 480 },
};

// Per-capability height growth. Pure function of the spec's content count, capped
// so one huge result can't produce a 4000px card. Width never changes (masonry
// packs by column).
export function sizeHintFor(card: {
  capabilityType: CardCapability;
  spec: CardSpec;
}): SizeHint {
  const base = BASE_SIZE[card.capabilityType];
  switch (card.capabilityType) {
    case "table": {
      const rows = (card.spec as TableSpec).rows?.length ?? 0;
      // ~28px/row over the header; cap at ~16 rows of visible growth.
      return { w: base.w, h: base.h + Math.min(rows, 16) * 28 };
    }
    case "timeline": {
      const items = (card.spec as TimelineSpec).items?.length ?? 0;
      return { w: base.w, h: base.h + Math.min(items, 12) * 36 };
    }
    case "images": {
      const imgs = (card.spec as ImagesSpec).images?.length ?? 0;
      // Masonry of ~2 columns; every ~2 images adds a row.
      return { w: base.w, h: base.h + Math.ceil(Math.min(imgs, 12) / 2) * 120 };
    }
    // Chart and knowledge-graph render into a fixed box.
    default:
      return base;
  }
}

// The live entry shape every render-tool state hook exposes ({ id, spec }).
interface SpecEntry<S extends CardSpec> {
  id: number;
  spec: S;
}

export interface ToCardsInput {
  table: SpecEntry<TableSpec>[];
  chart: SpecEntry<ChartSpec>[];
  timeline: SpecEntry<TimelineSpec>[];
  images: SpecEntry<ImagesSpec>[];
  // The KG is whole-graph state, not an entry list. Present only when it has nodes.
  graph: GraphCardSpec | null;
}

function makeCard(
  capabilityType: CardCapability,
  sourceId: string | number,
  spec: CardSpec
): Card {
  return {
    id: `${capabilityType}:${sourceId}`,
    capabilityType,
    spec,
    sizeHint: sizeHintFor({ capabilityType, spec }),
  };
}

// Derive the full card list from the five capability states. Order is stable and
// deterministic (graph first, then table/chart/timeline/images in arrival order)
// so the layout engine produces an identical arrangement on every load. A future
// per-node graph split lives right here.
export function toCards(input: ToCardsInput): Card[] {
  const cards: Card[] = [];
  if (input.graph && input.graph.nodes.length > 0) {
    cards.push(makeCard("knowledge-graph", "graph", input.graph));
  }
  for (const e of input.table) cards.push(makeCard("table", e.id, e.spec));
  for (const e of input.chart) cards.push(makeCard("chart", e.id, e.spec));
  for (const e of input.timeline)
    cards.push(makeCard("timeline", e.id, e.spec));
  for (const e of input.images) cards.push(makeCard("images", e.id, e.spec));
  return cards;
}
