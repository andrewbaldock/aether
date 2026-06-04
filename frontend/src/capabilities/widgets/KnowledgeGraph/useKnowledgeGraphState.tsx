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
import type { EntityType, GraphLink, GraphNode, GraphPayload } from "./types";

export interface KnowledgeGraphState {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedId: string | null;
  select: (id: string | null) => void;
}

const VALID_TYPES: ReadonlySet<EntityType> = new Set([
  "person",
  "place",
  "concept",
  "org",
  "event",
]);

// Parse + validate a build_knowledge_graph tool_result string. Returns null on
// any malformed payload so one bad call can't tear down the graph.
function parsePayload(raw: string): GraphPayload | null {
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

  return { entities: validEntities, relationships: validRelationships };
}

const KnowledgeGraphContext = createContext<KnowledgeGraphState | null>(null);

// Builds the live graph from build_knowledge_graph tool_results on the agent bus.
// Mounted at the app root so it subscribes once and never misses a payload — the
// widget itself only mounts when its tab is active, which can be *after* the
// first graph data arrives (the auto-open is what activates it). Merges
// additively: new entities/links accumulate across turns and are never reset on a
// new send. Dedupes nodes by id and links by from→to.
export function KnowledgeGraphProvider({ children }: { children: ReactNode }) {
  const bus = useAgentEvents();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Id sets for O(1) dedupe without scanning the arrays on every merge.
  const nodeIds = useRef(new Set<string>());
  const linkKeys = useRef(new Set<string>());

  const select = useCallback((id: string | null) => setSelectedId(id), []);

  useEffect(() => {
    function handle(event: AgentEvent) {
      if (event.type !== "tool_result") return;
      if (event.tool !== "build_knowledge_graph") return;

      const payload = parsePayload(event.result);
      if (!payload) return;

      // New nodes — preserve any existing node's simulation position by id.
      const freshNodes = payload.entities.filter(
        (e) => !nodeIds.current.has(e.id)
      );
      if (freshNodes.length > 0) {
        for (const e of freshNodes) nodeIds.current.add(e.id);
        setNodes((prev) => [...prev, ...freshNodes.map((e) => ({ ...e }))]);
      }

      // New links — dedupe by from→to key; skip self-loops.
      const freshLinks: GraphLink[] = [];
      for (const r of payload.relationships) {
        if (r.from === r.to) continue;
        const key = `${r.from}→${r.to}`;
        if (linkKeys.current.has(key)) continue;
        linkKeys.current.add(key);
        freshLinks.push({ source: r.from, target: r.to, label: r.label });
      }
      if (freshLinks.length > 0) {
        setLinks((prev) => [...prev, ...freshLinks]);
      }
    }

    const unsubscribe = bus.subscribe(handle);
    return unsubscribe;
  }, [bus]);

  const value = useMemo<KnowledgeGraphState>(
    () => ({ nodes, links, selectedId, select }),
    [nodes, links, selectedId, select]
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
