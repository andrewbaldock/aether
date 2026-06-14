import { useEffect, useRef, useState } from "react";
import { useAgentEvents } from "../../shell/AgentEventContext";
import { useAgentBusy } from "../../shell/useAgentBusy";

// A widget action that wants to fire a chat turn (reload, "Get more", a contextual
// "Explore further") — the same payload the AgentEventBus carries for explore_request.
export interface QueuedExplore {
  prompt: string;
  // Terse transcript stand-in shown in the chat instead of a long instruction.
  displayText?: string;
  // Optional side effect to run the moment the request actually fires (not when it's
  // queued) — e.g. clearEntries() for a "reload" so the widget rebuilds fresh rather
  // than appending. Runs immediately for an idle request, or on settle for a queued one.
  onFire?: () => void;
}

// Fire an explore_request without ever bailing because a turn is in flight.
//
// The old pattern across the widgets was `if (busy) return` — clicking a tool
// action mid-turn did nothing and (for "Get more") greyed the button out. Instead
// this hook QUEUES the action and fires it when the current turn settles.
//
// Policy is coalesce / latest-wins: rapid clicks (or clicks across several widgets'
// own queues) don't stack duplicate rebuilds — only the most recent pending request
// for a given hook instance fires on settle. Idle clicks fire straight away.
//
// ChatPanel still guards its explore_request → sendMessage bridge with !isLoading,
// so we must not emit while busy (the event would be dropped). We hold the payload
// in a ref and emit it ourselves on the next done/idle/error.
export function useQueuedExplore(): {
  enqueue: (req: QueuedExplore) => void;
  // True while a request is waiting for the current turn to settle. Lets a caller
  // show a pending affordance (e.g. spin the reload icon).
  queued: boolean;
} {
  const bus = useAgentEvents();
  const busy = useAgentBusy();
  // The single pending request (latest-wins). null when nothing is queued.
  const pendingRef = useRef<QueuedExplore | null>(null);
  const [queued, setQueued] = useState(false);
  // Mirror `busy` into a ref so enqueue reads the live value without being recreated.
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Emit a request now: run its side effect, then put it on the bus for ChatPanel.
  const fire = useRef((req: QueuedExplore) => {
    req.onFire?.();
    bus.emit({
      type: "explore_request",
      prompt: req.prompt,
      displayText: req.displayText,
    });
  });

  // When a turn settles, flush whatever's queued (latest-wins).
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
      setQueued(false);
      fire.current(pending);
    });
  }, [bus]);

  function enqueue(req: QueuedExplore) {
    if (busyRef.current) {
      // A turn is in flight — coalesce; the settle handler will fire the latest.
      pendingRef.current = req;
      setQueued(true);
      return;
    }
    fire.current(req);
  }

  return { enqueue, queued };
}
