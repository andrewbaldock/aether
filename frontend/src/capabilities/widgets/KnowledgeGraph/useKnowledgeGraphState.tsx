import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AgentEvent,
  useAgentEvents,
} from "../../../shell/AgentEventContext";
import { canonicalKey, findDuplicateId, remapLinkEndpoints } from "./dedup";
import type { EntityType, GraphLink, GraphNode, GraphPayload } from "./types";

// Position fields a ForceGraph reports back so saves capture the live layout
// (incl. drag-pinned coordinates), not just the seed positions on the nodes.
export interface NodePosition {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

// A save-ready snapshot of the whole graph. Shape matches PUT /api/sessions/:id/graph.
export interface GraphSnapshot {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface KnowledgeGraphState {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedId: string | null;
  select: (id: string | null) => void;

  // True between a build_knowledge_graph tool_start and its result (or the
  // turn ending). Lets the widget show a "mapping…" loading state when the
  // graph tool is running but no nodes have landed yet.
  isAwaitingGraph: boolean;

  // --- Persistence ---------------------------------------------------------
  // Bumped whenever the graph meaningfully changes (merge, remove, drag end).
  // The persistence bridge watches this to debounce-save.
  revision: number;
  // ForceGraph reports live node positions here so getSnapshot can include them.
  reportPositions: (positions: Map<string, NodePosition>) => void;
  // Build the current save snapshot, merging live positions over the nodes.
  getSnapshot: () => GraphSnapshot;
  // Replace the whole graph (used when a conversation is opened/restored).
  loadGraph: (snapshot: GraphSnapshot) => void;
  // Empty the graph (used when starting a new conversation).
  clearGraph: () => void;

  // --- Editing -------------------------------------------------------------
  removeNode: (id: string) => void;
  // Persist a node's dragged position (fixes it at x/y so the layout reloads).
  fixNodePosition: (id: string, x: number, y: number) => void;
  // ForceGraph calls this on drag end so the bridge re-saves the new layout.
  markDirty: () => void;
}

const VALID_TYPES: ReadonlySet<EntityType> = new Set([
  "person",
  "place",
  "concept",
  "org",
  "event",
]);

// Parse + validate a build_knowledge_graph tool_result string. Returns null on
// any malformed payload so one bad call can't tear down the graph. Exported for
// unit tests.
export function parsePayload(raw: string): GraphPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data == null || typeof data !== "object") return null;
  const { entities, relationships } = data as Record<string, unknown>;
  if (!Array.isArray(entities) || !Array.isArray(relationships)) return null;

  const validEntities = entities.filter(
    (e): e is GraphPayload["entities"][number] =>
      e != null &&
      typeof e === "object" &&
      typeof (e as Record<string, unknown>).id === "string" &&
      typeof (e as Record<string, unknown>).label === "string" &&
      VALID_TYPES.has((e as Record<string, unknown>).type as EntityType)
  );
  const validRelationships = relationships.filter(
    (r): r is GraphPayload["relationships"][number] =>
      r != null &&
      typeof r === "object" &&
      typeof (r as Record<string, unknown>).from === "string" &&
      typeof (r as Record<string, unknown>).to === "string"
  );

  const remove = Array.isArray((data as Record<string, unknown>).remove)
    ? ((data as Record<string, unknown>).remove as unknown[]).filter(
        (r): r is string => typeof r === "string"
      )
    : [];
  const merge = Array.isArray((data as Record<string, unknown>).merge)
    ? ((data as Record<string, unknown>).merge as unknown[]).filter(
        (m): m is { from: string; into: string } =>
          m != null &&
          typeof m === "object" &&
          typeof (m as Record<string, unknown>).from === "string" &&
          typeof (m as Record<string, unknown>).into === "string"
      )
    : [];

  return {
    entities: validEntities,
    relationships: validRelationships,
    remove,
    merge,
  };
}

