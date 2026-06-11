import { ThinkingGlyph } from "../../../brand/ThinkingGlyph";
import { useAgentEvents } from "../../../shell/AgentEventContext";
import { useSessionContext } from "../../../shell/SessionContext";
import type { Widget } from "../../registry";
import { useFillFromConversation } from "../useFillFromConversation";
import { WidgetEmptyState } from "../WidgetEmptyState";
import { ForceGraph } from "./ForceGraph";
import { GraphLoading } from "./GraphLoading";
import { NodeDetail } from "./NodeDetail";
import type { GraphNode } from "./types";
import { useKnowledgeGraphState } from "./useKnowledgeGraphState";

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
    isAwaitingGraph,
    reportPositions,
    pinNode,
    unpinNode,
    removeNode,
  } = useKnowledgeGraphState();
  const bus = useAgentEvents();
  const { messages } = useSessionContext();
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const fill = useFillFromConversation({
    hasContent: nodes.length > 0,
    gentlePrompt:
      "Looking back at what we've already discussed, map out the key entities now and how they connect. This is about the conversation so far, not future messages — if there's genuinely nothing to map yet, just say so briefly.",
    forcedPrompt:
      "Call the build_knowledge_graph tool right now to extract the entities and relationships from our conversation so far.",
    displayText: "Update the Knowledge Graph from our conversation.",
  });

  // "Explore further" — ask the chat (via the bus) to dig into this node and how
  // it connects to the rest of the graph. ChatPanel turns this into a real turn.
  function exploreNode(node: GraphNode) {
    bus.emit({
      type: "explore_request",
      prompt: `Tell me more about ${node.label}, and how it connects to the other entities in this conversation.`,
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      {/* Graph / empty state */}
      <div className="min-h-0 flex-1">
        {nodes.length === 0 ? (
          isAwaitingGraph ? (
            <GraphLoading />
          ) : (
            <WidgetEmptyState
              invitation="Start chatting — entities will appear here as the conversation unfolds."
              hasConversation={messages.length > 0}
              canUpdate={fill.canUpdate}
              onUpdate={fill.onUpdate}
              onReset={fill.reset}
            />
          )
        ) : (
          <div className="relative h-full">
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
            {isAwaitingGraph && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 backdrop-blur-sm">
                <ThinkingGlyph height={18} animate />
                <span className="font-display text-xs font-medium text-content-muted">
                  Updating…
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail */}
      {selectedNode && (
        <NodeDetail node={selectedNode} onClose={() => select(null)} />
      )}
    </div>
  );
}
