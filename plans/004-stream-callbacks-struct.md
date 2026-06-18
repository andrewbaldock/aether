# Plan 004: Replace `stream()`'s 9 positional callbacks with a struct

> **Executor instructions**: Follow step by step; run every verify command. On any STOP condition,
> stop and report. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 476d17e..HEAD -- backend/src/llm.ts backend/src/index.ts`
> If either changed since 476d17e, compare the excerpts below to the live code first.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (pairs naturally after 002)
- **Category**: tech-debt
- **Planned at**: commit `476d17e`, 2026-06-18

## Why this matters

`LlmClient.stream(...)` takes the conversation plus **nine positional callbacks and a trailing
boolean flag**. The order is load-bearing and undocumented at the call site, the route spreads the
ten arguments over ~150 lines (`index.ts:513–663`), and adding one callback means editing the
interface plus *both* client implementations plus the call site — easy to land an argument in the
wrong slot. Passing a single `callbacks` object makes every handler named, optional ones truly
optional, and a new one a non-breaking addition.

## Current state

`backend/src/llm.ts:62–106` — the interface:
```ts
export interface LlmClient {
  complete(messages: ChatMessage[]): Promise<string>;
  stream(
    messages: ChatMessage[],
    onToken: (token: string) => Promise<void>,
    onDone: () => Promise<void>,
    onToolStart?: (name: string, input: unknown) => Promise<void>,
    onToolResult?: (name: string, result: string) => Promise<void>,
    onToolPartial?: (name: string, partialJson: string, isComplete: boolean) => Promise<void>,
    onLoopStart?: (iteration: number) => Promise<void>,
    onStatus?: (message: string) => Promise<void>,
    onPlan?: (plan: CompositionPlan) => Promise<void>,
    onClarify?: (clarify: ClarifyResult) => Promise<void>,
    clarified?: boolean,
  ): Promise<void>;
}
```
Implemented twice — `createClaudeClient` (the `stream` method starting ~`:484`) and
`createOpenAICompatClient` (~`:847`) — each destructures these positional params. Called once, at
`index.ts:513`, with the 10 args spread across `:513–663`.

### Conventions to follow

- The rich per-callback comments at `llm.ts:70–104` are valuable — move them onto the struct fields
  verbatim. Don't lose them.
- Match the existing `interface` style in `llm.ts`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Backend verify | `cd backend && bun run verify` | exit 0 |
| Lint | `cd backend && bunx biome check .` | exit 0 |

## Scope

**In scope**:
- `backend/src/llm.ts` — the `LlmClient.stream` signature + both client implementations.
- `backend/src/index.ts` — the single `llm.stream(...)` call (`:513`).

**Out of scope**:
- `complete()` — unchanged.
- The loop bodies themselves (that's plan 006). Only the parameter shape changes here.
- Any callback's *behavior*.

## Git workflow

- Branch: `advisor/004-stream-callbacks`. Do NOT push or commit.

## Steps

### Step 1: Define the callbacks struct

In `llm.ts`, above `LlmClient`, add (moving the existing comments onto fields):
```ts
export interface StreamCallbacks {
  onToken: (token: string) => Promise<void>;
  onDone: () => Promise<void>;
  onToolStart?: (name: string, input: unknown) => Promise<void>;
  onToolResult?: (name: string, result: string) => Promise<void>;
  onToolPartial?: (name: string, partialJson: string, isComplete: boolean) => Promise<void>;
  onLoopStart?: (iteration: number) => Promise<void>;
  onStatus?: (message: string) => Promise<void>;
  onPlan?: (plan: CompositionPlan) => Promise<void>;
  onClarify?: (clarify: ClarifyResult) => Promise<void>;
}
```
Change the interface to:
```ts
stream(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  opts?: { clarified?: boolean },
): Promise<void>;
```

### Step 2: Update both client implementations

In `createClaudeClient` and `createOpenAICompatClient`, change each `stream` method to accept
`(messages, callbacks, opts)` and destructure `const { onToken, onDone, onToolStart, ... } =
callbacks;` at the top, with `const clarified = opts?.clarified ?? false;`. The rest of each body is
unchanged — only the parameter list and the one-line destructure.

**Verify**: `cd backend && bun run typecheck` → exit 0.

### Step 3: Update the call site

In `index.ts:513`, change `await llm.stream(messages, async (token) => {...}, async () => {...}, …, clarified === true)` to:
```ts
await llm.stream(
  messages,
  {
    onToken: async (token) => { /* existing body */ },
    onDone: async () => { /* existing body */ },
    onToolStart: async (tool, input) => { /* existing body */ },
    onToolResult: async (tool, result) => { /* existing body */ },
    onToolPartial: async (tool, partialJson, isComplete) => { /* existing body */ },
    onLoopStart: async (iteration) => { /* existing body */ },
    onStatus: async (message) => { /* existing body */ },
    onPlan: async (plan) => { /* existing body */ },
    onClarify: async (clarify) => { /* existing body */ },
  },
  { clarified: clarified === true },
);
```
Preserve every callback body exactly (including comments).

**Verify**: `cd backend && bun run verify` → exit 0.

## Test plan

- If plan 005 (`llm.test.ts`) has landed, update its calls to the new signature and confirm green.
- Otherwise the existing suites are the net. No new test required for this mechanical change, but
  ensure `cd backend && bun test` passes.

## Done criteria

- [ ] `cd backend && bun run verify` exits 0
- [ ] `cd backend && bunx biome check .` exits 0
- [ ] `grep -n "onToolPartial?:" backend/src/llm.ts` shows it only inside `StreamCallbacks` (not as a positional param)
- [ ] The `llm.stream(` call in `index.ts` passes exactly two/three args (messages, callbacks, opts)
- [ ] `git status` shows only `llm.ts` + `index.ts` (+ `llm.test.ts` if 005 landed)
- [ ] `plans/README.md` row updated

## STOP conditions

- A callback body in `index.ts` references the *positional* nature of the old call (it shouldn't) —
  STOP and report.
- If 005 landed and its tests can't be mechanically updated to the struct form, STOP.
- Any verify fails twice after a reasonable fix.

## Maintenance notes

- New stream callbacks are now optional struct fields — additive, no breaking change to callers.
- This makes plan 006 (loop unification) easier: the shared loop can accept `StreamCallbacks`
  directly instead of threading nine params.
