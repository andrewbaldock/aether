import type { Widget } from "../../registry";
import { DiagramSvg } from "./DiagramSvg";
import { Legend } from "./Legend";
import { NODES, type Role } from "./nodes";
import { StepConsole } from "./StepConsole";
import { useAgentDiagramState } from "./useAgentDiagramState";

// "Aether in Action" — a live, animated diagram of the agent loop. It subscribes
// to the AgentEventBus (the same events useChat reads off the SSE stream) and
// lights up each node as the turn runs: request → Claude → tokens → stop_reason
// → tool → loop-back → done. The `widget` prop is unused; all state is live.
export function AgentDiagramWidget(_props: { widget: Widget }) {
  const { nodeStatuses, loopCount, activeToolName, log } =
    useAgentDiagramState();

  // A role is "active" when any node of that role is currently lit. The legend
  // dims all pills and highlights these.
  const activeRoles = new Set<Role>();
  for (const node of NODES) {
    const status = nodeStatuses[node.id];
    if (status === "active" || status === "looping") activeRoles.add(node.role);
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <Legend activeRoles={activeRoles} />
      <div className="min-h-0 flex-1 p-3">
        <DiagramSvg
          nodeStatuses={nodeStatuses}
          loopCount={loopCount}
          activeToolName={activeToolName}
        />
      </div>
      <StepConsole log={log} />
    </div>
  );
}
