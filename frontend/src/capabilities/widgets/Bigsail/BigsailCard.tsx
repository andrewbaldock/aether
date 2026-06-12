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
      // Chart is the one renderer that needs a sizing wrapper + title supplied by
      // the caller (the tab does the same in its <section>).
      return (
        <div className="flex h-full flex-col gap-1 p-3">
          {spec.title && (
            <h2 className="font-display text-sm font-semibold text-content">
              {spec.title}
            </h2>
          )}
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <SpecChart spec={spec} />
            </ResponsiveContainer>
          </div>
        </div>
      );
    }
    case "table": {
      const spec = card.spec as TableSpec;
      return (
        <div className="flex h-full flex-col overflow-auto">
          {spec.title && (
            <h2 className="px-3 pt-3 pb-1 font-display text-sm font-semibold text-content">
              {spec.title}
            </h2>
          )}
          <SpecTable spec={spec} title={spec.title} />
        </div>
      );
    }
    case "timeline":
      return (
        <div className="h-full overflow-auto p-3">
          <SpecTimeline spec={card.spec as TimelineSpec} />
        </div>
      );
    case "images":
      return (
        <div className="h-full overflow-auto p-3">
          <SpecImages spec={card.spec as ImagesSpec} />
        </div>
      );
    case "knowledge-graph": {
      const spec = card.spec as GraphCardSpec;
      // The live force graph as one card, titled with the conversation so it reads
      // as "the graph of THIS conversation". Its own d3-zoom handles in-card
      // pan/zoom; gestures starting inside .bigsail-card are excluded from the
      // canvas zoom.
      return (
        <div className="flex h-full flex-col">
          {spec.title && (
            <h2 className="shrink-0 px-3 pt-3 pb-1 font-display text-sm font-semibold text-content">
              {spec.title}
            </h2>
          )}
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
