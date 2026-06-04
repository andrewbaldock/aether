import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";
import { select } from "d3-selection";
import { type ZoomBehavior, zoom, zoomIdentity } from "d3-zoom";
import { useEffect, useMemo, useRef, useState } from "react";
import { TYPE_COLOR } from "./colors";
import type { GraphLink, GraphNode } from "./types";

const VIEW_W = 600;
const VIEW_H = 600;
const NODE_R = 9;

interface ForceGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

// d3-force simulation rendered as SVG. The simulation mutates node x/y in place;
// a tick handler copies a snapshot into React state so the DOM follows. New nodes
// fade + scale in via CSS (the .kg-node class). d3-zoom drives pan/zoom by
// writing a transform onto the <g>.
export function ForceGraph({
  nodes,
  links,
  selectedId,
  onSelect,
}: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // A render tick — bumping it re-reads node positions off the mutable sim nodes.
  const [, setTick] = useState(0);
  const [transform, setTransform] = useState("");

  // The simulation owns a stable node/link array it mutates; we reconcile React's
  // props into it so positions survive across additive merges.
  const simNodes = useRef<GraphNode[]>([]);
  const simLinks = useRef<GraphLink[]>([]);

  // Reconcile incoming nodes/links into the simulation's mutable arrays, then
  // (re)heat the sim. Keeps existing nodes' positions; seeds new ones near centre.
  useEffect(() => {
    const byId = new Map(simNodes.current.map((n) => [n.id, n]));
    simNodes.current = nodes.map((n) => {
      const existing = byId.get(n.id);
      if (existing) {
        // Keep live position/velocity, refresh display fields.
        return Object.assign(existing, n);
      }
      return {
        ...n,
        x: VIEW_W / 2 + (Math.random() - 0.5) * 40,
        y: VIEW_H / 2 + (Math.random() - 0.5) * 40,
      };
    });
    simLinks.current = links.map((l) => ({ ...l }));

    let sim = simRef.current;
    if (!sim) {
      sim = forceSimulation<GraphNode, GraphLink>(simNodes.current)
        .force(
          "link",
          forceLink<GraphNode, GraphLink>(simLinks.current)
            .id((d) => d.id)
            .distance(90)
            .strength(0.5)
        )
        .force("charge", forceManyBody().strength(-260))
        .force("center", forceCenter(VIEW_W / 2, VIEW_H / 2))
        .force("collide", forceCollide(NODE_R * 2.2));
      sim.on("tick", () => setTick((t) => t + 1));
      simRef.current = sim;
    } else {
      sim.nodes(simNodes.current);
      const linkForce = sim.force("link") as ReturnType<
        typeof forceLink<GraphNode, GraphLink>
      >;
      linkForce.links(simLinks.current);
    }
    sim.alpha(0.8).restart();
  }, [nodes, links]);

  // Tear the simulation down on unmount.
  useEffect(() => {
    return () => {
      simRef.current?.stop();
      simRef.current = null;
    };
  }, []);

  // Wire d3-zoom for pan/zoom — writes the transform string into React state.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (e) => setTransform(e.transform.toString()));
    zoomRef.current = zoomBehavior;
    const selection = select(svgEl);
    selection.call(zoomBehavior);
    // Click on empty canvas clears selection.
    return () => {
      selection.on(".zoom", null);
    };
  }, []);

  // Snapshot current positions for render. d3 mutates the same node objects in
  // simNodes; we read straight off them each tick.
  const renderNodes = simNodes.current;
  const renderLinks = simLinks.current;

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of renderNodes) m.set(n.id, n);
    return m;
  }, [renderNodes]);

  function endpoint(p: string | GraphNode): GraphNode | undefined {
    return typeof p === "string" ? nodeById.get(p) : p;
  }

  function resetView() {
    const svgEl = svgRef.current;
    const zoomBehavior = zoomRef.current;
    if (!svgEl || !zoomBehavior) return;
    select(svgEl).call(zoomBehavior.transform, zoomIdentity);
  }

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-full w-full"
        role="img"
        aria-label="Knowledge graph"
      >
        <g ref={gRef} transform={transform}>
          {/* Edges under nodes */}
          {renderLinks.map((l) => {
            const a = endpoint(l.source);
            const b = endpoint(l.target);
            if (!a || !b) return null;
            const mx = ((a.x ?? 0) + (b.x ?? 0)) / 2;
            const my = ((a.y ?? 0) + (b.y ?? 0)) / 2;
            return (
              <g key={`${a.id}->${b.id}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--border-strong)"
                  strokeWidth={1.5}
                />
                {l.label && (
                  <text
                    x={mx}
                    y={my}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={8}
                    fontFamily="ui-monospace, monospace"
                    fill="var(--content-faint)"
                    className="pointer-events-none select-none"
                  >
                    {l.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes. Outer <g> carries the live translate (updated every tick);
              inner .kg-node <g> carries the one-shot fade/scale-in so the CSS
              transform never fights the positional translate. */}
          {renderNodes.map((n) => {
            const selected = n.id === selectedId;
            const color = TYPE_COLOR[n.type];
            const r = selected ? NODE_R + 2 : NODE_R;
            return (
              <g key={n.id} transform={`translate(${n.x ?? 0}, ${n.y ?? 0})`}>
                {/* biome-ignore lint/a11y/useSemanticElements: a real <button> can't live inside SVG; role+keyboard handler is the accessible option for an interactive <g> */}
                <g
                  className="kg-node cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.label} (${n.type})`}
                  aria-pressed={selected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(selected ? null : n.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(selected ? null : n.id);
                    }
                  }}
                >
                  <circle
                    r={r}
                    fill={color}
                    stroke="var(--surface)"
                    strokeWidth={selected ? 3 : 2}
                    style={
                      selected
                        ? { filter: `drop-shadow(0 0 6px ${color})` }
                        : undefined
                    }
                  />
                  <TypeIcon type={n.type} />
                  <text
                    x={0}
                    y={r + 12}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--content)"
                    className="pointer-events-none select-none"
                    style={{ paintOrder: "stroke" }}
                    stroke="var(--surface)"
                    strokeWidth={3}
                  >
                    {n.label}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      <button
        type="button"
        onClick={resetView}
        className="absolute bottom-2 right-2 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-content-muted hover:text-content"
      >
        Reset view
      </button>
    </div>
  );
}

