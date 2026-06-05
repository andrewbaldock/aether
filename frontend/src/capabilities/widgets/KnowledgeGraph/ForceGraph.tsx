import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";
import { select } from "d3-selection";
import {
  type ZoomBehavior,
  type ZoomTransform,
  zoom,
  zoomIdentity,
  zoomTransform,
} from "d3-zoom";
import {
  Building2,
  Calendar,
  Lightbulb,
  type LucideIcon,
  MapPin,
  User,
} from "lucide-react";
// Lazy per-icon loader: resolves a model-chosen icon by name on demand without
// bundling all ~1500 icons. Unknown names render its fallback, so an invalid
// model suggestion degrades gracefully.
import { DynamicIcon, type IconName, iconNames } from "lucide-react/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tooltip } from "../../../shell/Tooltip";
import { TYPE_COLOR } from "./colors";
import type { GraphLink, GraphNode } from "./types";
import type { NodePosition } from "./useKnowledgeGraphState";

const VIEW_W = 600;
const VIEW_H = 600;
// Larger nodes so each can carry a centred lucide icon and read as a distinct
// token rather than a dot.
const NODE_R = 16;
// Pointer movement (in SVG units) beyond which a press counts as a drag, not a
// click. Keeps tap-to-select working while still allowing drag-to-pin.
const DRAG_THRESHOLD = 4;

interface ContextMenuState {
  id: string;
  // Anchor in container-relative pixels.
  x: number;
  y: number;
}

interface ForceGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  // Editing + persistence hooks from the graph provider.
  onReportPositions: (positions: Map<string, NodePosition>) => void;
  onPin: (id: string, x: number, y: number) => void;
  onUnpin: (id: string) => void;
  onRemove: (id: string) => void;
  onExplore: (node: GraphNode) => void;
}

