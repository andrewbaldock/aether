import { useAgentEvents } from "../../../shell/AgentEventContext";
import type { Widget } from "../../registry";
import { TYPE_COLOR, TYPE_LABEL } from "./colors";
import { ForceGraph } from "./ForceGraph";
import { NodeDetail } from "./NodeDetail";
import type { EntityType, GraphNode } from "./types";
import { useKnowledgeGraphState } from "./useKnowledgeGraphState";

const LEGEND_TYPES: EntityType[] = [
  "person",
  "place",
  "concept",
  "org",
  "event",
];

// "Knowledge Graph" — a live, animated force-directed graph built from the
// build_knowledge_graph tool calls Claude makes while graph mode is on. It
// subscribes to the same AgentEventBus the agent diagram does. Click a node for
// its Wikipedia summary. The `widget` prop is unused; all state is live.
export function KnowledgeGraphWidget(_props: { widget: Widget }) {
  const {
    nodes,
    links,
    selectedId,
    select,
    reportPositions,
    pinNode,
    unpinNode,
    removeNode,
  } = useKnowledgeGraphState();
  const bus = useAgentEvents();
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  // "Explore further" — ask the chat (via the bus) to dig into this node and how
  // it connects to the rest of the graph. ChatPanel turns this into a real turn.
  function exploreNode(node: GraphNode) {
    bus.emit({
      type: "explore_request",
      prompt: `Tell me more about ${node.label}, and how it connects to the other entities in this conversation.`,
    });
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
        {LEGEND_TYPES.map((t) => (
          <span key={t} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TYPE_COLOR[t] }}
            />
            <span className="text-content-muted">{TYPE_LABEL[t]}</span>
          </span>
        ))}
      </div>

      {/* Graph / empty state */}
      <div className="min-h-0 flex-1">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-content-subtle">
            Start chatting — entities will appear here as the conversation
            unfolds.
          </div>
        ) : (
          <ForceGraph
            nodes={nodes}
            links={links}
            selectedId={selectedId}
            onSelect={select}
            onReportPositions={reportPositions}
            onPin={pinNode}
            onUnpin={unpinNode}
            onRemove={removeNode}
            onExplore={exploreNode}
          />
        )}
      </div>

      {/* Detail */}
      {selectedNode && (
        <NodeDetail node={selectedNode} onClose={() => select(null)} />
      )}
    </div>
  );
}
