# Plan 006: Unify the duplicated agent loop behind a wire adapter

> **Executor instructions**: Follow step by step; run every verify command. On any STOP condition,
> stop and report. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 476d17e..HEAD -- backend/src/llm.ts`
> If `llm.ts` changed since 476d17e, compare the excerpts below to the live code first.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (refactors the hottest code path)
- **Depends on**: **005** (the characterization tests that make this safe). Do NOT start until 005 is DONE.
- **Category**: tech-debt
- **Planned at**: commit `476d17e`, 2026-06-18

## Why this matters

The agent loop exists **twice** in `llm.ts` — once in `createClaudeClient` (~`:484`) and once in
`createOpenAICompatClient` (~`:847`). The loop state machine (iteration tracking, tool accumulation,
text separation, the max_tokens salvage at `:635`/`:959`, the iteration-cap "final call with no
tools" degrade, tool execution + feed-back) is ~300 near-identical lines; only the **wire format**
differs (Anthropic streaming events vs OpenAI chunks). The duplication is already drifting — the
OpenAI side carries Gemini-specific branches the Claude side doesn't. A bug fix to the loop must be
made twice. This plan extracts the loop into one provider-agnostic function driven by a thin
per-provider **adapter** that translates wire events; both clients call the same loop.

Note: the file header at `llm.ts:122–125` already declares a "Shared agent-loop helpers" section
("the two clients run the SAME agent loop with different wire formats… so it lives in ONE place").
Some helpers are already shared. **Extend that existing seam** — don't start a parallel one.

## Current state

- `MAX_ITERATIONS` — `:120` (default 6, env `LLM_MAX_ITERATIONS`).
- Shared-helpers section begins `:122`; `buildPlannerInput` etc. already live there.
- `createClaudeClient` `:315`; its `stream` loop `while (true)` at `:484`; salvage `:635`; uses
  `executeTool` (from `./tools`) and `closeTruncatedJson`/`parseBestEffort` (from `./bestEffortJson`).
- `createOpenAICompatClient` `:757`; loop `:847`; salvage `:959`; Gemini handling `:988` + thought_signature.
- `createClient(opts)` factory `:1082` routes by provider.

If plan 004 landed, both `stream` methods already take `(messages, callbacks: StreamCallbacks, opts)`.
If not, they take the 9 positional callbacks — either way the loop body is what's duplicated.

### Design decisions (locked in a 2026-06-18 design grilling — do NOT re-litigate)

The seam was walked decision-by-decision against the live loop. These are settled:

1. **Seam shape = normalized event stream (the deepest loop, thinnest adapter).** The adapter yields
   a small `LoopEvent` union; the shared loop consumes ONLY those — it never sees an Anthropic or
   OpenAI SDK type. **All** of: text-streaming to `onToken`, the inter-iteration text separator
   (`:565–576`), the **120ms `onToolPartial` throttle** (`:589`), the **max_tokens salvage +
   `isDegenerate` guard** (`:631–658`), per-turn token accounting/logging, the iteration cap +
   final-no-tools degrade, `executeTool` + tool-result feedback + ordering, and history-message
   building → **live in the shared loop**, written once. Rationale: these are the bug-prone,
   already-drifting pieces; sharing them is the entire reliability/perf win (identical frame pacing,
   one tested salvage path). The rejected alternative ("adapter owns a whole call") was a shallower
   win that would leave streaming + throttle duplicated.
2. **`LoopEvent` is a superset union.** It includes a Claude-only `server_tool_start` /
   `server_tool_result` pair (for `web_search`, `:545–555`). The OpenAI adapter simply never emits
   them. The shared loop forwards these to `onToolStart`/`onToolResult` but **skips `executeTool`** —
   the event *type* encodes "server-handled," so **no `provider === …` check ever enters the shared
   loop**. Client-side tools use the ordinary `tool_start`/`tool_delta`/`tool_stop` variants and DO
   run `executeTool`.
3. **The shared loop owns the `streamable` knowledge.** It checks `STREAMABLE_RENDER_TOOLS` (from
   `./tools`, or `@contract/tools` if plan 001 landed) by tool name when accumulating partials and
   when salvaging. It's the same set for every provider, so the adapter only reports tool name + JSON
   deltas — it never tags streamable.

Suggested `LoopEvent` shape (refine names against the code, keep the variants):
```ts
type LoopEvent =
  | { kind: "text"; text: string }
  | { kind: "tool_start"; id: string; name: string }      // client-side → loop runs executeTool
  | { kind: "tool_delta"; id: string; json: string }
  | { kind: "tool_stop"; id: string }
  | { kind: "server_tool_start"; name: string }            // Claude web_search → loop forwards only
  | { kind: "server_tool_result"; name: string; content: string }
  | { kind: "usage"; inputTokens: number; outputTokens: number; cacheRead: number; cacheCreation: number }
  | { kind: "stop"; reason: "end" | "tool_use" | "max_tokens" | "malformed_tool" };
