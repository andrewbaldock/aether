import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
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
  Compass,
  Lightbulb,
  type LucideIcon,
  MapPin,
  Maximize2,
  Trash2,
  User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Lazy per-icon loader: resolves a model-chosen icon by name on demand without
// bundling all ~1500 icons. Unknown names render its fallback, so an invalid
// model suggestion degrades gracefully.
import { Tooltip } from "../../../shell/Tooltip";
import { MenuItems } from "../ContextMenu";
import { DynamicIcon, resolveIconName } from "../lucideIcon";
import { TYPE_COLOR } from "./colors";
import { dedupeNodes, filterDanglingLinks } from "./sanitize";
import type { GraphLink, GraphNode } from "./types";
import type { NodePosition } from "./useKnowledgeGraphState";

// The viewBox HEIGHT is fixed; the WIDTH tracks the card's aspect ratio (see
// viewW state below). A fixed square viewBox letterboxed into a wide card meant the
// graph fit perfectly into a centred square and left big dead margins on the sides —
// the "why is it so small" bug. Matching the viewBox aspect to the card makes the
// fit use the full visible area. VIEW_W is just the seed/fallback width before the
// first measure.
const VIEW_H = 600;
const VIEW_W = 600;
// Clamp the derived width so a pathologically wide/narrow card can't produce an
// absurd aspect (which would make nodes tiny or the layout a thin strip).
const MIN_VIEW_W = 360;
const MAX_VIEW_W = 1600;
// Larger nodes so each can carry a centred lucide icon and read as a distinct
// token rather than a dot.
const NODE_R = 16;
// Pointer movement (in SVG units) beyond which a press counts as a drag, not a
// click. Keeps tap-to-select working while still allowing drag-to-pin.
const DRAG_THRESHOLD = 4;
// Auto-fit the view after this many sim ticks rather than waiting for the full
// cool-down (`end`, ~300 ticks / ~2s). By ~40 ticks the layout is broadly in place,
// so framing then makes the "pop" feel immediate; the sim keeps refining beneath
// the already-fit view. The `end` handler is a backstop for graphs that settle in
// fewer ticks.
const AUTO_FIT_TICKS = 40;
// Quiet window after the last nodes/links change before we reconcile + re-heat the
// sim. Collapses a burst of build_knowledge_graph updates (some models fire many
// per turn) into a single settle instead of one violent re-layout per update.
const RECONCILE_DEBOUNCE_MS = 150;

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
  // Editing + persistence hooks from the graph provider. Optional so the graph can
  // also render read-only (e.g. as a Bigsail card), where there's no provider to
  // persist positions or wire position/remove/explore into.
  onReportPositions?: (positions: Map<string, NodePosition>) => void;
  // Called on drag end to persist the node's new (dragged) position.
  onPositionNode?: (id: string, x: number, y: number) => void;
  onRemove?: (id: string) => void;
  onExplore?: (node: GraphNode) => void;
  // Whether the graph auto-frames itself (early fit + settle re-fit). Default true,
  // which keeps the Bigsail card and any other caller auto-framing. The full tool
  // panel passes false so it builds at its natural position and stays put — the
  // user frames it manually via the Fit button.
  autoFitEnabled?: boolean;
}

// Long-press duration (ms) before a stationary press on a node opens its menu.
// This is the touch path to the menu — right-click has no touch equivalent, so a
// hold is how phones reach explore/remove.
const LONG_PRESS_MS = 500;

