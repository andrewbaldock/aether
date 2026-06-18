# Plan 001: A single source of truth for the frontend↔backend contract

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 476d17e..HEAD -- backend/src/llm.ts frontend/src/shell/useChat.ts backend/src/db.ts frontend/src/hooks/useSessionList.ts backend/src/tools.ts frontend/src/capabilities/widgets`
> If any of these changed since 476d17e, compare the "Current state" excerpts below against the
> live code before proceeding; on a real mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `476d17e`, 2026-06-18

## Why this matters

The contract between the two halves of Aether — the SSE event shapes, the render-tool spec types,
the tool-name strings, and the `Session`/`Message` row shapes — is declared **independently on each
side**. Each package typechecks alone, so a divergence compiles clean and only surfaces at runtime
(a dropped widget field, a silently-ignored SSE event, a delete hitting the wrong row). It has
**already drifted**: `frontend/src/hooks/useSessionList.ts` and `backend/src/db.ts` both define a
`Session` interface, and they no longer match (see excerpts). This plan creates one shared module
both sides import, so the contract becomes a compile-time gate instead of a hope.

This is additive and mechanical: the types already exist in duplicate; we lift the canonical copy
into `shared/contract/` and re-point both sides. No runtime behavior changes.

## Current state

The contract is duplicated across these surfaces:

- **SSE event union** — declared *only* on the frontend, locally, inside the read loop:
  - `frontend/src/shell/useChat.ts:356` —
    ```ts
    type SseEvent = {
      type: string;            // "text" | "tool_start" | "tool_result" | "tool_partial" |
                               // "status" | "loop_start" | "plan" | "clarify" | "persisted" | "warning" | "error"
      content?: string; message?: string; tool?: string; input?: unknown;
      result?: string; partialJson?: string; isComplete?: boolean;
      iteration?: number; label?: string; plan?: CompositionPlan;
      question?: string; options?: string[];
      userId?: string; assistantId?: string;
    };
    ```
  - The backend emits these as bare object literals — `backend/src/index.ts:517–672`, 12 sites like
    `stream.writeSSE({ data: JSON.stringify({ type: "text", content: token }) })`. There is **no
    backend type** for an SSE event; the `type` strings are loose.

- **Render-tool spec types** — declared on the frontend per widget, with a comment admitting the mirror:
  - `frontend/src/capabilities/widgets/Chart/types.ts:1` — *"Mirrors the backend tool's input_schema
    in tools.ts."* Defines `ChartSpec`, `ChartType`, `ChartSeries`.
  - Sibling files: `Table/types.ts`, `Timeline/types.ts`, `Images/types.ts`, `KnowledgeGraph/types.ts`.
  - The backend's authoritative shape is the JSON Schema in `backend/src/tools.ts` (the `render_*`
    tool `input_schema` blocks). There is no TypeScript type on the backend for these specs — the
    tools echo `JSON.stringify(input)` with `input: unknown`.

- **`Session` shape — declared on BOTH sides and already divergent**:
  - `frontend/src/hooks/useSessionList.ts:6` — has `topic_icon`, `graph_mode`, `model`, and a
    **nested `ui_state`** object (`activeWidget`, `tilesLayout`, `tilesLayoutVersion`, `hiddenCards`).
  - `backend/src/db.ts:114` — has `topic_icon`, `graph_mode`, `model`, **plus** `graph_data`,
    `widget_data`, `image_data`, and `ui_state: UiState | null` (a separately-defined type).
  - `backend/src/db.ts:133` — `DbMessage { id, session_id, role, content, created_at }`.

### Conventions to follow

- **Two independent packages, no root workspace** (by design — `package.json` root comment says so).
  So the shared module is consumed via a **relative tsconfig path**, NOT a published package. Each
  package keeps its own `tsconfig.json`/`biome.json`.
- Types live in `.ts` files with rich top-of-file comments explaining intent — match the style of
  `frontend/src/capabilities/widgets/Chart/types.ts` (a one-paragraph header, per-field comments).
- **Backward compatibility is a hard rule** (`CLAUDE.md`): the shared types must be a *superset*
  that both current shapes satisfy. Where the two `Session` defs differ, the shared type carries the
  **union of fields, all optional where one side omits them** — never drop a field either side uses.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Backend typecheck | `cd backend && bun run typecheck` | exit 0 |
| Backend tests | `cd backend && bun test` | all pass |
| Frontend build (real gate) | `cd frontend && bun run build` | exit 0 |
| Frontend typecheck | `cd frontend && bun run typecheck` | exit 0 |
| Lint (each pkg) | `bunx biome check .` | exit 0 |

## Scope

**In scope** (create / modify):
- `shared/contract/sse.ts` (create) — the SSE event union + a `SSE_EVENT_TYPES` const.
- `shared/contract/widgets.ts` (create) — `ChartSpec`, `TableSpec`, `TimelineSpec`, `ImagesSpec`,
  `GraphSpec` (lift the canonical copies from the frontend `types.ts` files).
- `shared/contract/tools.ts` (create) — `TOOL_NAMES` const + `ToolName` type + `STREAMABLE_RENDER_TOOLS`
  set built from it.
- `shared/contract/db.ts` (create) — the unified `Session` + `Message` shapes.
- `shared/contract/index.ts` (create) — barrel re-export.
- `shared/tsconfig.json` (create) — a minimal config for the shared module.
- `backend/tsconfig.json`, `frontend/tsconfig.app.json` — add a path mapping for `@contract/*`.
- Re-point the duplicate declarations on each side to import from `@contract/*` (re-export to keep
  existing import paths working — additive, no caller churn).

**Out of scope** (do NOT touch):
- The runtime logic in `useChat.ts`, `index.ts`, `tools.ts`, `llm.ts` — only the *type declarations*
  move. No behavior change.
- Adding a bun/npm workspace — explicitly rejected; use tsconfig paths only.
- The DB migration files in `backend/sql/` — the row shapes don't change.

## Git workflow

- Branch: `advisor/001-shared-contract`
- Do NOT push or open a PR. Leave the tree clean for the maintainer to commit.

## Steps

### Step 1: Create the shared module skeleton

Create `shared/contract/` with the five files. Populate each by **copying the canonical existing
declaration** and adding a header comment that this is the single source of truth:

- `sse.ts`: define a discriminated union `SseEvent` from the field list in `useChat.ts:356`. Make it
  a real union keyed on `type` (one variant per event type) so a missing field is a compile error.
  Also export `const SSE_EVENT_TYPES = ["text","tool_start","tool_result","tool_partial","status","loop_start","plan","clarify","persisted","warning","error"] as const`.
- `widgets.ts`: copy `ChartSpec` et al. verbatim from the frontend `types.ts` files.
- `tools.ts`: `export const TOOL_NAMES = { GET_CURRENT_DATETIME: "get_current_datetime", SEARCH_IMAGES: "search_images", ... RENDER_TABLE: "render_table", ... } as const` covering every name in
  `backend/src/tools.ts`'s `executeTool` switch (`:806–835`). Derive `STREAMABLE_RENDER_TOOLS`.
- `db.ts`: the unioned `Session` (all fields from both `useSessionList.ts:6` and `db.ts:114`, optional
  where one side omits) + `Message`.
- `index.ts`: `export * from "./sse"; export * from "./widgets"; export * from "./tools"; export * from "./db";`

Create `shared/tsconfig.json` extending strict options (mirror `backend/tsconfig.json`'s compiler
options; no `lib: dom` needed).

**Verify**: `cd shared && bunx tsc --noEmit -p tsconfig.json` → exit 0.

### Step 2: Wire the path mapping into both packages

In `backend/tsconfig.json` and `frontend/tsconfig.app.json`, add under `compilerOptions`:
```jsonc
"baseUrl": ".",
"paths": { "@contract/*": ["../shared/contract/*"] }
```
(If `baseUrl`/`paths` already exist, merge — do not clobber.) Vite needs the alias too: in
`frontend/vite.config.ts`, add to `resolve.alias` an entry mapping `@contract` → the absolute
`shared/contract` path (use `fileURLToPath(new URL("../shared/contract", import.meta.url))` style,
matching any existing alias convention in that file).

**Verify**: `cd frontend && bun run typecheck` → exit 0 (no "cannot find module @contract").

### Step 3: Re-point the frontend declarations (re-export, don't delete imports)

- In each frontend widget `types.ts`, replace the local spec definition with
  `export type { ChartSpec, ChartType, ChartSeries } from "@contract/widgets";` (etc.). Existing
  importers keep working — they still import from `./types`.
- In `frontend/src/hooks/useSessionList.ts`, replace the local `Session` interface (`:6–35`) with
  `export type { Session } from "@contract/db";`.
- In `frontend/src/shell/useChat.ts`, replace the local `type SseEvent` (`:356–375`) with
  `import type { SseEvent } from "@contract/sse";`.

**Verify**: `cd frontend && bun run build` → exit 0 (this also runs the unit suite first).

### Step 4: Re-point the backend declarations

- In `backend/src/db.ts`, replace the local `Session` / `DbMessage` interfaces with
  `export type { Session, Message as DbMessage } from "@contract/db";` (keep the `DbMessage` alias so
  existing backend code is untouched).
- In `backend/src/tools.ts`, import `TOOL_NAMES`/`STREAMABLE_RENDER_TOOLS` from `@contract/tools` and
  re-export the local `STREAMABLE_RENDER_TOOLS` from it (so plan 003 / callers stay valid). Do NOT
  rewrite the switch in this plan — just make the names available.

**Verify**: `cd backend && bun run verify` → exit 0.

### Step 5: Update the architecture doc

Add a short subsection to `docs/ARCHITECTURE.md` (near "Frontend ↔ backend wiring") titled "The
shared contract (`shared/contract/`)" stating that SSE events, render-tool specs, tool names, and
the Session/Message shapes now have one definition both packages import via the `@contract/*` path,
and that drift is now a compile error.

**Verify**: `grep -n "shared/contract" docs/ARCHITECTURE.md` → at least one match.

## Test plan

- No new runtime tests required (types-only change). The existing suites are the regression net:
  `cd backend && bun test` and `cd frontend && bun run test:run` must both stay green.
- Add one compile-time assertion in `shared/contract/db.ts`: a commented block or a
  `// @ts-expect-error` smoke that proves the unified `Session` is assignable from both old shapes is
  optional and may be skipped.

## Done criteria

ALL must hold:

- [ ] `cd backend && bun run verify` exits 0
- [ ] `cd frontend && bun run build` exits 0
- [ ] `bunx biome check .` exits 0 in both `frontend/` and `backend/`
- [ ] `grep -rn "type SseEvent = {" frontend/src` returns no matches (it now imports from `@contract`)
- [ ] `shared/contract/index.ts` exists and re-exports sse/widgets/tools/db
- [ ] `docs/ARCHITECTURE.md` mentions `shared/contract`
- [ ] `git status` shows no files modified outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- The frontend and backend `Session` shapes differ in a way that can't be unioned without changing
  runtime behavior (e.g. a field with the *same name but incompatible type*) — report the conflict.
- Adding the `@contract/*` path breaks Vite's dev server or the Playwright build (`bun run build`
  fails with a resolution error you can't fix by mirroring an existing alias in `vite.config.ts`).
- The SSE union can't be made discriminated without changing how `useChat.ts` reads events.
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

- From now on, **every new SSE event type, render-tool spec, or Session column lands in
  `shared/contract/` first**, then both sides consume it. A reviewer should reject a PR that
  re-declares any of these shapes locally.
- This plan is the keystone for plans 002 (typed SSE emitter) and 003 (tool registry) — they import
  from `@contract`. If 001 is deferred, those plans define the types locally and must be reconciled later.
- Watch: the backend currently has *no* type for render-tool specs (it echoes `unknown`). A natural
  follow-up (deferred here) is to validate tool input against the `@contract` widget types in
  `executeTool` before echoing — but that risks rejecting near-valid model output, so it's its own task.
