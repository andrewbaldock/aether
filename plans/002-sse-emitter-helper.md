# Plan 002: A typed SSE emitter for the chat route

> **Executor instructions**: Follow step by step; run every verify command. On any STOP condition,
> stop and report. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 476d17e..HEAD -- backend/src/index.ts`
> If `index.ts` changed since 476d17e, compare the excerpts below to the live code first.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (for the `SseEvent` union — see note if 001 not yet landed)
- **Category**: tech-debt
- **Planned at**: commit `476d17e`, 2026-06-18

## Why this matters

The `POST /api/chat` handler emits Server-Sent Events by hand at **12 sites**, each a literal
`await stream.writeSSE({ data: JSON.stringify({ type: "…", …fields }) })`. The event schema lives
nowhere — it's implicit in those 12 literals — so a typo in one `type` string or a missing field
silently breaks the frontend with no compile error. A small typed emitter centralizes the framing
and makes each event a checked method call. Pure refactor; the wire output is byte-for-byte identical.

## Current state

`backend/src/index.ts:509–674` — the `streamSSE(c, async (stream) => { ... })` body passes 10
callbacks to `llm.stream(...)`, and each callback writes an SSE event by hand. The 12 emission sites:

- `:517` text token — `{ type: "text", content: token }`
- `:531` fallback text — `{ type: "text", content: fallback }`
- `:558` persisted — `{ type: "persisted", userId, assistantId }`
- `:563` warning — `{ type: "warning", message: "…" }`
- `:577` terminal — `stream.writeSSE({ data: "[DONE]" })` (a raw string, not JSON — keep as-is)
- `:604` tool_start — `{ type: "tool_start", tool, input, label: toolStatusLabel(tool, input) }`
- `:614` tool_result — `{ type: "tool_result", tool, result }`
- `:622` tool_partial — `{ type: "tool_partial", tool, partialJson, isComplete }`
- `:632` loop_start — `{ type: "loop_start", iteration }`
- `:637` status — `{ type: "status", message }`
- `:645` plan — `{ type: "plan", plan }`
- `:654` clarify — `{ type: "clarify", question, options }`
- `:670` error — `{ type: "error", message }`

Representative excerpt (`index.ts:517`):
```ts
await stream.writeSSE({
  data: JSON.stringify({ type: "text", content: token }),
});
```

### Conventions to follow

- The route uses Hono's `streamSSE` (`import { streamSSE } from "hono/streaming"`). The emitter wraps
  the `stream` object it hands you. Match the existing async style (every emit is `await`ed).
- Backend file/comment style: rich intent comments. Keep the existing comments at each site — move
  them next to the new emitter call.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Backend verify | `cd backend && bun run verify` | exit 0 |
| Lint | `cd backend && bunx biome check .` | exit 0 |

## Scope

**In scope**:
- `backend/src/sse.ts` (create) — `createSseEmitter(stream)` returning typed methods.
- `backend/src/index.ts` — replace the 12 hand-rolled writes with emitter calls.

**Out of scope**:
- The `[DONE]` sentinel at `:577` — it's a raw non-JSON string; leave it as `stream.writeSSE({ data: "[DONE]" })` (or add an `emitter.done()` that writes exactly that — your choice, but don't change the wire bytes).
- The callback wiring / order passed to `llm.stream(...)` — that's plan 004. Touch only the *bodies*.
- The frontend reader.

## Git workflow

- Branch: `advisor/002-sse-emitter`. Do NOT push or commit.

## Steps

### Step 1: Create the emitter

Create `backend/src/sse.ts`:
```ts
import type { SSEStreamingApi } from "hono/streaming"; // confirm the exact type name Hono exports
import type { SseEvent } from "@contract/sse"; // if 001 landed; else define a local union here

