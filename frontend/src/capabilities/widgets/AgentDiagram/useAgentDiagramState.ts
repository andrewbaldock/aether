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

export function useAgentDiagramState(): DiagramState {
  const bus = useAgentEvents();
  const [state, setState] = useState<DiagramState>(INITIAL);

  // Timers we must clear on unmount / new turn so a finished turn's fade doesn't
  // bleed into the next one.
  const fadeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tokenLast = useRef(0);
  const tokenTrailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True once we've logged "streaming tokens…" for the current burst, so dozens
  // of token events produce one console line, not dozens.
  const loggedStreaming = useRef(false);

  useEffect(() => {
    function clearTimers() {
      for (const t of fadeTimers.current) clearTimeout(t);
      fadeTimers.current = [];
      if (tokenTrailing.current) {
        clearTimeout(tokenTrailing.current);
        tokenTrailing.current = null;
      }
    }

    // Pulse the streaming/append nodes once. Used both for the throttled leading
    // edge and the trailing edge.
    function pulseTokens() {
      setState((s) => ({
        ...s,
        nodeStatuses: set(s.nodeStatuses, {
          claude_api: "active",
          stream_tokens: "active",
          token_append: "active",
        }),
      }));
    }

    function handle(event: AgentEvent) {
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
              nodeStatuses: set(s.nodeStatuses, {
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
                nodeStatuses: set(s.nodeStatuses, {
                  claude_api: "complete",
                  stream_tokens: "complete",
                  token_append: "complete",
                  stop_reason: "active",
                  tool_exec: "active",
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
                nodeStatuses: set(s.nodeStatuses, {
                  stop_reason: "complete",
                  tool_exec: "complete",
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
                nodeStatuses: set(s.nodeStatuses, {
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
          clearTimers();
          loggedStreaming.current = false;
          // Everything that ran briefly shows complete, then done flashes, then
          // the whole diagram fades back to idle top-to-bottom.
          setState((s) => {
            const completed = { ...s.nodeStatuses };
            for (const id of FADE_ORDER) {
              if (completed[id] === "active" || completed[id] === "looping") {
                completed[id] = "complete";
              }
            }
            return logLine(
              {
                ...s,
                phase: "done",
                activeToolName: null,
                nodeStatuses: set(completed, {
                  stop_reason: "complete",
                  done: "active",
                }),
              },
              "stop_reason = end_turn → onDone() → [DONE]"
            );
          });

          // Staggered fade.
          FADE_ORDER.forEach((id, i) => {
            const t = setTimeout(
              () => {
                setState((s) => ({
                  ...s,
                  nodeStatuses: set(s.nodeStatuses, { [id]: "idle" }),
                }));
              },
              1200 + i * 80
            );
            fadeTimers.current.push(t);
          });
          // Reset nodes + counters once the fade completes, but keep the log on
          // screen — it's only cleared on the next send (request_start).
          const reset = setTimeout(
            () =>
              setState((s) => ({
                ...INITIAL,
                log: s.log,
              })),
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

    const unsubscribe = bus.subscribe(handle);
    return () => {
      unsubscribe();
      clearTimers();
    };
  }, [bus]);

  return state;
}