// A small white glyph centred in the node, one per entity type, so the graph
// reads at a glance without relying on colour alone. Paths are sized to a ~10px
// box centred on the node origin (the node radius is 9). pointer-events:none so
// clicks fall through to the node's <g>.
function TypeIcon({ type }: { type: GraphNode["type"] }) {
  const common = {
    fill: "none" as const,
    stroke: "#fff",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "pointer-events-none",
  };
  switch (type) {
    case "person":
      return (
        <g {...common}>
          <circle cx={0} cy={-2.5} r={2.2} />
          <path d="M-3.6 4.2c0-2 1.6-3.4 3.6-3.4s3.6 1.4 3.6 3.4" />
        </g>
      );
    case "place":
      return (
        <g {...common}>
          <path d="M0 5c2.6-3 3.8-4.8 3.8-6.6A3.8 3.8 0 0 0 0-5a3.8 3.8 0 0 0-3.8 3.4C-3.8 0.2-2.6 2 0 5z" />
          <circle cx={0} cy={-1.6} r={1.3} />
        </g>
      );
    case "org":
      return (
        <g {...common}>
          <rect x={-4} y={-4} width={8} height={8} rx={0.8} />
          <path
            d="M-1.6-1.6h0M1.6-1.6h0M-1.6 1.6h0M1.6 1.6h0"
            strokeWidth={1.8}
          />
        </g>
      );
    case "event":
      return (
        <g {...common}>
          <rect x={-4} y={-3.4} width={8} height={7} rx={1} />
          <path d="M-4-0.8h8M-1.8-5v2.4M1.8-5v2.4" />
        </g>
      );
    default:
      // concept — a lightbulb-ish spark.
      return (
        <g {...common}>
          <circle cx={0} cy={-1} r={3} />
          <path d="M-1.6 3.2h3.2M-1.2 4.8h2.4" />
        </g>
      );
  }
}
