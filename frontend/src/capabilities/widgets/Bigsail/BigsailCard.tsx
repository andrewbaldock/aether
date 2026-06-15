import { ResponsiveContainer } from "recharts";
import { SpecChart } from "../Chart/ChartWidget";
import type { ChartSpec } from "../Chart/types";
import { SpecImages } from "../Images/ImagesWidget";
import type { ImagesSpec } from "../Images/types";
import { ForceGraph } from "../KnowledgeGraph/ForceGraph";
import { SpecTable } from "../Table/TableWidget";
import type { TableSpec } from "../Table/types";
import { SpecTimeline } from "../Timeline/TimelineWidget";
import type { TimelineSpec } from "../Timeline/types";
import type { Card, GraphCardSpec } from "./cards";
import { SkeletonCard } from "./SkeletonCard";

// One card's CONTENTS on the Tiles canvas. It renders the SAME shared Spec*
// renderer the tab widgets use (the canonical single-spec components) — Bigsail
// adds no render code, it just places them. Positioning/sizing/border/drag are
// owned by the GridStack grid item that wraps this (see TilesCanvas/CardShell);
// this component is purely the live widget body.
//
// Cards are HTML (not SVG foreignObject) so recharts' ResponsiveContainer and
// tanstack-table measure against real DOM.

function CardBody({ card }: { card: Card }) {
  // A planned-but-not-yet-filled card: shimmer in its capability's silhouette
  // until its tool_result lands and a real card supersedes it.
  if (card.placeholder) return <SkeletonCard type={card.capabilityType} />;

  switch (card.capabilityType) {
    case "chart": {
      const spec = card.spec as ChartSpec;
      // Chart needs a sizing wrapper. Title now lives in the card's top bar
      // (CardShell), so it's omitted here. We render the axis TITLES ourselves in a
      // dedicated frame — a vertical strip on the left for the y-label, a strip
      // along the bottom for the x-label — and pass hideAxisLabels so recharts draws
      // only ticks + plot. That lets the chart fill the rest of the card instead of
      // recharts reserving (and clipping) room for a rotated label at the edge.
      return (
        <div className="flex h-full flex-col px-3 pt-3 pb-2">
          <div className="flex min-h-0 flex-1">
            {spec.yLabel ? (
              <div className="flex shrink-0 items-center justify-center pr-1">
                <span className="[writing-mode:vertical-rl] rotate-180 text-xs text-content-subtle">
                  {spec.yLabel}
                </span>
              </div>
            ) : null}
            <div className="min-h-0 min-w-0 flex-1">
              {/* Positive initialDimension: GridStack sizes this cell a tick after
                  mount, so recharts' default -1×-1 seed would log "width(-1) and
                  height(-1)" on every card mount. The ResizeObserver corrects it
                  next frame, so the seed is never visible. */}
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 100, height: 100 }}
              >
                <SpecChart spec={spec} hideAxisLabels />
              </ResponsiveContainer>
            </div>
          </div>
          {spec.xLabel ? (
            <div className="shrink-0 pt-1 text-center text-xs text-content-subtle">
              {spec.xLabel}
            </div>
          ) : null}
        </div>
      );
    }
    case "table": {
      const spec = card.spec as TableSpec;
      // Title now lives in the card's top bar (CardShell), so it's omitted here.
      // Plain overflow-auto (no overscroll-*): a wheel that reaches the card's scroll
      // edge chains OUT to pan the canvas — the long-standing behavior (scroll a
      // table to its bottom, keep going, the whole Bigsail moves).
      return (
        <div className="flex h-full flex-col overflow-auto">
          <SpecTable spec={spec} title={spec.title} />
        </div>
      );
    }
    case "timeline":
      // Title lives in the card's top bar (CardShell) → hideTitle here.
      return (
        <div className="h-full overflow-auto p-3">
          <SpecTimeline spec={card.spec as TimelineSpec} hideTitle />
        </div>
      );
    case "images":
      // Title lives in the card's top bar (CardShell) → hideTitle here.
      return (
        <div className="h-full overflow-auto p-3">
          <SpecImages spec={card.spec as ImagesSpec} hideTitle />
        </div>
      );
    case "knowledge-graph": {
      const spec = card.spec as GraphCardSpec;
      // The live force graph as one card, titled with the conversation so it reads
      // as "the graph of THIS conversation". Its own d3-zoom handles in-card
      // pan/zoom; gestures starting inside .bigsail-card are excluded from the
      // canvas zoom.
      // Title now lives in the card's top bar (CardShell), so it's omitted here.
      return (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            <ForceGraph
              nodes={spec.nodes}
              links={spec.links}
              selectedId={null}
              onSelect={() => {}}
            />
          </div>
          {/* read-only: no pin/remove/explore/persistence wiring on the canvas */}
        </div>
      );
    }
    default:
      return null;
  }
}

export function BigsailCard({ card }: { card: Card }) {
  // Fills the grid item; the wrapper (CardShell) owns the frame + drag handle.
  return (
    <div className="h-full w-full overflow-hidden">
      <CardBody card={card} />
    </div>
  );
}
