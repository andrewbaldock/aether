import { useEffect, useRef, useState } from "react";
import { useAgentEvents } from "./AgentEventContext";
import { scriptFor } from "./toolProgressScripts";

// Scripted tool progress — the client-side drip that keeps the activity line
// moving during a slow tool's silent fetch window. On `tool_start` for a scripted
// tool it walks that tool's step list on timers; a REAL signal supersedes it at
// once: a backend `status` (e.g. the honest "Got 40 results…"), the `tool_result`,
// any answer `text`, or the turn settling. So real milestones always win, and the
// script only fills the gaps the backend can't cheaply report.
//
// Pure read-model (mirrors useWaitingMessage): returns the current scripted line
// or null. It never emits onto the bus, so there's no feedback with useChat's own
// status→toolActivity mapping. ChatPanel shows the real toolActivity first, this
// scripted line next, the calm filler last.
export function useToolProgress(isLoading: boolean): string | null {
  const bus = useAgentEvents();
  const [line, setLine] = useState<string | null>(null);

  // The pending step timer, so a new tool_start (or a real override) can cancel
  // the previous tool's remaining steps.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearTimer() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    // Stop the script and blank the line — used when a real signal takes over.
    function stop() {
      clearTimer();
      setLine(null);
    }

    const unsubscribe = bus.subscribe((event) => {
      switch (event.type) {
        case "tool_start": {
          const script = scriptFor(event.tool);
          clearTimer();
          if (!script || script.length === 0) {
            // Unscripted (fast) tool — let useChat's tool_start label stand.
            setLine(null);
            return;
          }
          // Walk the steps: show each, then schedule the next after its holdMs.
          // The last step has no follow-up timer, so it holds until a real event.
          let i = 0;
          const advance = () => {
            const step = script[i];
            if (!step) return;
            setLine(step.message);
            const next = script[i + 1];
            if (next) {
              i++;
              timerRef.current = setTimeout(advance, step.holdMs);
            }
          };
          advance();
          return;
        }
        // Any real output supersedes the script. tool_result and status come from
        // the backend; text is the model's answer/intent streaming in. request_start
        // resets for a fresh turn.
        case "status":
        case "tool_result":
        case "text":
        case "done":
        case "idle":
        case "error":
        case "request_start":
          stop();
          return;
      }
    });

    return () => {
      unsubscribe();
      clearTimer();
    };
  }, [bus]);

  // Turn ended — make sure nothing lingers.
  useEffect(() => {
    if (!isLoading && line !== null) setLine(null);
  }, [isLoading, line]);

  return line;
}
