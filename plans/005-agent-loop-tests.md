# Plan 005: Characterization tests for the agent loop

> **Executor instructions**: Follow step by step; run every verify command. On any STOP condition,
> stop and report. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 476d17e..HEAD -- backend/src/llm.ts`
> If `llm.ts` changed since 476d17e, compare the excerpts below to the live code first.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (test infra — the risk is a mock that doesn't match reality, masking real behavior)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `476d17e`, 2026-06-18

## Why this matters

The agent loop in `llm.ts` is the hottest, most critical code in the backend — it streams tokens,
runs the tool-use loop, salvages truncated output, and caps iterations. It has **zero unit tests**.
Today a regression only surfaces when the Fly smoke test runs post-deploy, or in production. Plan
006 wants to refactor this loop (it's duplicated across two clients); refactoring untested code is
the biggest risk in this whole plan set. This plan adds **characterization tests** — they pin the
*current* behavior so 006 can prove it didn't change anything. They are a prerequisite for 006.

## Current state

`backend/src/llm.ts`:
- `createClaudeClient(tools, systemPrompt, selectedModel?, sessionId?)` — `:315`. Builds an
  `Anthropic` SDK client lazily inside `getClient()` (`:328`), reading `ANTHROPIC_API_KEY` at first
  use. Its `stream(...)` method runs a `while (true)` loop at `:484` with iteration cap
  `MAX_ITERATIONS` (`:120`, default 6), a max_tokens salvage path at `:635` (uses `closeTruncatedJson`
  / `parseBestEffort` from `./bestEffortJson`), and tool execution via `executeTool` from `./tools`.
- `createOpenAICompatClient(provider, tools, systemPrompt, model, sessionId?)` — `:757`. Same loop
  shape at `:847`, salvage at `:959`, plus Gemini-specific handling (`MALFORMED_FUNCTION_CALL` at
  `:988`, `thought_signature` extraction).
- `createClient(opts)` — `:1082` — the factory that routes to one of the two by `providerForModel`.
- `generateTitle(firstMessage)` — `:1120` — a separate one-shot Haiku micro-agent (best-effort).

The loop calls the Anthropic SDK's `messages.stream(...)` (Claude) and the OpenAI SDK's
`chat.completions.create({ stream: true })` (OpenAI-compat). Tests must **mock these SDKs** so no
network/tokens are used. The existing backend tests run on `bun:test` and live in
`backend/src/*.test.ts` (e.g. `bestEffortJson.test.ts`, `planner.test.ts`).

### Conventions to follow

- Backend tests use `bun:test` — `import { test, expect, mock } from "bun:test";`. Model the new file
  after `backend/src/planner.test.ts` (it mocks an LLM call) and `bestEffortJson.test.ts`.
- Bun's module mocking: `mock.module("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }))` and the
  analogous for `"openai"`. Confirm the exact mock API from the existing test files / Bun docs.
- Keep the tests deterministic — no timers, no real fetch.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Run new tests | `cd backend && bun test src/llm.test.ts` | all pass |
| Full backend verify | `cd backend && bun run verify` | exit 0 |
| Lint | `cd backend && bunx biome check .` | exit 0 |

## Scope

**In scope**:
- `backend/src/llm.test.ts` (create).
- Possibly a small `backend/src/llm.testFixtures.ts` (create) for fake SDK stream builders, if it
  keeps the test readable.

**Out of scope**:
- ANY change to `llm.ts` production code. This plan is test-only. If a test reveals the code is hard
  to mock because a dependency is constructed un-injectably, note it as a STOP/finding — do NOT
  refactor production code here (that's 006).
- `executeTool` internals — let the real `executeTool` run for render tools (it just echoes JSON);
  for data tools, either let them run (they hit the network — avoid) or stub `./tools` so
  `executeTool` returns a canned string. Prefer stubbing `executeTool` to keep tests offline.

## Git workflow

- Branch: `advisor/005-agent-loop-tests`. Do NOT push or commit.

## Steps

### Step 1: Stand up the SDK mocks

In `llm.test.ts`, mock `@anthropic-ai/sdk` so `new Anthropic(...).messages.stream(...)` returns a
controllable async iterable of events, and `messages.create(...)` (used by `generateTitle`) returns
a canned response. Build a small helper that yields a scripted sequence of Anthropic streaming
events (text deltas, a `content_block_start` for a tool_use, `input_json_delta`s, a
`message_delta` with a `stop_reason`). Set `process.env.ANTHROPIC_API_KEY = "test-key"` in the
test setup so `getClient()` doesn't throw.

**Verify**: a trivial first test that constructs `createClaudeClient([], "sys")` and calls
`complete([...])` against the mock returns the canned text. `bun test src/llm.test.ts` → passes.

### Step 2: Characterize a text-only turn (both clients)

Script the mock to stream a few text deltas then stop with `stop_reason: "end_turn"` (Claude) /
`finish_reason: "stop"` (OpenAI). Assert: `onToken` fired for each delta in order, `onDone` fired
once, no `onToolStart`/`onToolResult`, loop exited after one iteration.

### Step 3: Characterize a single tool turn

Script: iteration 1 emits a `render_table` tool_use whose input JSON streams across deltas, then
`stop_reason: "tool_use"`; iteration 2 streams text and stops. Assert: `onToolStart("render_table",
…)`, `onToolPartial` fired with growing JSON then `isComplete: true`, `onToolResult("render_table",
<echoed JSON>)`, `onLoopStart(2)` fired once, `onDone` once. Stub `executeTool` to echo so it stays
offline.

### Step 4: Characterize the iteration cap

Set `process.env.LLM_MAX_ITERATIONS = "2"`. Script the mock to *always* return a tool_use
(`stop_reason: "tool_use"`). Assert the loop stops at the cap and the final iteration re-calls with
no tools (the documented "degrade, not throw" behavior at `llm.ts:117`), ending with `onDone`, not a
thrown error.

### Step 5: Characterize max_tokens salvage

Script a turn where a `render_table` tool_use input streams partial JSON then the stream ends with
`stop_reason: "max_tokens"` (Claude) / `finish_reason: "length"` (OpenAI). Assert: a final
`onToolPartial(..., isComplete: true)` with salvaged JSON fires (the `closeTruncatedJson` path), and
the turn ends with `onDone` (soft status), not a thrown hard error — matching `llm.ts:635`/`:959`.

### Step 6: Repeat the key cases for the OpenAI-compat client

Run steps 2, 3, and 5 against `createOpenAICompatClient("google", …)` with the OpenAI SDK mock
(`chat.completions.create({ stream: true })` returning scripted chunks). This is what makes 006 safe
— both code paths are pinned.

**Verify**: `cd backend && bun run verify` → exit 0; new tests counted and passing.

## Test plan

- New file `backend/src/llm.test.ts` covering, for BOTH clients: text-only turn, single-tool turn,
  iteration cap, max_tokens salvage. ~8–10 test cases total.
- Pattern source: `backend/src/planner.test.ts` (LLM mocking) + `bestEffortJson.test.ts` (assertion style).
- Verification: `cd backend && bun test src/llm.test.ts` → all pass.

## Done criteria

- [ ] `cd backend && bun run verify` exits 0 with the new tests included
- [ ] `backend/src/llm.test.ts` exists and tests both `createClaudeClient` and `createOpenAICompatClient`
- [ ] Tests run fully offline (no real `fetch`, no real API key needed beyond the stub)
- [ ] `cd backend && bunx biome check .` exits 0
- [ ] No production file under `backend/src/` other than the test/fixture files changed (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- A behavior can't be characterized because production code constructs the SDK in a way that can't be
  mocked with `bun:test` — STOP and report exactly which dependency is un-injectable (this is signal
  for 006, but do NOT change production code here).
- The salvage behavior you observe contradicts `docs/ARCHITECTURE.md` ("max_tokens salvage") — STOP
  and report the discrepancy rather than encoding a bug as expected behavior.
- A test needs a real network call to pass — STOP; the test is wrong, fix the mock.

## Maintenance notes

- These are **characterization** tests: they assert current behavior, not necessarily ideal behavior.
  When 006 unifies the loop, these tests must stay green unchanged — that's their entire purpose.
- If a future change deliberately alters loop behavior, update these tests in the same PR and call it
  out in review.