// d3-force simulation rendered as SVG. The simulation mutates node x/y in place;
// a tick handler copies a snapshot into React state so the DOM follows. New nodes
// fade + scale in via CSS (the .kg-node class). d3-zoom drives pan/zoom by
// writing a transform onto the <g>. Nodes can be dragged to reposition them — the
// drop point is fixed (fx/fy) and persisted, so the user's arrangement reloads —
// and opened for a context menu (explore / remove) by right-click on pointer
// devices or long-press on touch. The menu is a Radix DropdownMenu anchored to the
// press point (its own menu, not the shared ExploreMenu: this one is canvas-
// anchored and drag-aware, which would only contort the shared primitive).
export function ForceGraph({
  nodes,
  links,
  selectedId,
  onSelect,
  onReportPositions,
  onPositionNode,
  onRemove,
  onExplore,
  autoFitEnabled = true,
}: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // A render tick — bumping it re-reads node positions off the mutable sim nodes.
  const [, setTick] = useState(0);
  const [transform, setTransform] = useState("");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  // The viewBox width, derived from the card's measured aspect ratio (height fixed
  // at VIEW_H). State drives the <svg viewBox>; the ref mirror lets the sim/fit
  // closures read the current width without re-subscribing. See the ResizeObserver
  // effect below.
  const [viewW, setViewW] = useState(VIEW_W);
  const viewWRef = useRef(VIEW_W);
  viewWRef.current = viewW;

  // The simulation owns a stable node/link array it mutates; we reconcile React's
  // props into it so positions survive across additive merges.
  const simNodes = useRef<GraphNode[]>([]);
  const simLinks = useRef<GraphLink[]>([]);

  // Auto-fit happens in two one-shot stages on load, so the graph opens framed
  // fast AND stays framed once it fully settles (zoom/pan is view state, separate
  // from node positions, so we re-frame even when positions were restored):
  //   1. EARLY — after ~AUTO_FIT_TICKS ticks, when the layout is roughly in place,
  //      so the "pop" feels immediate.
  //   2. FINAL — on the sim's `end` (fully settled), correcting the early frame
  //      after the nodes finish spreading.
  // Each stage fires once. A genuine user zoom/pan (userZoomedRef) cancels the
  // pending final fit so we never yank a view the user already grabbed; later
  // incremental updates don't re-fit either.
  const didEarlyFitRef = useRef(false);
  const didFinalFitRef = useRef(false);
  const userZoomedRef = useRef(false);

  // Report current positions (incl. pinned fx/fy) up so saves capture layout.
  const reportPositions = useCallback(() => {
    const map = new Map<string, NodePosition>();
    for (const n of simNodes.current) {
      map.set(n.id, { x: n.x, y: n.y, fx: n.fx ?? null, fy: n.fy ?? null });
    }
    onReportPositions?.(map);
  }, [onReportPositions]);

  // Reconcile incoming nodes/links into the simulation's mutable arrays, then
  // (re)heat the sim. Keeps existing nodes' positions; seeds new ones near centre.
  // Restored nodes arrive with saved x/y (and maybe fx/fy) — honour those.
  //
  // Debounced: some models fire many build_knowledge_graph calls in one turn, each
  // landing as its own [nodes, links] change. Reconciling + re-heating per change
  // re-flings the whole layout on every update — that's the rapid "flashing". We
  // wait for the burst to stop (RECONCILE_DEBOUNCE_MS of quiet), then reconcile to
  // the final data exactly once. Each render re-arms the timer with fresh closure
  // values, so the trailing run always sees the latest props.
  useEffect(() => {
    const timer = setTimeout(reconcile, RECONCILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);

    function reconcile() {
      // Compute centroid of existing positioned nodes so new arrivals spawn near
      // the current cluster rather than the static viewport centre.
      const positioned = simNodes.current.filter(
        (n) => n.x != null && n.y != null
      );
      const cx =
        positioned.length > 0
          ? positioned.reduce((s, n) => s + (n.x ?? 0), 0) / positioned.length
          : viewWRef.current / 2;
      const cy =
        positioned.length > 0
          ? positioned.reduce((s, n) => s + (n.y ?? 0), 0) / positioned.length
          : VIEW_H / 2;

      // Sanitise before the sim touches anything: collapse duplicate node ids (a
      // duplicate key would crash the keyed render) so we never seed two sim nodes
      // for one id, then below drop links whose endpoint isn't among the surviving
      // ids — d3-force throws "node not found" on any dangling endpoint. The reducer
      // tries to keep these consistent, but a restored snapshot or a loadGraph race
      // can still deliver bad data; this is the boundary that makes the view safe.
      const safeNodes = dedupeNodes(nodes);

      const byId = new Map(simNodes.current.map((n) => [n.id, n]));
      simNodes.current = safeNodes.map((n) => {
        const existing = byId.get(n.id);
        if (existing) {
          // Keep live position/velocity, refresh display fields (incl. fx/fy so
          // pin/unpin from the provider takes effect).
          return Object.assign(existing, n);
        }
        // Use a saved position if present (restore), else seed near cluster centroid.
        return {
          ...n,
          x: n.x ?? cx + (Math.random() - 0.5) * 40,
          y: n.y ?? cy + (Math.random() - 0.5) * 40,
        };
      });
      const liveIds = new Set(simNodes.current.map((n) => n.id));
      simLinks.current = filterDanglingLinks(links, liveIds).map((l) => ({
        ...l,
      }));

      // Radial force that pulls orphan nodes (no edges) toward the graph centroid.
      // Recomputed each reconcile so the target tracks the evolving cluster.
      function updateOrphanForce(sim: Simulation<GraphNode, GraphLink>) {
        const linkedIds = new Set<string>();
        for (const l of simLinks.current) {
          linkedIds.add(typeof l.source === "string" ? l.source : l.source.id);
          linkedIds.add(typeof l.target === "string" ? l.target : l.target.id);
        }
        const lx =
          simNodes.current.length > 0
            ? simNodes.current.reduce((s, n) => s + (n.x ?? 0), 0) /
              simNodes.current.length
            : viewWRef.current / 2;
        const ly =
          simNodes.current.length > 0
            ? simNodes.current.reduce((s, n) => s + (n.y ?? 0), 0) /
              simNodes.current.length
            : VIEW_H / 2;
        sim.force(
          "orphan",
          forceRadial<GraphNode>(0, lx, ly).strength((n) =>
            linkedIds.has(n.id) ? 0 : 0.08
          )
        );
      }

      let sim = simRef.current;
      const firstBuild = !sim;
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
          .force("center", forceCenter(viewWRef.current / 2, VIEW_H / 2))
          .force("collide", forceCollide(NODE_R * 2.2));
        let tickCount = 0;
        sim.on("tick", () => {
          setTick((t) => t + 1);
          // EARLY fit — after a handful of ticks the layout is roughly in place, so
          // we frame then instead of waiting the full ~2s cool-down (that long wait
          // read as a slow "pop").
          if (++tickCount === AUTO_FIT_TICKS) autoFit(false);
        });
        // FINAL fit — the layout has fully settled, so re-frame to correct the early
        // fit after the nodes finished spreading. Also persists final positions.
        sim.on("end", () => {
          reportPositions();
          autoFit(true);
        });
        simRef.current = sim;
      } else {
        sim.nodes(simNodes.current);
        const linkForce = sim.force("link") as ReturnType<
          typeof forceLink<GraphNode, GraphLink>
        >;
        linkForce.links(simLinks.current);
      }
      updateOrphanForce(sim);
      // Re-heat gently for incremental updates so existing nodes barely shift and new
      // ones ease into place; only the first build (or a full reload that recreates
      // the sim) earns the strong fling that lays the graph out from scratch.
      sim.alpha(firstBuild ? 0.8 : 0.3).restart();
    }
  }, [nodes, links, reportPositions]);

  // Tear the simulation down on unmount; clear any pending long-press timer.
  useEffect(() => {
    return () => {
      simRef.current?.stop();
      simRef.current = null;
      if (longPressRef.current) clearTimeout(longPressRef.current);
    };
  }, []);

  // Track the SVG's rendered aspect ratio and derive the viewBox width from it, so
  // the graph's coordinate space is as wide as the card (no letterboxing → the fit
  // uses the full visible area). A single ResizeObserver on the SVG covers EVERY
  // cause of a size change — widget resize, shell/panel resize, window resize — since
  // they all change this element's box. On each change we re-derive viewW and re-fit
  // (unless the user has taken over the zoom) so the framing tracks the new size.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      const next = Math.round(
        Math.min(MAX_VIEW_W, Math.max(MIN_VIEW_W, VIEW_H * (width / height)))
      );
      setViewW((prev) => {
        if (prev === next) return prev;
        // Re-frame to the new aspect on the next frame (after the viewBox state
        // applies). Don't fight a user who's taken over the zoom.
        if (!userZoomedRef.current) {
          requestAnimationFrame(() => {
            const t = computeFitTransform();
            const svg = svgRef.current;
            const zoomBehavior = zoomRef.current;
            if (svg && zoomBehavior && t) {
              select(svg).call(zoomBehavior.transform, t);
            }
          });
        }
        return next;
      });
    });
    ro.observe(svgEl);
    return () => ro.disconnect();
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
      // right seam. Mirror d3's default filter but additionally reject anything
      // inside a .kg-node. Use d3's exact `!event.button` test (not `=== 0`):
      // touch events have no `button` property, and a strict `=== 0` check would
      // be `undefined === 0` → false, silently blocking all touch gestures.
      .filter((e: Event) => {
        const target = e.target as Element | null;
        if (target?.closest(".kg-node")) return false;
        const me = e as MouseEvent;
        return (!me.ctrlKey || e.type === "wheel") && !me.button;
      })
      .on("zoom", (e) => {
        setTransform(e.transform.toString());
        // A genuine user gesture (sourceEvent set) cancels the pending final
        // auto-fit so we never yank a view the user already grabbed. Programmatic
        // transforms from fitView() have no sourceEvent, so they don't trip this.
        if (e.sourceEvent) userZoomedRef.current = true;
      });
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

  // Compute the transform that fits every node perfectly in the viewport: measure
  // the node bounding box, scale to fit with a margin (clamped to the zoom
  // extent), then translate so the bbox centre lands at the viewBox centre.
  // Returns null when there are no nodes (nothing to fit). Pure — used both to
  // apply the fit and to decide whether the Fit button would change anything.
  const computeFitTransform = useCallback((): ZoomTransform | null => {
    // Read nodes LIVE off the ref, not a render-snapshot: the reconcile reassigns
    // simNodes.current to a NEW array, so a closure that captured the old snapshot
    // (e.g. the sim 'end' handler bound at firstBuild, when it was empty) would
    // otherwise see 0 nodes forever and never fit.
    const liveNodes = simNodes.current;
    if (liveNodes.length === 0) return null;

    // Fit against the CURRENT viewBox (width tracks the card aspect; height fixed).
    const vw = viewWRef.current;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of liveNodes) {
      const x = n.x ?? vw / 2;
      const y = n.y ?? VIEW_H / 2;
      minX = Math.min(minX, x - NODE_R);
      minY = Math.min(minY, y - NODE_R);
      maxX = Math.max(maxX, x + NODE_R);
      maxY = Math.max(maxY, y + NODE_R);
    }

    const PADDING = 40; // viewBox units of breathing room around the graph
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    const k = Math.max(
      0.3,
      Math.min(
        3,
        Math.min((vw - PADDING * 2) / bboxW, (VIEW_H - PADDING * 2) / bboxH)
      )
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return zoomIdentity
      .translate(vw / 2 - k * cx, VIEW_H / 2 - k * cy)
      .scale(k);
  }, []);

  // Apply the fit transform (animated by d3 via the zoom behaviour).
  function fitView() {
    const svgEl = svgRef.current;
    const zoomBehavior = zoomRef.current;
    const target = computeFitTransform();
    if (!svgEl || !zoomBehavior || !target) return;
    select(svgEl).call(zoomBehavior.transform, target);
  }

  // Auto-fit one stage (see the refs up top). The early stage frames the rough
  // layout fast; the final stage re-frames once the sim settles. Each is a one-shot;
  // a user zoom/pan cancels the final stage. If d3-zoom isn't wired yet — its effect
  // can lose the race on a restored graph that settles in a tick or two — retry next
  // frame rather than dropping the fit (the bug where the graph opened unframed).
  function autoFit(isFinal: boolean) {
    if (!autoFitEnabled) return; // full tool panel opts out — frame manually
    const done = isFinal ? didFinalFitRef : didEarlyFitRef;
    if (done.current) return;
    if (isFinal && userZoomedRef.current) return; // user took over — don't yank
    if (!svgRef.current) return; // unmounted — stop retrying
    if (!zoomRef.current || !computeFitTransform()) {
      requestAnimationFrame(() => autoFit(isFinal));
      return;
    }
    done.current = true;
    fitView();
  }

  // Whether clicking Fit would actually move the view — false when there are no
  // nodes, or the current transform already matches the fit (within a small
  // epsilon, since d3 transforms are floats). Drives the button's disabled state.
  // Computed inline (not memoised) so it re-reads the live zoom transform on every
  // render — the `transform` state bump (pan/zoom) and `setTick` (each sim tick as
  // nodes drift) both re-render, so this never goes stale.
  const fitTarget = computeFitTransform();
  const currentTransform = svgRef.current
    ? zoomTransform(svgRef.current)
    : zoomIdentity;
  const canFit =
    fitTarget != null &&
    (Math.abs(currentTransform.k - fitTarget.k) > 1e-3 ||
      Math.abs(currentTransform.x - fitTarget.x) > 0.5 ||
      Math.abs(currentTransform.y - fitTarget.y) > 0.5);

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

  // Open the menu anchored at a screen point (converted to container-relative
  // pixels for the absolutely-positioned Radix anchor). Shared by right-click and
  // the touch long-press so both reach the same menu.
  const openMenuAt = useCallback(
    (clientX: number, clientY: number, nodeId: string) => {
      const rect = svgRef.current?.getBoundingClientRect();
      setMenu({
        id: nodeId,
        x: clientX - (rect?.left ?? 0),
        y: clientY - (rect?.top ?? 0),
      });
    },
    []
  );

  // --- Drag-to-position (native pointer events; no d3-drag dependency) -------
  // Dragging a node fixes it at the drop point (d3's fx/fy) so the layout the
  // user arranges is the layout that persists and reloads. `longPress` arms on
  // pointerdown and fires the menu if the press stays put; any drag past
  // threshold (or pointerup) cancels it. `openedMenu` suppresses the pointerup
  // select-toggle when the press became a menu-open instead.
  const dragRef = useRef<{
    id: string;
    moved: boolean;
    openedMenu: boolean;
    // Did the node already have a saved position (fx/fy) when the press began? A
    // long-press that opens the menu must restore exactly this, not the transient
    // fx/fy that sub-threshold pointermoves wrote.
    hadSavedPosition: boolean;
  } | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelLongPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  function onNodePointerDown(e: React.PointerEvent, node: GraphNode) {
    if (e.button !== 0) return; // left button only; right opens the menu
    e.stopPropagation();
    // Capture on the handler element (the node <g>), not whichever child glyph
    // was hit, so move/up keep firing here even if the pointer leaves the node.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      id: node.id,
      moved: false,
      openedMenu: false,
      hadSavedPosition: node.fx != null,
    };
    // Touch path to the menu: hold still on a node for LONG_PRESS_MS to open it.
    // A drag (handled in pointermove) cancels this before it fires.
    const { clientX, clientY } = e;
    cancelLongPress();
    longPressRef.current = setTimeout(() => {
      const drag = dragRef.current;
      if (!drag || drag.id !== node.id || drag.moved) return;
      drag.openedMenu = true;
      openMenuAt(clientX, clientY, node.id);
    }, LONG_PRESS_MS);
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
    cancelLongPress(); // movement means drag, not long-press
    node.fx = x;
    node.fy = y;
    setTick((t) => t + 1);
  }

  function onNodePointerUp(e: React.PointerEvent, node: GraphNode) {
    const drag = dragRef.current;
    dragRef.current = null;
    cancelLongPress();
    simRef.current?.alphaTarget(0);
    if (!drag || drag.id !== node.id) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    // The long-press already opened the menu — don't also toggle selection.
    // Restore the pre-press state: a sub-threshold pointermove may have written a
    // transient fx/fy, but a stationary hold shouldn't fix a node that didn't
    // already have a saved position (those come only from a deliberate drag).
    if (drag.openedMenu) {
      if (!drag.hadSavedPosition) {
        node.fx = null;
        node.fy = null;
      }
      return;
    }

    if (drag.moved) {
      // Fix the node where it was dropped and persist the layout.
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      node.fx = x;
      node.fy = y;
      onPositionNode?.(node.id, x, y);
    } else {
      // No real movement — treat as a select toggle, and drop the transient fix.
      node.fx = null;
      node.fy = null;
      const selected = node.id === selectedId;
      onSelect(selected ? null : node.id);
    }
  }

  function openMenu(e: React.MouseEvent, node: GraphNode) {
    e.preventDefault();
    e.stopPropagation();
    openMenuAt(e.clientX, e.clientY, node.id);
  }

  const menuNode = menu ? nodeById.get(menu.id) : undefined;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW} ${VIEW_H}`}
        className="h-full w-full touch-none"
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

      {/* Node context menu — a Radix DropdownMenu anchored to the press point.
          Radix owns outside-click / Escape / focus-trap / collision-flipping; we
          drive open state ourselves (opened by right-click or long-press above).
          The Trigger is a zero-size element positioned at the anchor — Radix
          flips the content to stay on-screen near a viewport edge. Its own menu,
          not the shared ExploreMenu, because this anchor is canvas-relative. */}
      <DropdownMenu.Root
        open={!!menu && !!menuNode}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
      >
        <DropdownMenu.Trigger
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none absolute h-0 w-0 p-0"
          style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
        />
        {/* Same panel as every other menu (shared MenuItems) — only the trigger
            differs, because this one is anchored to a canvas press point. */}
        <MenuItems
          align="start"
          items={[
            {
              label: "Explore further",
              icon: <Compass className="h-4 w-4" aria-hidden />,
              onClick: () => menuNode && onExplore?.(menuNode),
            },
            {
              label: "Remove from graph",
              icon: <Trash2 className="h-4 w-4" aria-hidden />,
              destructive: true,
              onClick: () => menuNode && onRemove?.(menuNode.id),
            },
          ]}
        />
      </DropdownMenu.Root>

      {/* Fit-to-view: frames every node perfectly. Icon-only and tiny. Hidden
          entirely when the view is already fitted (or there are no nodes) —
          clicking would change nothing, so we don't show it at all. */}
      {canFit && (
        <Tooltip
          label="Fit graph to view"
          side="right"
          className="absolute bottom-2 left-2"
        >
          <button
            type="button"
            onClick={fitView}
            aria-label="Fit graph to view"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-raised hover:text-content"
          >
            <Maximize2 className="h-4 w-4" aria-hidden />
          </button>
        </Tooltip>
      )}
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
