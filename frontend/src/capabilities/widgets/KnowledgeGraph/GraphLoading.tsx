import { TYPE_COLOR } from "./colors";
import type { EntityType } from "./types";

// Pulsing placeholder nodes shown while build_knowledge_graph is running but no
// real nodes have landed yet. Pure CSS/SVG, no deps. Each ghost node uses a
// type colour so it reads as "a graph is forming", and pulses on a staggered
// delay (the .kg-loading-pulse animation lives in index.css).
const GHOSTS: {
  id: string;
  type: EntityType;
  cx: number;
  cy: number;
  r: number;
}[] = [
  { id: "a", type: "concept", cx: 90, cy: 70, r: 16 },
  { id: "b", type: "person", cx: 150, cy: 50, r: 13 },
  { id: "c", type: "place", cx: 200, cy: 90, r: 14 },
  { id: "d", type: "org", cx: 120, cy: 120, r: 12 },
  { id: "e", type: "event", cx: 185, cy: 145, r: 13 },
];

// Faint links between the ghosts (as concrete endpoint coords so we don't index
// back into GHOSTS), drawn first so nodes sit on top.
const GHOST_LINKS: {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}[] = [
  { id: "a-b", x1: 90, y1: 70, x2: 150, y2: 50 },
  { id: "a-d", x1: 90, y1: 70, x2: 120, y2: 120 },
  { id: "b-c", x1: 150, y1: 50, x2: 200, y2: 90 },
  { id: "d-e", x1: 120, y1: 120, x2: 185, y2: 145 },
  { id: "c-e", x1: 200, y1: 90, x2: 185, y2: 145 },
];

export function GraphLoading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <svg
        width="280"
        height="190"
        viewBox="0 0 280 190"
        role="img"
        aria-label="Building the knowledge graph"
        className="max-w-full"
      >
        <title>Building the knowledge graph</title>
        {GHOST_LINKS.map((l, i) => (
          <line
            key={l.id}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="var(--border-strong)"
            strokeWidth={1.5}
            className="kg-loading-pulse"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
        {GHOSTS.map((g, i) => (
          <circle
            key={g.id}
            cx={g.cx}
            cy={g.cy}
            r={g.r}
            fill={TYPE_COLOR[g.type]}
            className="kg-loading-pulse"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </svg>
      <p className="font-display text-sm font-medium text-content-muted">
        Mapping the conversation…
      </p>
    </div>
  );
}
