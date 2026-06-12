import type { CardCapability } from "./cards";

// The shimmer body of a placeholder card. Each capability gets a distinct
// silhouette — header+rows for a table, bars for a chart, dots-on-a-line for a
// timeline, scattered nodes for the graph, a photo grid for images — so even
// before any data lands the skeleton hints at the answer's SHAPE. All shimmer
// blocks share the .tiles-skeleton-shimmer sweep (see index.css). Zero deps,
// zero data; purely the "it's already building" illusion.

function Block({ className = "" }: { className?: string }) {
  return <div className={`tiles-skeleton-shimmer rounded ${className}`} />;
}

// Stable keys for the fixed-count decorative rows/tiles. These shimmer blocks are
// static and never reorder, so a named key per slot is both stable and honest
// (a bare array index would trip noArrayIndexKey for no real reason).
const TABLE_ROWS = ["r0", "r1", "r2", "r3", "r4"];
const TIMELINE_ROWS = ["t0", "t1", "t2"];
const IMAGE_TILES = ["i0", "i1", "i2", "i3"];

function TableSilhouette() {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <Block className="h-4 w-1/3" />
      <div className="mt-1 flex flex-col gap-2">
        {TABLE_ROWS.map((k) => (
          <Block key={k} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}

function ChartSilhouette() {
  // Bars of varied height rising from a baseline.
  const heights = ["h-1/3", "h-2/3", "h-1/2", "h-full", "h-3/4", "h-2/5"];
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <Block className="h-4 w-1/4" />
      <div className="flex min-h-0 flex-1 items-end gap-2">
        {heights.map((h) => (
          <Block key={h} className={`w-full ${h}`} />
        ))}
      </div>
    </div>
  );
}

function TimelineSilhouette() {
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-4">
      {TIMELINE_ROWS.map((k) => (
        <div key={k} className="flex items-center gap-3">
          <Block className="h-3 w-3 shrink-0 rounded-full" />
          <Block className="h-3 w-1/4" />
          <Block className="h-3 flex-1" />
        </div>
      ))}
    </div>
  );
}

function GraphSilhouette() {
  // A loose scatter of node blobs — reads as a graph "forming".
  const dots = [
    "left-1/4 top-1/3",
    "left-1/2 top-1/4",
    "left-2/3 top-1/2",
    "left-1/3 top-2/3",
    "left-3/4 top-2/3",
  ];
  return (
    <div className="relative h-full w-full p-3">
      {dots.map((pos) => (
        <div
          key={pos}
          className={`tiles-skeleton-shimmer absolute h-8 w-8 rounded-full ${pos}`}
        />
      ))}
    </div>
  );
}

function ImagesSilhouette() {
  return (
    <div className="grid h-full grid-cols-2 gap-2 p-3">
      {IMAGE_TILES.map((k) => (
        <Block key={k} className="h-full w-full" />
      ))}
    </div>
  );
}

const SILHOUETTE: Record<CardCapability, () => React.ReactElement> = {
  table: TableSilhouette,
  chart: ChartSilhouette,
  timeline: TimelineSilhouette,
  "knowledge-graph": GraphSilhouette,
  images: ImagesSilhouette,
};

export function SkeletonCard({ type }: { type: CardCapability }) {
  const Silhouette = SILHOUETTE[type];
  return (
    <div className="h-full w-full overflow-hidden" aria-hidden>
      <Silhouette />
    </div>
  );
}
