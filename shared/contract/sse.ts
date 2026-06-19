// The SSE event contract for POST /api/chat — the single source of truth (plan 001).
//
// The backend writes these as `data: <JSON>\n` (backend/src/index.ts chat route); the
// frontend reads them in frontend/src/shell/useChat.ts. The shape used to be declared
// ONLY frontend-side (a loose local `type SseEvent`) while the backend emitted bare
// object literals with hand-typed `type` strings — so a typo in one `type` string, or a
// new field on one side, drifted silently with no compile error. Now both sides import
// this union. A new event type or field lands HERE first.
//
// Note: `[DONE]` is a raw sentinel string (`data: [DONE]`), NOT a JSON SseEvent — the
// reader checks for it before JSON.parse, so it's intentionally not a variant here.

import type { CompositionPlan } from "./plan";

// Every `type` string the chat route can emit (excludes the `[DONE]` sentinel).
export const SSE_EVENT_TYPES = [
  "text",
  "status",
  "tool_start",
  "tool_result",
  "tool_partial",
  "loop_start",
  "plan",
  "clarify",
  "persisted",
  "warning",
  "error",
] as const;

export type SseEventType = (typeof SSE_EVENT_TYPES)[number];

// A discriminated union — one variant per event type, so a missing/renamed field is a
// compile error on whichever side falls behind.
export type SseEvent =
  // One assistant prose chunk (streamed token).
  | { type: "text"; content: string }
  // Display-only activity blurb for the indicator (cosmetic, superseded by real output).
  | { type: "status"; message: string }
  // A tool invocation began. `label` is a human-readable, input-aware caption
  // ("Searching the web for …"); the frontend falls back to `Using {tool}…`.
  | { type: "tool_start"; tool: string; input?: unknown; label?: string }
  // A tool's authoritative final result (the JSON the frontend parses to a widget spec).
  | { type: "tool_result"; tool: string; result: string }
  // A streamed render-tool spec chunk (progressive paint). `partialJson` is the spec
  // accumulated so far; `isComplete` true on the final emit for the block.
  | {
      type: "tool_partial";
      tool: string;
      partialJson: string;
      isComplete: boolean;
    }
  // The agent loop re-entered (iteration 2+) after feeding tool results back.
  | { type: "loop_start"; iteration: number }
  // The planner's abstract composition plan for this turn (complex turns only).
  | { type: "plan"; plan: CompositionPlan }
  // Thin-but-explodable turn: the planner asked ONE clarifying question instead of
  // composing. The question also streamed as `text`; `options` are tappable chips.
  | { type: "clarify"; question: string; options: string[] }
  // The turn was saved; carries the real DB row ids so the client swaps its placeholder
  // ids (enables a same-session delete to target the right rows without a reload).
  | { type: "persisted"; userId: string; assistantId: string }
  // A non-fatal notice (e.g. persistence failed mid-stream).
  | { type: "warning"; message: string }
  // A mid-stream fatal error for this turn.
  | { type: "error"; message: string };
