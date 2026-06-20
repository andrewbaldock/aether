import type { SseEvent } from "@contract/sse";
import type { CompositionPlan } from "@contract/plan";
import type { SSEStreamingApi } from "hono/streaming";

// A typed emitter for the /api/chat SSE stream. Centralizes the framing
// (`data: <JSON>\n`) so the 12 chat-route event writes can't drift: each method is
// checked against the shared `SseEvent` union (@contract/sse), so a typo in a `type`
// string or a wrong field shape is a compile error, not a silent client break.
// `done()` writes the raw `[DONE]` sentinel (not a JSON SseEvent — the reader checks
// for it before JSON.parse, so it's intentionally not part of the union).
export function createSseEmitter(stream: SSEStreamingApi) {
  const send = (event: SseEvent) => stream.writeSSE({ data: JSON.stringify(event) });
  return {
    text: (content: string) => send({ type: "text", content }),
    status: (message: string) => send({ type: "status", message }),
    toolStart: (tool: string, input: unknown, label?: string) =>
      send({ type: "tool_start", tool, input, label }),
    toolResult: (tool: string, result: string) =>
      send({ type: "tool_result", tool, result }),
    toolPartial: (tool: string, partialJson: string, isComplete: boolean) =>
      send({ type: "tool_partial", tool, partialJson, isComplete }),
    loopStart: (iteration: number) => send({ type: "loop_start", iteration }),
    plan: (plan: CompositionPlan) => send({ type: "plan", plan }),
    clarify: (question: string, options: string[]) =>
      send({ type: "clarify", question, options }),
    persisted: (userId: string, assistantId: string) =>
      send({ type: "persisted", userId, assistantId }),
    titled: (sessionId: string, title: string, icon: string | null) =>
      send({ type: "titled", sessionId, title, icon }),
    warning: (message: string) => send({ type: "warning", message }),
    error: (message: string) => send({ type: "error", message }),
    done: () => stream.writeSSE({ data: "[DONE]" }),
  };
}
