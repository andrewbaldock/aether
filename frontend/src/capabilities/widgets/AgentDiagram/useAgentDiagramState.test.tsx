import { act, render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  type AgentEventBus,
  AgentEventProvider,
  useAgentEvents,
} from "../../../shell/AgentEventContext";
import type { NodeStatus } from "./DiagramSvg";
import type { NodeId } from "./nodes";
import {
  type DiagramState,
  useAgentDiagramState,
} from "./useAgentDiagramState";

// Drives a real provider: a child grabs the bus and can emit, and the diagram
// hook is mounted on demand so we can reproduce a MID-TURN mount (subscribe
// after tool_start has already fired). Exposes the latest diagram state and a
// couple of controls back to the test via callbacks.
function Harness({
  onBus,
  onState,
  mounted,
}: {
  onBus: (bus: AgentEventBus) => void;
  onState: (s: DiagramState) => void;
  mounted: boolean;
}) {
  const bus = useAgentEvents();
  onBus(bus);
  return mounted ? <Diagram onState={onState} /> : null;
}

function Diagram({ onState }: { onState: (s: DiagramState) => void }) {
  onState(useAgentDiagramState());
  return null;
}

function isLit(s: NodeStatus | undefined): boolean {
  return s === "active" || s === "looping";
}

function anyLit(statuses: Record<NodeId, NodeStatus>): boolean {
  return Object.values(statuses).some(isLit);
}

describe("useAgentDiagramState replay", () => {
  it("lands lit when it mounts mid-turn (after tool_start)", () => {
    let bus!: AgentEventBus;
    let state!: DiagramState;
    let setMounted!: (m: boolean) => void;

    function Root() {
      const [mounted, setM] = useState(false);
      setMounted = setM;
      return (
        <AgentEventProvider>
          <Harness
            onBus={(b) => (bus = b)}
            onState={(s) => (state = s)}
            mounted={mounted}
          />
        </AgentEventProvider>
      );
    }

    render(<Root />);

    // A turn is already underway and the model just called a tool — but the
    // diagram isn't mounted yet (e.g. Welcome not open).
    act(() => {
      bus.emit({ type: "request_start" });
      bus.emit({ type: "text", content: "Let me look that up." });
      bus.emit({ type: "tool_start", tool: "wikidata_query", input: {} });
    });

    // Now the diagram mounts mid-turn. Without replay it would sit at INITIAL
    // (all idle) until the next live event; with replay it catches up.
    act(() => setMounted(true));

    expect(state.phase).toBe("tool_use");
    expect(state.activeToolName).toBe("wikidata_query");
    expect(anyLit(state.nodeStatuses)).toBe(true);
    expect(isLit(state.nodeStatuses.tool_exec)).toBe(true);
  });

  it("stays idle when it mounts with no turn in flight", () => {
    let state!: DiagramState;

    function Root() {
      return (
        <AgentEventProvider>
          <Harness onBus={() => {}} onState={(s) => (state = s)} mounted />
        </AgentEventProvider>
      );
    }

    render(<Root />);
    expect(state.phase).toBe("idle");
    expect(anyLit(state.nodeStatuses)).toBe(false);
  });
});