// d3-force simulation rendered as SVG. The simulation mutates node x/y in place;
// a tick handler copies a snapshot into React state so the DOM follows. New nodes
// fade + scale in via CSS (the .kg-node class). d3-zoom drives pan/zoom by
// writing a transform onto the <g>. Nodes can be dragged to pin them (fx/fy) and
// right-clicked for a context menu (explore / remove / unpin).
export function ForceGraph({
  nodes,
  links,
  selectedId,
  onSelect,
  onReportPositions,
  onPin,
  onUnpin,
  onRemove,
  onExplore,
}: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // A render tick — bumping it re-reads node positions off the mutable sim nodes.
  const [, setTick] = useState(0);
  const [transform, setTransform] = useState("");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  // The simulation owns a stable node/link array it mutates; we reconcile React's
  // props into it so positions survive across additive merges.
  const simNodes = useRef<GraphNode[]>([]);
  const simLinks = useRef<GraphLink[]>([]);

  // Report current positions (incl. pinned fx/fy) up so saves capture layout.
  const reportPositions = useCallback(() => {
    const map = new Map<string, NodePosition>();
    for (const n of simNodes.current) {
      map.set(n.id, { x: n.x, y: n.y, fx: n.fx ?? null, fy: n.fy ?? null });
    }
    onReportPositions(map);
  }, [onReportPositions]);

  // Reconcile incoming nodes/links into the simulation's mutable arrays, then
  // (re)heat the sim. Keeps existing nodes' positions; seeds new ones near centre.
  // Restored nodes arrive with saved x/y (and maybe fx/fy) — honour those.
  useEffect(() => {
    const byId = new Map(simNodes.current.map((n) => [n.id, n]));
    simNodes.current = nodes.map((n) => {
      const existing = byId.get(n.id);
      if (existing) {
        // Keep live position/velocity, refresh display fields (incl. fx/fy so
        // pin/unpin from the provider takes effect).
        return Object.assign(existing, n);
      }
      // Use a saved position if present (restore), else seed near centre.
      return {
        ...n,
        x: n.x ?? VIEW_W / 2 + (Math.random() - 0.5) * 40,
        y: n.y ?? VIEW_H / 2 + (Math.random() - 0.5) * 40,
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
      // When the layout settles, report final positions for persistence.
      sim.on("end", () => reportPositions());
      simRef.current = sim;
    } else {
      sim.nodes(simNodes.current);
      const linkForce = sim.force("link") as ReturnType<
        typeof forceLink<GraphNode, GraphLink>
      >;
      linkForce.links(simLinks.current);
    }
    sim.alpha(0.8).restart();
  }, [nodes, links, reportPositions]);

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
      // Don't pan/zoom when the gesture starts on a node — those go to the
      // node's own drag handlers. d3-zoom binds native listeners on the SVG, so
      // React's stopPropagation on the node can't reach it; this filter is the
      // right seam. Mirror d3's default (reject non-primary buttons + ctrl) but
      // additionally reject anything inside a .kg-node.
      .filter((e: Event) => {
        const target = e.target as Element | null;
        if (target?.closest(".kg-node")) return false;
        return !(e as MouseEvent).ctrlKey && (e as MouseEvent).button === 0;
      })
      .on("zoom", (e) => setTransform(e.transform.toString()));
    zoomRef.current = zoomBehavior;
    const selection = select(svgEl);
    selection.call(zoomBehavior);
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

  // Convert a pointer event to graph-space coords, undoing both the SVG viewBox
  // scaling and the current zoom/pan transform.
  function toGraphCoords(e: React.PointerEvent): { x: number; y: number } {
    const svgEl = svgRef.current;
    if (!svgEl) return { x: 0, y: 0 };
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    // Screen → viewBox.
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      ctm.inverse()
    );
    // viewBox → graph space (undo zoom transform on the <g>).
    const t: ZoomTransform = svgRef.current
      ? zoomTransform(svgRef.current)
      : zoomIdentity;
    return { x: (pt.x - t.x) / t.k, y: (pt.y - t.y) / t.k };
  }

  // --- Drag-to-pin (native pointer events; no d3-drag dependency) -----------
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);

  function onNodePointerDown(e: React.PointerEvent, node: GraphNode) {
    if (e.button !== 0) return; // left button only; right opens the menu
    e.stopPropagation();
    // Capture on the handler element (the node <g>), not whichever child glyph
    // was hit, so move/up keep firing here even if the pointer leaves the node.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id: node.id, moved: false };
    // Heat the sim a little so neighbours respond while dragging.
    simRef.current?.alphaTarget(0.3).restart();
  }

  function onNodePointerMove(e: React.PointerEvent, node: GraphNode) {
    const drag = dragRef.current;
    if (!drag || drag.id !== node.id) return;
    const { x, y } = toGraphCoords(e);
    const dx = (node.x ?? x) - x;
    const dy = (node.y ?? y) - y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      // Not yet past the threshold — could still be a click.
      node.fx = x;
      node.fy = y;
      return;
    }
    drag.moved = true;
    node.fx = x;
    node.fy = y;
    setTick((t) => t + 1);
  }

  function onNodePointerUp(e: React.PointerEvent, node: GraphNode) {
    const drag = dragRef.current;
    dragRef.current = null;
    simRef.current?.alphaTarget(0);
    if (!drag || drag.id !== node.id) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    if (drag.moved) {
      // Pin where it was dropped and persist the layout.
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      node.fx = x;
      node.fy = y;
      onPin(node.id, x, y);
    } else {
      // No real movement — treat as a select toggle, and drop the transient pin.
      node.fx = null;
      node.fy = null;
      const selected = node.id === selectedId;
      onSelect(selected ? null : node.id);
    }
  }

  function openMenu(e: React.MouseEvent, node: GraphNode) {
    e.preventDefault();
    e.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    setMenu({
      id: node.id,
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    });
  }

  // Close the context menu on any outside click or Escape (mirrors the sidebar
  // kebab menu). Avoids putting an onClick on the SVG canvas itself.
  useEffect(() => {
    if (!menu) return;
    function onDocClick() {
      setMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const menuNode = menu ? nodeById.get(menu.id) : undefined;
  const menuPinned = menuNode?.fx != null;

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
            const pinned = n.fx != null && n.fx !== undefined;
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
                  onPointerDown={(e) => onNodePointerDown(e, n)}
                  onPointerMove={(e) => onNodePointerMove(e, n)}
                  onPointerUp={(e) => onNodePointerUp(e, n)}
                  onContextMenu={(e) => openMenu(e, n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(selected ? null : n.id);
                    }
                  }}
                >
                  {/* Pin marker — a dashed ring behind a pinned node. */}
                  {pinned && (
                    <circle
                      r={r + 4}
                      fill="none"
                      stroke="var(--content-faint)"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      className="pointer-events-none"
                    />
                  )}
                  <circle
                    r={r}
                    fill={color}
                    stroke="var(--surface)"
                    strokeWidth={selected ? 3 : 2}
                    style={
                      selected
                        ? { filter: `drop-shadow(0 0 7px ${color})` }
                        : undefined
                    }
                  />
                  {/* The model's chosen icon for this entity, falling back to a
                      per-type icon. Centred in the node. */}
                  <NodeIcon icon={n.icon} type={n.type} size={r * 1.1} />
                  {/* Full label below the node. */}
                  <text
                    x={0}
                    y={r + 13}
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

      {/* Right-click context menu */}
      {menu && menuNode && (
        <div
          role="menu"
          className="absolute z-30 w-40 rounded-lg border border-border bg-surface-raised py-1 shadow-md"
          style={{ left: menu.x, top: menu.y }}
          // Stop the document mousedown listener from closing the menu before a
          // button's click handler runs.
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onExplore(menuNode);
              setMenu(null);
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-content hover:bg-elevated"
          >
            Explore further
          </button>
          {menuPinned && (
            <button
              type="button"
              onClick={() => {
                onUnpin(menuNode.id);
                setMenu(null);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-content hover:bg-elevated"
            >
              Unpin
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onRemove(menuNode.id);
              setMenu(null);
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-danger-content hover:bg-elevated"
          >
            Remove from graph
          </button>
        </div>
      )}

      <Tooltip
        label="Reset zoom & pan to fit the graph"
        side="left"
        className="absolute bottom-2 right-2"
      >
        <button
          type="button"
          onClick={resetView}
          className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-content-muted hover:text-content"
        >
          Reset view
        </button>
      </Tooltip>
    </div>
  );
}

// Generic fallback icon per entity type, used when the model didn't pick an icon
// (or picked an invalid name). Lucide components emit their own 24×24 <svg>; we
// nest at -size/2 so the glyph sits dead-centre. pointer-events:none so clicks
// fall through to the node.
const TYPE_ICON: Record<GraphNode["type"], LucideIcon> = {
  person: User,
  place: MapPin,
  org: Building2,
  event: Calendar,
  concept: Lightbulb,
};

// "FlaskConical" → "flask-conical", "Building2" → "building-2"; lucide's dynamic
// loader keys off kebab-case. A letter→digit boundary also gets a dash, matching
// lucide's naming (Building2 is "building-2", not "building2").
function toKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .toLowerCase();
}

// The set of real lucide icon names, for O(1) validation. The model frequently
// guesses plausible-but-nonexistent names (e.g. "vinyl-record"); handing one to
// DynamicIcon makes it attempt a dynamic import that rejects and logs a console
// error before the fallback renders. Checking membership first means we only
// ever lazy-load names that exist, and silently use the type icon otherwise.
const VALID_ICON_NAMES = new Set<string>(iconNames);

// Returns the kebab name if it's a real lucide icon, else null.
function resolveIconName(icon: string): IconName | null {
  const kebab = toKebab(icon);
  return VALID_ICON_NAMES.has(kebab) ? (kebab as IconName) : null;
}

function NodeIcon({
  icon,
  type,
  size,
}: {
  icon?: string;
  type: GraphNode["type"];
  size: number;
}) {
  const Fallback = TYPE_ICON[type];
  const common = {
    x: -size / 2,
    y: -size / 2,
    width: size,
    height: size,
    color: "#fff",
    strokeWidth: 2,
    className: "pointer-events-none",
  } as const;

  // No model suggestion, or the suggested name isn't a real lucide icon — use
  // the type icon directly (no lazy load, no console error from a bad import).
  const name = icon ? resolveIconName(icon) : null;
  if (!name) return <Fallback {...common} />;

  // Lazy-resolve the validated icon; render the type icon while it loads.
  return (
    <DynamicIcon
      name={name}
      fallback={() => <Fallback {...common} />}
      {...common}
    />
  );
}
