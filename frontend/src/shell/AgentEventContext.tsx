import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
} from "react";
import type { CompositionPlan } from "../lib/composition";

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
  // The backend planner's abstract composition plan for this turn — which
  // capabilities participate and how they relate (never coordinates). Emitted
  // pre-loop on complex turns. BigsailPlanProvider stores the latest; the canvas
  // consumes it to order cards and draw flowchart edges.
  | { type: "plan"; plan: CompositionPlan }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "idle" }
  // Frontend-only: a widget asks the chat to send a follow-up turn — the
  // "Explore further" node/row actions, and the empty-panel "Update" fills.
  // ChatPanel subscribes and calls sendMessage. `displayText`, when set, is the
  // terse transcript stand-in for a long fill instruction the user shouldn't read.
  | { type: "explore_request"; prompt: string; displayText?: string };

// A listener receives each event plus a `replay` flag: true only for the
// catch-up event a new subscriber gets on subscribe (see below), false for live
// emits. Observers that rebuild visual state can use the replayed phase to land
// lit; observers with side effects (logging, network) ignore replays.
type Listener = (event: AgentEvent, replay: boolean) => void;

// The coarse phase events worth replaying to a late subscriber — the milestones
// that define "where in the turn are we right now". A subscriber that mounts
// mid-turn (e.g. the Welcome diagram opened while a turn is in flight) would
// otherwise miss every one of these and sit idle until the next live event.
const PHASE_EVENTS = new Set<AgentEvent["type"]>([
  "request_start",
  "text",
  "tool_start",
  "loop_start",
  "done",
  "idle",
]);

// Is this event a coarse phase milestone (so the bus should remember it for
// replay)? Fine-grained or side-channel events (status, tool_result, plan,
// error, explore_request) are deliberately excluded — replaying them to a
// late subscriber would be noise, not a useful "current phase".
export function isPhaseEvent(event: AgentEvent): boolean {
  return PHASE_EVENTS.has(event.type);
}

// Given the previously-remembered phase and a freshly emitted event, return the
// phase the bus should retain going forward: the new event if it's a phase
// milestone, otherwise the unchanged previous one. Pure so it's unit-testable
// without standing up the React provider.
export function nextLastPhase(
  prev: AgentEvent | null,
  event: AgentEvent
): AgentEvent | null {
  return isPhaseEvent(event) ? event : prev;
}

export interface AgentEventBus {
  // Subscribe to live events. Returns an unsubscribe function — call it in an
  // effect cleanup.
  //
  // Opt in with { replay: true } and the listener is ALSO called once on
  // subscribe with the most-recent coarse phase event (replay flag = true), so a
  // subscriber that mounts mid-turn catches up to the current phase instead of
  // starting idle. Default is no replay — most subscribers have side effects
  // (scripted progress, network fills) that must fire only on live events, so
  // replay stays off unless a subscriber explicitly rebuilds visual state from it.
  subscribe: (listener: Listener, opts?: { replay?: boolean }) => () => void;
  emit: (event: AgentEvent) => void;
}

const AgentEventContext = createContext<AgentEventBus | null>(null);

export function AgentEventProvider({ children }: { children: ReactNode }) {
  // Listeners live in a ref, not state — adding/removing a subscriber must never
  // re-render the provider or its subtree.
  const listeners = useRef(new Set<Listener>());
  // The single most-recent coarse phase event (see PHASE_EVENTS). This is the
  // ONLY state the bus retains — it stays a pub/sub bus, not a state container.
  // Replayed to each new subscriber so a mid-turn mount lands in the right phase.
  const lastPhase = useRef<AgentEvent | null>(null);

  const bus = useMemo<AgentEventBus>(
    () => ({
      subscribe(listener, opts) {
        listeners.current.add(listener);
        // Catch the new subscriber up to the current phase, flagged as a replay
        // so it can rebuild visuals without re-running side effects. Opt-in only.
        if (opts?.replay && lastPhase.current)
          listener(lastPhase.current, true);
        return () => listeners.current.delete(listener);
      },
      emit(event) {
        lastPhase.current = nextLastPhase(lastPhase.current, event);
        // Snapshot before iterating: a listener may unsubscribe in response.
        for (const listener of [...listeners.current]) listener(event, false);
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
