import { useEffect, useState } from "react";
import { useAgentEvents } from "./AgentEventContext";

// True while the agent is working a turn: from `request_start` until the turn
// settles (`done` / `idle` / `error`). Lets any widget show its own loading
// state while the backend is busy — even if that particular widget never ends up
// with content this turn. Mirrors the bus signals ChatPanel's `isLoading` is
// derived from, but available anywhere without threading props through.
export function useAgentBusy(): boolean {
  const bus = useAgentEvents();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    return bus.subscribe((event) => {
      if (event.type === "request_start") setBusy(true);
      else if (
        event.type === "done" ||
        event.type === "idle" ||
        event.type === "error"
      )
        setBusy(false);
    });
  }, [bus]);
  return busy;
}
