import { useEffect, useState } from "react";
import { useAgentEvents } from "../../shell/AgentEventContext";

// True between the planner asking ONE clarifying question (`clarify` event) and the
// next turn starting (`request_start`). During this window the turn has ENDED (busy
// is false — the clarify turn closed with [DONE]); the question + tappable options
// live in the chat panel. Widgets use this to point the user at the chat ("answer
// the question to fill this") instead of sitting on the inert empty/Update state.
//
// Cleared on request_start whether the user tapped a chip or typed a free-form
// answer. Shared so every empty data widget reacts identically (Bigsail has its own
// inline copy for its richer wait-state copy).
export function useAwaitingClarification(): boolean {
  const bus = useAgentEvents();
  const [awaiting, setAwaiting] = useState(false);
  useEffect(() => {
    return bus.subscribe((event) => {
      if (event.type === "clarify") setAwaiting(true);
      else if (event.type === "request_start") setAwaiting(false);
    });
  }, [bus]);
  return awaiting;
}
