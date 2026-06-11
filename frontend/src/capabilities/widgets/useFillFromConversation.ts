import { useEffect, useRef, useState } from "react";
import { useAgentEvents } from "../../shell/AgentEventContext";
import { useAgentBusy } from "../../shell/useAgentBusy";

export type FillStage = "idle" | "gentle" | "forced" | "gaveup";

// Drives the empty-panel "Update" escalation for a single capability.
//
// A panel only fills when the agent calls its render_* tool, which it may decline
// to do. This hook lets the user say "fill this from the conversation" and gives the
// agent two graded chances before giving up:
//   idle → (click) gentle prompt → (no content) forced prompt → (no content) gaveup
// If content lands at any point, `hasContent` flips and we reset to idle so the
// widget just renders its data.
//
// The agent bus is fire-and-forget, so we track which attempt is pending in a ref
// and escalate when the turn settles (done/idle/error). While a turn is in flight
// the widget shows its own WidgetLoading (busy === true), so this hook only governs
// what shows once the agent is idle: the Update button (idle), or the "Got nothin'!"
// message (gaveup).
export function useFillFromConversation(opts: {
  hasContent: boolean;
  gentlePrompt: string;
  forcedPrompt: string;
  // Terse transcript stand-in for both prompts (e.g. "Update the Timeline"), so the
  // user never sees the verbose fill instructions in the chat.
  displayText: string;
}): {
  stage: FillStage;
  canUpdate: boolean;
  onUpdate: () => void;
  reset: () => void;
} {
  const { hasContent, gentlePrompt, forcedPrompt, displayText } = opts;
  const bus = useAgentEvents();
  const busy = useAgentBusy();
  const [stage, setStage] = useState<FillStage>("idle");

  // The stage whose turn is currently in flight, awaiting a settle event. null when
  // nothing we triggered is pending (e.g. an unrelated turn the user started).
  const pendingRef = useRef<"gentle" | "forced" | null>(null);
  const forcedPromptRef = useRef(forcedPrompt);
  forcedPromptRef.current = forcedPrompt;
  const displayTextRef = useRef(displayText);
  displayTextRef.current = displayText;

  // Content arrived → success, wherever we were. Covers the fill working, the user
  // re-asking manually, and switching conversations.
  useEffect(() => {
    if (hasContent) {
      pendingRef.current = null;
      setStage("idle");
    }
  }, [hasContent]);

  useEffect(() => {
    return bus.subscribe((event) => {
      if (
        event.type !== "done" &&
        event.type !== "idle" &&
        event.type !== "error"
      ) {
        return;
      }
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      // If content landed this turn the hasContent effect already reset us to idle.
      if (pending === "gentle") {
        // Gentle struck out → escalate to the firmer, tool-naming prompt.
        pendingRef.current = "forced";
        setStage("forced");
        bus.emit({
          type: "explore_request",
          prompt: forcedPromptRef.current,
          displayText: displayTextRef.current,
        });
      } else {
        // Forced struck out too → give up gracefully.
        setStage("gaveup");
      }
    });
  }, [bus]);

  function onUpdate() {
    // Mirror ChatPanel's !isLoading guard: never stack a click onto an in-flight turn.
    if (busy || pendingRef.current) return;
    pendingRef.current = "gentle";
    setStage("gentle");
    bus.emit({ type: "explore_request", prompt: gentlePrompt, displayText });
  }

  function reset() {
    pendingRef.current = null;
    setStage("idle");
  }

  return {
    stage,
    canUpdate: stage !== "gaveup",
    onUpdate,
    reset,
  };
}