// Key a link by its endpoints — endpoints can be strings (fresh) or node refs
// (after the sim binds them), so normalise to ids. Exported for unit tests.
export function linkKey(l: GraphLink): string {
  const from = typeof l.source === "string" ? l.source : l.source.id;
  const to = typeof l.target === "string" ? l.target : l.target.id;
  return `${from}→${to}`;
}

const KnowledgeGraphContext = createContext<KnowledgeGraphState | null>(null);

// Builds the live graph from build_knowledge_graph tool_results on the agent bus.
// Mounted at the app root so it subscribes once and never misses a payload — the
// widget itself only mounts when its tab is active, which can be *after* the
// first graph data arrives (the auto-open is what activates it). Merges
// additively: new entities/links accumulate across turns. Dedupes nodes by id
// and links by from→to. Also exposes load/save/edit actions so the graph can be
// persisted per conversation (see GraphPersistenceBridge).
export function KnowledgeGraphProvider({ children }: { children: ReactNode }) {
  const bus = useAgentEvents();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // True while a build_knowledge_graph call is in flight this turn (see below).
  const [isAwaitingGraph, setIsAwaitingGraph] = useState(false);
  // Bumped on any meaningful change so the persistence bridge can react.
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((r) => r + 1), []);

  // Id sets for O(1) dedupe without scanning the arrays on every merge.
  const nodeIds = useRef(new Set<string>());
  const linkKeys = useRef(new Set<string>());
  // canonicalKey → surviving node id. Lets an incoming entity whose slug drifted
  // (e.g. `marie-sklodowska-curie` vs the existing `marie-curie`) be recognised as
  // the same node and folded in rather than added as a twin. Kept in lockstep with
  // nodeIds on every mutation (add / load / clear / merge / remove).
  const canonicalKeys = useRef(new Map<string, string>());
  // A live mirror of `nodes` for the fuzzy-dedup fallback, which needs to scan the
  // current node list synchronously while processing a payload (state updates are
  // async). Updated wherever setNodes is called.
  const nodesRef = useRef<GraphNode[]>([]);
  // Latest live positions reported by the ForceGraph (id → x/y/fx/fy).
  const positionsRef = useRef(new Map<string, NodePosition>());

  const select = useCallback((id: string | null) => setSelectedId(id), []);

  // Minimum on-screen time for the "mapping…" loading state. A fast tool call
  // (start→result in a few ms) would otherwise flash by before it's perceptible
  // — and the tab only activates on tool_start, so the user would never see it.
  const MIN_LOADING_MS = 700;
  const loadingStartedAt = useRef(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Bus subscription: additive merge -------------------------------------
  useEffect(() => {
    // Clear the loading flag, but not before MIN_LOADING_MS has elapsed since it
    // turned on — so a near-instant tool call still shows a visible animation.
    function endLoading() {
      const elapsed = Date.now() - loadingStartedAt.current;
      const remaining = MIN_LOADING_MS - elapsed;
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (remaining <= 0) {
        setIsAwaitingGraph(false);
      } else {
        clearTimer.current = setTimeout(() => {
          setIsAwaitingGraph(false);
          clearTimer.current = null;
        }, remaining);
      }
    }

    function handle(event: AgentEvent) {
      // Loading flag: start "mapping…" the moment a turn begins (request_start)
      // and hold it until the graph data lands or the turn ends (done/error/idle).
      // Starting on the request — not on the build_knowledge_graph tool_start —
      // means the animation is up the whole time the model is working, not just
      // the sliver between the tool firing and returning. The widget only renders
      // when its tab is active (graph mode), so a non-graph turn shows nothing.
      if (event.type === "request_start") {
        if (clearTimer.current) {
          clearTimeout(clearTimer.current);
          clearTimer.current = null;
        }
        loadingStartedAt.current = Date.now();
        setIsAwaitingGraph(true);
        return;
      }
      if (
        event.type === "done" ||
        event.type === "error" ||
        event.type === "idle"
      ) {
        endLoading();
        return;
      }

      // Accept BOTH the streamed partials (paint as the graph spec arrives) and the
      // authoritative tool_result (the final reconcile). The merge below is additive
      // and idempotent — exact-id nodes and dup link keys are skipped — so applying a
      // growing partial and then the complete result converges with no double-adds.
      const isPartial = event.type === "tool_partial";
      if (event.type !== "tool_result" && event.type !== "tool_partial") return;
      if (event.tool !== "build_knowledge_graph") return;
      // Clear the "mapping…" spinner as soon as the first usable data lands (partial
      // or final) — that's the whole point: show something fast.
      endLoading();

      const raw = isPartial ? event.partialJson : event.result;
      const payload = parsePayload(raw);
      // A mid-token partial often isn't valid JSON yet → null. Skip this tick; the
      // next (larger) partial or the final tool_result will carry parseable data.
      if (!payload) return;

      // New nodes — but first fold slug-drift duplicates. For each incoming
      // entity: if its exact id is already known, it's a plain repeat (skip). Else
      // check whether it's the SAME entity under a different slug/name — an exact
      // canonical-key hit or a fuzzy same-type match against the nodes already on
      // screen. If so, record an alias (incoming id → surviving id) and don't add a
      // node; its relationships get rewired to the survivor below. Otherwise it's
      // genuinely new: add it and register both dedupe indexes.
      const aliasMap = new Map<string, string>();
      const freshNodes: GraphNode[] = [];
      for (const e of payload.entities) {
        if (nodeIds.current.has(e.id)) continue; // exact id already present
        const survivor = findDuplicateId(
          e,
          canonicalKeys.current,
          nodesRef.current
        );
        if (survivor && survivor !== e.id) {
          aliasMap.set(e.id, survivor); // drift duplicate — fold into survivor
          continue;
        }
        nodeIds.current.add(e.id);
        canonicalKeys.current.set(canonicalKey(e), e.id);
        const node: GraphNode = { ...e };
        freshNodes.push(node);
        nodesRef.current.push(node); // keep the fuzzy-scan mirror current within this payload
      }
      if (freshNodes.length > 0) {
        setNodes((prev) => [...prev, ...freshNodes]);
      }

      // New links — rewrite endpoints through the alias map first (so a link from a
      // folded id attaches to the survivor), then dedupe by from→to key and skip
      // self-loops. Drop any link whose endpoint isn't a live node: the model can
      // emit a relationship referencing an entity it never declared (or one folded
      // away), and d3-force throws "node not found" the instant it sees a dangling
      // endpoint. nodeIds.current already includes the freshNodes added just above,
      // so it's the authoritative live set at this point. (Endpoints removed later
      // in this same payload are stripped by the removal filter below.)
      const freshLinks: GraphLink[] = [];
      for (const r of payload.relationships) {
        const { source: from, target: to } = remapLinkEndpoints(
          { source: r.from, target: r.to },
          aliasMap
        );
        if (from === to) continue;
        if (!nodeIds.current.has(from) || !nodeIds.current.has(to)) continue; // dangling endpoint
        const key = `${from}→${to}`;
        if (linkKeys.current.has(key)) continue;
        linkKeys.current.add(key);
        freshLinks.push({ source: from, target: to, label: r.label });
      }
      if (freshLinks.length > 0) {
        setLinks((prev) => [...prev, ...freshLinks]);
      }

      // Merges — re-point links from absorbed node to survivor, queue absorbed for removal.
      const toRemove = new Set<string>(payload.remove ?? []);
      const merges = payload.merge ?? [];
      if (merges.length > 0) {
        const mergeMap = new Map(merges.map((m) => [m.from, m.into]));
        for (const from of mergeMap.keys()) toRemove.add(from);
        setLinks((prev) => {
          const next: GraphLink[] = [];
          for (const l of prev) {
            const src = typeof l.source === "string" ? l.source : l.source.id;
            const tgt = typeof l.target === "string" ? l.target : l.target.id;
            const { source: newSrc, target: newTgt } = remapLinkEndpoints(
              l,
              mergeMap
            );
            if (newSrc === newTgt) {
              linkKeys.current.delete(`${src}→${tgt}`);
              continue; // became self-loop after remap — drop it
            }
            const oldKey = `${src}→${tgt}`;
            const newKey = `${newSrc}→${newTgt}`;
            linkKeys.current.delete(oldKey);
            if (linkKeys.current.has(newKey)) continue; // already exists — dedupe
            linkKeys.current.add(newKey);
            next.push({ ...l, source: newSrc, target: newTgt });
          }
          return next;
        });
      }

      // Removals — drop nodes and any remaining links touching them. Covers both
      // explicit `remove` ids and the absorbed side of each merge.
      if (toRemove.size > 0) {
        for (const id of toRemove) {
          nodeIds.current.delete(id);
          positionsRef.current.delete(id);
        }
        // Drop removed nodes from the canonical index and the fuzzy-scan mirror.
        for (const n of nodesRef.current) {
          if (toRemove.has(n.id)) canonicalKeys.current.delete(canonicalKey(n));
        }
        nodesRef.current = nodesRef.current.filter((n) => !toRemove.has(n.id));
        setNodes((prev) => prev.filter((n) => !toRemove.has(n.id)));
        setLinks((prev) =>
          prev.filter((l) => {
            const from = typeof l.source === "string" ? l.source : l.source.id;
            const to = typeof l.target === "string" ? l.target : l.target.id;
            if (toRemove.has(from) || toRemove.has(to)) {
              linkKeys.current.delete(`${from}→${to}`);
              return false;
            }
            return true;
          })
        );
      }

      if (
        freshNodes.length > 0 ||
        freshLinks.length > 0 ||
        toRemove.size > 0 ||
        merges.length > 0
      )
        bump();
    }

    const unsubscribe = bus.subscribe(handle);
    return () => {
      unsubscribe();
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, [bus, bump]);

  // Watchdog: a last-resort cap on the loading state. The bus events
  // (done/error/idle/tool_result) are the normal way "mapping…" clears, and the
  // abort path now emits idle too — but a dropped connection, a backgrounded tab
  // that never delivers the terminal event, or any future gap could still strand
  // the spinner. If it's been on longer than any real turn should take, force it
  // off. Re-armed whenever the flag turns on.
  const MAX_LOADING_MS = 90_000;
  useEffect(() => {
    if (!isAwaitingGraph) return;
    const watchdog = setTimeout(() => {
      setIsAwaitingGraph(false);
      if (clearTimer.current) {
        clearTimeout(clearTimer.current);
        clearTimer.current = null;
      }
    }, MAX_LOADING_MS);
    return () => clearTimeout(watchdog);
  }, [isAwaitingGraph]);

  // --- Persistence helpers --------------------------------------------------
  const reportPositions = useCallback(
    (positions: Map<string, NodePosition>) => {
      positionsRef.current = positions;
    },
    []
  );

  const getSnapshot = useCallback((): GraphSnapshot => {
    // Merge the latest live positions over each node so a save captures the
    // current layout (and any drag-pinned fx/fy), not just seed coordinates.
    const snapNodes = nodes.map((n) => {
      const pos = positionsRef.current.get(n.id);
      return pos ? { ...n, ...pos } : { ...n };
    });
    // Normalise link endpoints to ids — the sim may have replaced them with
    // node object refs, which we don't want to serialise.
    const snapLinks = links.map((l) => ({
      source: typeof l.source === "string" ? l.source : l.source.id,
      target: typeof l.target === "string" ? l.target : l.target.id,
      label: l.label,
    }));
    return { nodes: snapNodes, links: snapLinks };
  }, [nodes, links]);

  const loadGraph = useCallback((snapshot: GraphSnapshot) => {
    const loadedNodes = snapshot.nodes.map((n) => ({ ...n }));
    nodeIds.current = new Set(loadedNodes.map((n) => n.id));
    linkKeys.current = new Set(snapshot.links.map(linkKey));
    // Rebuild the canonical index so future incoming entities can fold into the
    // restored nodes. We don't retroactively merge any pre-existing duplicates in
    // the snapshot — loading shouldn't reshape a user's saved layout — so this is
    // a plain last-wins index over whatever was persisted.
    canonicalKeys.current = new Map(
      loadedNodes.map((n) => [canonicalKey(n), n.id])
    );
    nodesRef.current = loadedNodes;
    positionsRef.current = new Map(
      loadedNodes.map((n) => [
        n.id,
        { x: n.x, y: n.y, fx: n.fx ?? null, fy: n.fy ?? null },
      ])
    );
    setNodes(loadedNodes);
    setLinks(snapshot.links.map((l) => ({ ...l })));
    setSelectedId(null);
    // No bump — loading shouldn't trigger a save-back of what we just loaded.
  }, []);

  const clearGraph = useCallback(() => {
    nodeIds.current = new Set();
    linkKeys.current = new Set();
    canonicalKeys.current = new Map();
    nodesRef.current = [];
    positionsRef.current = new Map();
    setNodes([]);
    setLinks([]);
    setSelectedId(null);
  }, []);

  // --- Editing --------------------------------------------------------------
  const removeNode = useCallback(
    (id: string) => {
      nodeIds.current.delete(id);
      positionsRef.current.delete(id);
      // Drop it from the canonical index + fuzzy-scan mirror so a later mention of
      // the same entity is treated as new rather than folded into a ghost.
      const removed = nodesRef.current.find((n) => n.id === id);
      if (removed) canonicalKeys.current.delete(canonicalKey(removed));
      nodesRef.current = nodesRef.current.filter((n) => n.id !== id);
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setLinks((prev) => {
        const kept = prev.filter((l) => {
          const from = typeof l.source === "string" ? l.source : l.source.id;
          const to = typeof l.target === "string" ? l.target : l.target.id;
          if (from === id || to === id) {
            linkKeys.current.delete(`${from}→${to}`);
            return false;
          }
          return true;
        });
        return kept;
      });
      setSelectedId((sel) => (sel === id ? null : sel));
      bump();
    },
    [bump]
  );

  // Persist a node's dragged position: fix it at (x, y) via d3's fx/fy so the
  // layout the user arranges survives saves and reloads. (There's no inverse
  // "release" affordance — once placed, a node lives where it was dropped; to
  // move it, drag it again.)
  const fixNodePosition = useCallback(
    (id: string, x: number, y: number) => {
      const pos = positionsRef.current.get(id) ?? {};
      positionsRef.current.set(id, { ...pos, x, y, fx: x, fy: y });
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, x, y, fx: x, fy: y } : n))
      );
      bump();
    },
    [bump]
  );

  const markDirty = useCallback(() => bump(), [bump]);

  const value = useMemo<KnowledgeGraphState>(
    () => ({
      nodes,
      links,
      selectedId,
      select,
      isAwaitingGraph,
      revision,
      reportPositions,
      getSnapshot,
      loadGraph,
      clearGraph,
      removeNode,
      fixNodePosition,
      markDirty,
    }),
    [
      nodes,
      links,
      selectedId,
      select,
      isAwaitingGraph,
      revision,
      reportPositions,
      getSnapshot,
      loadGraph,
      clearGraph,
      removeNode,
      fixNodePosition,
      markDirty,
    ]
  );

  return (
    <KnowledgeGraphContext.Provider value={value}>
      {children}
    </KnowledgeGraphContext.Provider>
  );
}

export function useKnowledgeGraphState(): KnowledgeGraphState {
  const ctx = useContext(KnowledgeGraphContext);
  if (!ctx) {
    throw new Error(
      "useKnowledgeGraphState must be used within a KnowledgeGraphProvider"
    );
  }
  return ctx;
}
