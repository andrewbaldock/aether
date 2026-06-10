import { useEffect, useRef, useState } from "react";
import { useAgentEvents } from "./AgentEventContext";
import { nextWaitingMessage } from "./waitingMessages";

// How long the turn must be quiet (no text / status / tool_start) before filler
// kicks in, and how often the filler line then rotates. Kept generous so filler
// only appears in genuine dead air — never flickering between rapid real events.
const QUIET_BEFORE_FILLER_MS = 3000;
const ROTATE_EVERY_MS = 4500;
// Poll cadence for the "has it been quiet long enough?" check.
const TICK_MS = 1000;

// Returns a calm filler line to show beneath the thinking glyph, or null when
// there's nothing to show (not loading, or a real status/token arrived recently).
//
// Self-contained: it subscribes to the agent event bus to learn when real
// activity (text / status / tool_start) last landed, so ChatPanel needs no extra
// wiring. The real status line (message.toolActivity) takes precedence in the UI;
// this is purely the gap-filler.
export function useWaitingMessage(isLoading: boolean): string | null {
  const bus = useAgentEvents();
  const [filler, setFiller] = useState<string | null>(null);

  // Timestamps in refs so the bus subscription and the interval can read/write
  // them without re-subscribing or restarting the timer on every event.
  const lastActivityRef = useRef<number>(Date.now());
  const lastRotateRef = useRef<number>(0);
  const fillerRef = useRef<string | null>(null);

  // Bump the activity clock on any real agent output. While that output keeps
  // arriving, the quiet window never elapses and no filler shows.
  useEffect(() => {
    const unsubscribe = bus.subscribe((event) => {
      if (
        event.type === "text" ||
        event.type === "status" ||
        event.type === "tool_start" ||
        event.type === "request_start"
      ) {
        lastActivityRef.current = Date.now();
        if (fillerRef.current !== null) {
          fillerRef.current = null;
          setFiller(null);
        }
      }
    });
    return unsubscribe;
  }, [bus]);

  useEffect(() => {
    if (!isLoading) {
      // Turn ended — drop any filler and reset so the next turn starts clean.
      fillerRef.current = null;
      setFiller(null);
      lastActivityRef.current = Date.now();
      lastRotateRef.current = 0;
      return;
    }

    const id = setInterval(() => {
      const now = Date.now();
      const quietFor = now - lastActivityRef.current;
      if (quietFor < QUIET_BEFORE_FILLER_MS) return;
      if (now - lastRotateRef.current < ROTATE_EVERY_MS) return;
      lastRotateRef.current = now;
      const next = nextWaitingMessage(fillerRef.current ?? undefined);
      fillerRef.current = next;
      setFiller(next);
    }, TICK_MS);

    return () => clearInterval(id);
  }, [isLoading]);

  return filler;
}
