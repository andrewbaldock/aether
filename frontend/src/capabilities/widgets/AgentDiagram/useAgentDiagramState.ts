import { useEffect, useRef, useState } from "react";
import {
  type AgentEvent,
  useAgentEvents,
} from "../../../shell/AgentEventContext";
import type { NodeStatus } from "./DiagramSvg";
import type { NodeId } from "./nodes";

// One line in the running step console. `seq` is a stable render key (log lines
// are append-only within a turn).
export interface LogEntry {
  seq: number;
  t: string; // hh:mm:ss.mmm timestamp
  text: string;
}

// The diagram's full visual state, derived purely from the AgentEventBus. Each
// node carries a status that the SVG turns into a colour + animation.
export interface DiagramState {
  nodeStatuses: Record<NodeId, NodeStatus>;
  loopCount: number;
  activeToolName: string | null;
  phase: "idle" | "running" | "tool_use" | "done";
  log: LogEntry[];
}

const ALL_IDLE: Record<NodeId, NodeStatus> = {
  user: "idle",
  http_post: "idle",
  build_history: "idle",
  claude_api: "idle",
  stream_tokens: "idle",
  token_append: "idle",
  stop_reason: "idle",
  tool_exec: "idle",
  external_data: "idle",
  feed_results: "idle",
  done: "idle",
};

// Top-to-bottom order for the staggered fade-to-idle at the end of a turn.
const FADE_ORDER: NodeId[] = [
  "user",
  "http_post",
  "build_history",
  "claude_api",
  "stream_tokens",
  "token_append",
  "stop_reason",
  "tool_exec",
  "external_data",
  "feed_results",
  "done",
];

const INITIAL: DiagramState = {
  nodeStatuses: { ...ALL_IDLE },
  loopCount: 0,
  activeToolName: null,
  phase: "idle",
  log: [],
};

// Monotonic key for log lines — survives state resets so React never reuses a
// key across cleared logs.
let logSeq = 0;

function stamp(): string {
  return (
    new Date().toLocaleTimeString("en-GB", { hour12: false }) +
    `.${String(Date.now() % 1000).padStart(3, "0")}`
  );
}

// Append a line to the running console.
function logLine(s: DiagramState, text: string): DiagramState {
  return {
    ...s,
    log: [...s.log, { seq: logSeq++, t: stamp(), text }],
  };
}

function set(
  statuses: Record<NodeId, NodeStatus>,
  patch: Partial<Record<NodeId, NodeStatus>>
): Record<NodeId, NodeStatus> {
  return { ...statuses, ...patch };
}

// Token events fire dozens of times a second; we don't want to thrash the
// "token_append" pulse on every one. Throttle to ~4fps while always honouring a
// trailing pulse so the last token still registers.
const TOKEN_THROTTLE_MS = 250;

// Minimum time a node stays visibly lit (active/looping) before it's allowed to
// drop to complete/idle. Real agent events can fire well under a second apart
// (text → tool_start → tool_result), which would flash a node's role colour by
// too fast to see — this guarantees each lit node holds for at least 2s.
const MIN_LIT_MS = 2000;

// A node is "lit" (showing its role colour) while active or looping.
function isLit(status: NodeStatus): boolean {
  return status === "active" || status === "looping";
}

