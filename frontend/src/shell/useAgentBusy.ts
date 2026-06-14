import { useEffect, useState } from "react";
import { useAgentEvents } from "./AgentEventContext";

// True while the agent is working a turn: from `request_start` until the turn
// settles (`done` / `idle` / `error`). Lets any widget show its own loading
// state while the backend is busy — even if that particular widget never ends up
// with content this turn. Mirrors the bus signals ChatPanel's `isLoading` is
// derived from, but available anywhere without threading props through.
//
// Subscribes with { replay: true }: a consumer that mounts MID-TURN (Bigsail's
// tab only exists once it's the active view, so on a fresh conversation the canvas
// mounts AFTER request_start has already fired) catches up to the current phase
// instead of starting `busy=false` and sitting on the empty-state copy for the
// whole turn. The replayed event is the last coarse phase milestone the bus
// remembers — request_start/text/tool_start/loop_start mean a turn is live;
// done/idle mean it settled. (See the Bigsail loading contract.)
export function useAgentBusy(): boolean {
  const bus = useAgentEvents();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    return bus.subscribe(
      (event) => {
        // Any non-terminal phase milestone means a turn is in flight. Keying on
        // the terminal set (rather than only request_start) lets a replayed
        // mid-turn phase like `text`/`tool_start` correctly land us busy.
        if (
          event.type === "done" ||
          event.type === "idle" ||
          event.type === "error"
        )
          setBusy(false);
        else if (
          event.type === "request_start" ||
          event.type === "text" ||
          event.type === "tool_start" ||
          event.type === "loop_start"
        )
          setBusy(true);
      },
      { replay: true }
    );
  }, [bus]);
  return busy;
}