interface WireAdapter {
  stream(history: ApiMessage[], opts: { withTools: boolean }): AsyncIterable<LoopEvent>;
  buildAssistantMessage(textBlocks: string[], toolCalls: { id: string; name: string; input: unknown }[]): ApiMessage;
  buildToolResultMessage(results: { id: string; name: string; result: string }[]): ApiMessage;
}
```
The Anthropic event taxonomy (`message_start`/`content_block_*`/`message_delta`), the
`cache_read`/`cache_creation` usage split, and the `ContentBlockParam` history shape all live INSIDE
the Claude adapter. The OpenAI chunk taxonomy + Gemini quirks (`MALFORMED_FUNCTION_CALL` → emit
`{kind:"stop",reason:"malformed_tool"}`; the finish_reason-vs-tool-call bug) live inside the OpenAI
adapter.

### Conventions to follow

- Keep the lazy SDK construction (`getClient()` at `:328`) and the cache_control tool marking
  (`:356`) **inside each client** — those are genuinely provider-specific. Only the *loop* moves out.
- Preserve every comment explaining a subtle decision (salvage rationale, the final-iteration
  no-tools degrade, the Gemini finish_reason bug note at `:993`). Move them into the shared loop or
  the adapter as appropriate.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Loop tests (from 005) | `cd backend && bun test src/llm.test.ts` | all pass, UNCHANGED |
| Full verify | `cd backend && bun run verify` | exit 0 |
| Lint | `cd backend && bunx biome check .` | exit 0 |

## Scope

**In scope**:
- `backend/src/llm.ts` — extract a shared `runAgentLoop` + a `WireAdapter` interface; both clients
  build an adapter and call the shared loop.

**Out of scope**:
- `backend/src/llm.test.ts` — it must pass **unchanged**. If you find yourself editing it to make the
  refactor pass, STOP — that means behavior changed.
- `executeTool`, `bestEffortJson`, `tools.ts`, `index.ts` — untouched.
- Adding a new provider — out of scope; this only de-duplicates the existing two.

## Git workflow

- Branch: `advisor/006-unify-agent-loop`. Do NOT push or commit.

## Steps

### Step 1: Confirm 005 is in place and green

`cd backend && bun test src/llm.test.ts` → all pass. **If 005 is not DONE, STOP** — this refactor is
not safe without it.

### Step 2: Define the wire adapter seam

In the shared-helpers section (`:122`+), define the `LoopEvent` union and `WireAdapter` interface
**exactly as fixed in "Design decisions" above** — the normalized-event-stream seam with the
superset union (including `server_tool_start`/`server_tool_result`) and `usage` events. The adapter
is where each SDK's events get normalized: Anthropic `message_start`/`content_block_*`/`message_delta`
in the Claude adapter; OpenAI `choices[].delta`/`finish_reason` (plus the Gemini `:993` finish_reason
quirk and `MALFORMED_FUNCTION_CALL` `:988` → `{kind:"stop",reason:"malformed_tool"}`) in the OpenAI
adapter. The shared loop must contain **no** `provider === …` branch.

### Step 3: Extract the shared loop

Move the duplicated `while (true)` body into `async function runAgentLoop(adapter: WireAdapter,
initialMessages, callbacks, opts)`. It owns: iteration counter + `MAX_ITERATIONS` cap, the
final-iteration no-tools degrade, accumulating streamed text → `onToken`, accumulating
`tool_input_delta` → `onToolPartial`, on `stop: tool_use` running `executeTool` + `onToolResult` +
`onLoopStart`, the `stop: max_tokens` salvage via `closeTruncatedJson`/`parseBestEffort` →
final `onToolPartial(isComplete:true)` + soft `onDone`, and the hard-error path when nothing salvages.

### Step 4: Reduce each client to (lazy SDK + adapter + call runAgentLoop)

`createClaudeClient.stream` becomes: build the Anthropic adapter (closing over `getClient()` and
`cachedTools`), then `return runAgentLoop(claudeAdapter, messages, callbacks, opts)`. Same for
`createOpenAICompatClient` with the OpenAI adapter. The lazy-client and cache-marking code stays in
the client; only the loop is shared.

**Verify after each client**: `cd backend && bun test src/llm.test.ts` → the 005 tests for that
client pass **unchanged**. This is the safety gate — run it after Claude, then after OpenAI.

### Step 5: Confirm the whole suite + the duplication is gone

**Verify**: `cd backend && bun run verify` → exit 0. Then confirm the loop body is no longer
duplicated: there should be **one** `while (true)` agent loop, not two —
`grep -c "while (true)" backend/src/llm.ts` should drop (was 2; expect 1, or 0 if you used a
`for`/recursion). Document the new count in your status note.

### Step 6: Update the architecture doc

In `docs/ARCHITECTURE.md`'s "The LLM connector" section, note that the two providers now share one
`runAgentLoop` driven by a per-provider `WireAdapter` (previously two parallel loops).

## Test plan

- **No new tests** — 005 is the spec. The win condition is: 005's tests pass **byte-identically**
  before and after this refactor. If any 005 assertion needs changing, behavior drifted → STOP.
- Optionally add ONE new test: a second OpenAI-compat provider scripted to hit the Gemini
  `MALFORMED_FUNCTION_CALL` path, proving the adapter preserved that branch.

## Done criteria

- [ ] `cd backend && bun test src/llm.test.ts` passes with the 005 tests **unmodified**
- [ ] `cd backend && bun run verify` exits 0
- [ ] `cd backend && bunx biome check .` exits 0
- [ ] Exactly one shared agent loop remains (the duplicated `while (true)` body is gone)
- [ ] Gemini `MALFORMED_FUNCTION_CALL` + finish_reason-vs-tool-call handling still present (in the adapter)
- [ ] `docs/ARCHITECTURE.md` updated
- [ ] `git status` shows only `llm.ts` (+ optional one test + the doc) changed
- [ ] `plans/README.md` row updated

## STOP conditions

- 005 is not DONE/green → STOP immediately; do not refactor.
- A 005 test fails after the extraction and the fix would require editing the test → STOP; behavior
  changed, which this plan forbids.
- The Gemini-specific handling (`:988`, `:993`) can't be expressed in the adapter without leaking
  provider details into the shared loop → STOP and report; better to leave a documented provider
  hook than to smear Gemini logic across the shared path.
- Token-cache markers (cache_control) would have to move out of the client to make the loop shared →
  STOP; those are provider-specific and must stay in the client.
- Any verify fails twice after a reasonable fix.

## Maintenance notes

- Adding a 5th provider is now: a new `WireAdapter` + a `models.ts` entry — the loop is reused.
- A reviewer should scrutinize that the adapter, not the shared loop, holds every provider quirk, and
  that the salvage + iteration-cap behavior is identical to pre-refactor (005 proves it).
- This is the backend's highest-leverage **deepening** — it converts two shallow parallel functions
  into one deep loop with a thin seam. (It's also the headline candidate for the separate
  `/improve-codebase-architecture` HTML report.)