export function useAgentDiagramState(): DiagramState {
  const bus = useAgentEvents();
  const [state, setState] = useState<DiagramState>(INITIAL);

  // Timers we must clear on unmount / new turn so a finished turn's fade doesn't
  // bleed into the next one.
  const fadeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tokenLast = useRef(0);
  const tokenTrailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-node timestamp (epoch ms) until which the node is hold-locked lit. A
  // patch that would dim a node before this expires is deferred (see
  // applyStatuses); cleared on every turn boundary via clearTimers.
  const litUntil = useRef<Partial<Record<NodeId, number>>>({});
  // Pending deferred-demotion timers, keyed by node, so a later patch can cancel
  // a node's stale pending demotion before scheduling a new one.
  const holdTimers = useRef<
    Partial<Record<NodeId, ReturnType<typeof setTimeout>>>
  >({});
  // True once we've logged "streaming tokens…" for the current burst, so dozens
  // of token events produce one console line, not dozens.
  const loggedStreaming = useRef(false);

  useEffect(() => {
    // Cancel scheduled fade/token timers. By default also clears the per-node
    // min-lit holds — a hard reset for turn boundaries (request_start, idle,
    // error, unmount). Pass { preserveHolds: true } at the natural end of a turn
    // (done) so nodes lit moments before still get their full 2s before the
    // staggered fade dims them.
    function clearTimers(opts?: { preserveHolds: boolean }) {
      for (const t of fadeTimers.current) clearTimeout(t);
      fadeTimers.current = [];
      if (tokenTrailing.current) {
        clearTimeout(tokenTrailing.current);
        tokenTrailing.current = null;
      }
      if (!opts?.preserveHolds) {
        for (const t of Object.values(holdTimers.current)) {
          if (t) clearTimeout(t);
        }
        holdTimers.current = {};
        litUntil.current = {};
      }
    }

    // Apply a status patch on top of `prev`, enforcing the 2s min-lit hold.
    // - Nodes being promoted to active/looping apply immediately and (re)stamp
    //   their litUntil window.
    // - Nodes being dimmed (→ complete/idle) while still inside their hold
    //   window are skipped now and re-applied by a deferred timer once the hold
    //   expires, so a fast event can't snuff a colour before it's been seen.
    // Always funnel writes through here instead of raw `set()` so the hold is
    // centralised. The deferred timers register in holdTimers (cancellable per
    // node) and are cleared at every turn boundary by clearTimers.
    function applyStatuses(
      prev: Record<NodeId, NodeStatus>,
      patch: Partial<Record<NodeId, NodeStatus>>
    ): Record<NodeId, NodeStatus> {
      const now = Date.now();
      const immediate: Partial<Record<NodeId, NodeStatus>> = {};
      for (const key of Object.keys(patch) as NodeId[]) {
        const next = patch[key];
        if (next === undefined) continue;
        const wasLit = isLit(prev[key]);
        if (isLit(next)) {
          // Promotion (or re-pulse): apply now, refresh the hold window. Any
          // pending demotion for this node is now stale.
          immediate[key] = next;
          litUntil.current[key] = now + MIN_LIT_MS;
          const pending = holdTimers.current[key];
          if (pending) {
            clearTimeout(pending);
            delete holdTimers.current[key];
          }
        } else if (wasLit && (litUntil.current[key] ?? 0) > now) {
          // Demotion inside the hold window: defer to when the hold expires.
          const remaining = (litUntil.current[key] ?? now) - now;
          const pending = holdTimers.current[key];
          if (pending) clearTimeout(pending);
          holdTimers.current[key] = setTimeout(() => {
            delete holdTimers.current[key];
            delete litUntil.current[key];
            setState((s) => ({
              ...s,
              nodeStatuses: { ...s.nodeStatuses, [key]: next },
            }));
          }, remaining);
        } else {
          // Demotion past the hold (or a non-lit→non-lit change): apply now.
          immediate[key] = next;
          delete litUntil.current[key];
        }
      }
      return { ...prev, ...immediate };
    }

    // Pulse the streaming/append nodes once. Used both for the throttled leading
    // edge and the trailing edge.
    function pulseTokens() {
      setState((s) => ({
        ...s,
        nodeStatuses: applyStatuses(s.nodeStatuses, {
          claude_api: "active",
          stream_tokens: "active",
          token_append: "active",
        }),
      }));
    }

    // Land the diagram in the right coarse phase for a subscriber that mounted
    // mid-turn, WITHOUT replaying the turn: the bus hands a new listener the
    // most-recent phase event flagged replay=true. We light the relevant spine
    // and set phase/activeToolName, but skip console writes and the request_start
    // console-clear (a catch-up must never wipe an in-progress turn's state) —
    // the next LIVE event picks up logging normally. `idle`/`done` replays just
    // settle to a resting state; from there live events take over.
    function handleReplay(event: AgentEvent) {
      switch (event.type) {
        case "request_start":
        case "text": {
          // A turn is underway and Claude is (or was just) streaming — light the
          // request → Claude spine so the diagram reads "running", not dead.
          setState((s) => ({
            ...s,
            phase: "running",
            activeToolName: null,
            nodeStatuses: set(
              { ...ALL_IDLE },
              {
                user: "complete",
                http_post: "complete",
                build_history: "complete",
                claude_api: "active",
                stream_tokens: "active",
                token_append: "active",
              }
            ),
          }));
          break;
        }
        case "tool_start": {
          setState((s) => ({
            ...s,
            phase: "tool_use",
            activeToolName: event.tool,
            nodeStatuses: set(
              { ...ALL_IDLE },
              {
                user: "complete",
                http_post: "complete",
                build_history: "complete",
                stop_reason: "active",
                tool_exec: "active",
                external_data: "active",
              }
            ),
          }));
          break;
        }
        case "loop_start": {
          setState((s) => ({
            ...s,
            phase: "running",
            loopCount: Math.max(s.loopCount, event.iteration),
            nodeStatuses: set(
              { ...ALL_IDLE },
              {
                build_history: "looping",
                claude_api: "active",
              }
            ),
          }));
          break;
        }
        // done / idle: nothing in flight — leave the diagram at rest (INITIAL).
      }
    }

    function handle(event: AgentEvent, replay: boolean) {
      if (replay) {
        handleReplay(event);
        return;
      }
      switch (event.type) {
        case "request_start": {
          clearTimers();
          loggedStreaming.current = false;
          // A fresh turn: clear the console, then log the opening step.
          setState(
            logLine(
              {
                nodeStatuses: set(
                  { ...ALL_IDLE },
                  {
                    user: "active",
                    http_post: "active",
                  }
                ),
                loopCount: 1,
                activeToolName: null,
                phase: "running",
                log: [],
              },
              "POST /api/chat — sending conversation history"
            )
          );
          break;
        }

        case "text": {
          // First text of the turn lights the whole request → Claude spine.
          const now = Date.now();
          const firstOfBurst = !loggedStreaming.current;
          loggedStreaming.current = true;
          setState((s) => {
            const next: DiagramState = {
              ...s,
              phase: "running",
              activeToolName: null,
              nodeStatuses: applyStatuses(s.nodeStatuses, {
                user: "complete",
                http_post: "complete",
                build_history: "complete",
                // Coming back from a tool loop, stop_reason/tool nodes settle.
                stop_reason:
                  s.nodeStatuses.stop_reason === "active"
                    ? "complete"
                    : s.nodeStatuses.stop_reason,
                claude_api: "active",
                stream_tokens: "active",
                token_append: "active",
              }),
            };
            // One line per streaming burst, not per token.
            return firstOfBurst
              ? logLine(next, "Claude streaming tokens → SSE → frontend")
              : next;
          });
          // Throttle the repeat pulses, but guarantee a trailing one.
          if (now - tokenLast.current >= TOKEN_THROTTLE_MS) {
            tokenLast.current = now;
            pulseTokens();
          }
          if (tokenTrailing.current) clearTimeout(tokenTrailing.current);
          tokenTrailing.current = setTimeout(pulseTokens, TOKEN_THROTTLE_MS);
          break;
        }

        case "tool_start": {
          const tool = event.tool;
          setState((s) =>
            logLine(
              {
                ...s,
                phase: "tool_use",
                activeToolName: tool,
                nodeStatuses: applyStatuses(s.nodeStatuses, {
                  claude_api: "complete",
                  stream_tokens: "complete",
                  token_append: "complete",
                  stop_reason: "active",
                  tool_exec: "active",
                  // ponytail: external_data tracks tool_exec, not per-tool —
                  // refine if the UI ever distinguishes local vs external tools.
                  external_data: "active",
                }),
              },
              `stop_reason = tool_use → executeTool(${tool})`
            )
          );
          break;
        }

        case "tool_result": {
          const tool = event.tool;
          setState((s) =>
            logLine(
              {
                ...s,
                nodeStatuses: applyStatuses(s.nodeStatuses, {
                  stop_reason: "complete",
                  tool_exec: "complete",
                  external_data: "complete",
                  feed_results: "active",
                }),
              },
              `${tool} returned → push result to history`
            )
          );
          break;
        }

        case "loop_start": {
          // Loop re-entry: results were fed back, history rebuilt, model recalled.
          loggedStreaming.current = false; // next burst logs again
          setState((s) =>
            logLine(
              {
                ...s,
                phase: "running",
                loopCount: Math.max(s.loopCount, event.iteration),
                nodeStatuses: applyStatuses(s.nodeStatuses, {
                  feed_results: "complete",
                  build_history: "looping",
                  claude_api: "active",
                }),
              },
              `loop iteration ${event.iteration} — calling Claude again`
            )
          );
          break;
        }

        case "done": {
          // Preserve in-flight holds so a node lit just before done still gets
          // its full 2s; the fade below routes through applyStatuses and so
          // defers around those holds.
          clearTimers({ preserveHolds: true });
          loggedStreaming.current = false;
          // Everything that ran briefly shows complete, then done flashes, then
          // the whole diagram fades back to idle top-to-bottom.
          setState((s) => {
            const completed = applyStatuses(s.nodeStatuses, {
              ...Object.fromEntries(
                FADE_ORDER.filter(
                  (id) =>
                    s.nodeStatuses[id] === "active" ||
                    s.nodeStatuses[id] === "looping"
                ).map((id) => [id, "complete" as NodeStatus])
              ),
              stop_reason: "complete",
              done: "active",
            });
            return logLine(
              {
                ...s,
                phase: "done",
                activeToolName: null,
                nodeStatuses: completed,
              },
              "stop_reason = end_turn → onDone() → [DONE]"
            );
          });

          // Staggered fade — routed through applyStatuses so a still-held node
          // (e.g. done, lit last) waits out its 2s before going idle.
          FADE_ORDER.forEach((id, i) => {
            const t = setTimeout(
              () => {
                setState((s) => ({
                  ...s,
                  nodeStatuses: applyStatuses(s.nodeStatuses, { [id]: "idle" }),
                }));
              },
              1200 + i * 80
            );
            fadeTimers.current.push(t);
          });
          // Reset nodes + counters once the fade completes, but keep the log on
          // screen — it's only cleared on the next send (request_start). By this
          // point (2200ms) every 2s hold has expired; clear the hold refs too so
          // nothing leaks into the next turn.
          const reset = setTimeout(
            () => {
              litUntil.current = {};
              holdTimers.current = {};
              setState((s) => ({
                ...INITIAL,
                log: s.log,
              }));
            },
            1200 + FADE_ORDER.length * 80 + 200
          );
          fadeTimers.current.push(reset);
          break;
        }

        case "error": {
          clearTimers();
          loggedStreaming.current = false;
          setState((s) =>
            logLine({ ...INITIAL, log: s.log }, `error — ${event.message}`)
          );
          break;
        }

        case "idle": {
          clearTimers();
          setState(INITIAL);
          break;
        }
      }
    }

    // Opt into replay: if this hook mounts mid-turn (e.g. Welcome opened while a
    // turn is in flight), the bus immediately replays the current phase so the
    // diagram lands lit instead of sitting idle until the next live event.
    const unsubscribe = bus.subscribe(handle, { replay: true });
    return () => {
      unsubscribe();
      clearTimers();
    };
  }, [bus]);

  return state;
}