export function createSseEmitter(stream: SSEStreamingApi) {
  const send = (event: SseEvent) =>
    stream.writeSSE({ data: JSON.stringify(event) });
  return {
    text:        (content: string) => send({ type: "text", content }),
    toolStart:   (tool: string, input: unknown, label?: string) => send({ type: "tool_start", tool, input, label }),
    toolResult:  (tool: string, result: string) => send({ type: "tool_result", tool, result }),
    toolPartial: (tool: string, partialJson: string, isComplete: boolean) => send({ type: "tool_partial", tool, partialJson, isComplete }),
    loopStart:   (iteration: number) => send({ type: "loop_start", iteration }),
    status:      (message: string) => send({ type: "status", message }),
    plan:        (plan: CompositionPlan) => send({ type: "plan", plan }),
    clarify:     (question: string, options: string[]) => send({ type: "clarify", question, options }),
    persisted:   (userId: string, assistantId: string) => send({ type: "persisted", userId, assistantId }),
    warning:     (message: string) => send({ type: "warning", message }),
    error:       (message: string) => send({ type: "error", message }),
    done:        () => stream.writeSSE({ data: "[DONE]" }),
  };
}
```
Import `CompositionPlan` from wherever the backend already defines it (grep
`backend/src` for `CompositionPlan`). If 001 has NOT landed, define the `SseEvent` union locally in
this file (you'll move it to `@contract` when 001 runs).

**Verify**: `cd backend && bun run typecheck` → exit 0.

### Step 2: Replace the 12 sites

In `index.ts`, construct `const sse = createSseEmitter(stream);` at the top of the `streamSSE`
callback, then replace each hand-rolled write with the matching method, preserving the surrounding
comments and logic. Example: `:517` becomes `await sse.text(token);`.

**Verify**: `cd backend && bun run verify` → exit 0. Then confirm no literal `JSON.stringify({ type:`
remains in the chat handler: `grep -n 'JSON.stringify({ type:' backend/src/index.ts` → no matches
inside the `/api/chat` handler (other routes may still build JSON responses — those are fine).

### Step 3: Sanity-check the wire format is unchanged

The emitted bytes must match exactly. Spot-check by reading the diff: every `send(...)` produces
`data: <json>\n` with the same `type` and field names as before.

**Verify**: `cd frontend && bun run test:e2e -- --grep "render-tool"` if a backend isn't required by
that spec (it mocks `/api`), OR rely on the existing backend tests. At minimum run
`cd backend && bun test`.

## Test plan

- This is byte-preserving; the existing tests guard it. No new test required, but if `backend/src`
  has no test that exercises an emit path, add a tiny unit test in `backend/src/sse.test.ts` that
  asserts `createSseEmitter` produces the expected `data: {"type":"text","content":"hi"}` string for
  a fake stream (capture `writeSSE` args with a stub). Model it after the style in
  `backend/src/bestEffortJson.test.ts`.

## Done criteria

- [ ] `cd backend && bun run verify` exits 0
- [ ] `cd backend && bunx biome check .` exits 0
- [ ] No `JSON.stringify({ type:` literal remains inside the `/api/chat` handler
- [ ] `backend/src/sse.ts` exists and is the only place the chat route frames SSE events
- [ ] `git status` shows only in-scope files changed
- [ ] `plans/README.md` row updated

## STOP conditions

- Hono's stream type isn't named `SSEStreamingApi` and you can't determine the right type from
  `node_modules/hono` — report it (use `Parameters<typeof streamSSE>` inference rather than guessing).
- Any event field name or `type` string would have to change to fit the emitter — STOP; the emitter
  must match the existing wire exactly.
- Verify fails twice after a reasonable fix.

## Maintenance notes

- New SSE events get a new emitter method here (and a new variant in `@contract/sse`). A reviewer
  should reject re-introducing a raw `stream.writeSSE({ data: JSON.stringify(...) })` in the route.
- If 001 lands after this plan, swap the local `SseEvent` union for the `@contract/sse` import and
  delete the local copy.
