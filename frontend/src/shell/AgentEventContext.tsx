import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
} from "react";

// The agent's runtime events, normalised for the frontend. These mirror the SSE
// wire events the backend emits (text / tool_start / tool_result / loop_start /
// error / [DONE]) plus two frontend-only signals (request_start, idle) that the
// chat hook raises itself — the backend never sees those.
//
// This is a pub/sub bus, not a state container: useChat emits as it reads the
// SSE stream, and any number of observers (the live agent-loop diagram, future
// telemetry) subscribe. Keeping it stateless means a turn produces zero re-renders
// for components that don't subscribe.
export type AgentEvent =
  | { type: "request_start" }
  | { type: "text"; content: string }
  // Display-only status blurb for the activity indicator (e.g. "Thinking it
  // through…"). Cosmetic — carries no tool semantics; observers that only care
  // about real loop milestones can ignore it.
  | { type: "status"; message: string }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_result"; tool: string; result: string }
  | { type: "loop_start"; iteration: number }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "idle" }
  // Frontend-only: a widget asks the chat to send a follow-up turn — the
  // "Explore further" node/row actions, and the empty-panel "Update" fills.
  // ChatPanel subscribes and calls sendMessage. `displayText`, when set, is the
  // terse transcript stand-in for a long fill instruction the user shouldn't read.
  | { type: "explore_request"; prompt: string; displayText?: string };

type Listener = (event: AgentEvent) => void;

export interface AgentEventBus {
  // Returns an unsubscribe function — call it in an effect cleanup.
  subscribe: (listener: Listener) => () => void;
  emit: (event: AgentEvent) => void;
}

const AgentEventContext = createContext<AgentEventBus | null>(null);

export function AgentEventProvider({ children }: { children: ReactNode }) {
  // Listeners live in a ref, not state — adding/removing a subscriber must never
  // re-render the provider or its subtree.
  const listeners = useRef(new Set<Listener>());

  const bus = useMemo<AgentEventBus>(
    () => ({
      subscribe(listener) {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
      emit(event) {
        // Snapshot before iterating: a listener may unsubscribe in response.
        for (const listener of [...listeners.current]) listener(event);
      },
    }),
    []
  );

  return (
    <AgentEventContext.Provider value={bus}>
      {children}
    </AgentEventContext.Provider>
  );
}

export function useAgentEvents(): AgentEventBus {
  const ctx = useContext(AgentEventContext);
  if (!ctx) {
    throw new Error("useAgentEvents must be used within an AgentEventProvider");
  }
  return ctx;
}
