import { ThinkingGlyph } from "../../../brand/ThinkingGlyph";
import { useAgentEvents } from "../../../shell/AgentEventContext";
import {
  useCurrentSessionTitle,
  useSessionContext,
} from "../../../shell/SessionContext";
import type { Widget } from "../../registry";
import { useAwaitingClarification } from "../useAwaitingClarification";
import { useFillFromConversation } from "../useFillFromConversation";
import { useQueuedExplore } from "../useQueuedExplore";
import { WidgetEmptyState } from "../WidgetEmptyState";
import { WidgetReloadHeader } from "../WidgetReloadHeader";
import { ForceGraph } from "./ForceGraph";
import { GraphLoading } from "./GraphLoading";
import { NodeDetail } from "./NodeDetail";
import type { GraphNode } from "./types";
import { useKnowledgeGraphState } from "./useKnowledgeGraphState";

// Shared by the empty-panel fill and the populated-widget reload so they stay aligned.
const GRAPH_BUILD_PROMPT =
  "Build the best knowledge graph you can about what we've been discussing. Map the key entities in the subject and how they connect — and broaden from what was literally said: surface the real people, places, concepts, and organizations the topic involves, not only ones named outright. This is about the conversation so far, not future messages. Don't ask whether to do it or offer to do it later — call build_knowledge_graph now. Only skip if the subject genuinely has no entities or relationships to map at all.";

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
    fixNodePosition,
    removeNode,
    clearGraph,
  } = useKnowledgeGraphState();
  const bus = useAgentEvents();
  const { messages } = useSessionContext();
  const sessionTitle = useCurrentSessionTitle();
  const awaitingClarification = useAwaitingClarification();
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const fill = useFillFromConversation({
    hasContent: nodes.length > 0,
    gentlePrompt: GRAPH_BUILD_PROMPT,
    forcedPrompt:
      "Call the build_knowledge_graph tool right now to extract the entities and relationships from our conversation so far.",
    displayText: "Update the Knowledge Graph from our conversation.",
  });

  // Reload = clear the graph and rebuild fresh; queues if a turn's in flight.
  const reload = useQueuedExplore();
  function onReload() {
    reload.enqueue({
      prompt: GRAPH_BUILD_PROMPT,
      displayText: "Rebuild the Knowledge Graph from our conversation.",
      onFire: clearGraph,
    });
  }

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
              awaitingClarification={awaitingClarification}
            />
          )
        ) : (
          <div className="relative flex h-full flex-col">
            <WidgetReloadHeader
              title={sessionTitle ?? "Knowledge Graph"}
              onReload={onReload}
              queued={reload.queued}
              label="Rebuild the knowledge graph from the conversation"
            />
            <div className="relative min-h-0 flex-1">
              <ForceGraph
                nodes={nodes}
                links={links}
                selectedId={selectedId}
                onSelect={select}
                onReportPositions={reportPositions}
                onPositionNode={fixNodePosition}
                onRemove={removeNode}
                onExplore={exploreNode}
                // Full tool panel: don't auto-frame. The graph builds at its natural
                // position and stays put; the user frames it via the Fit button.
                autoFitEnabled={false}
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
