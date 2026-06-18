# Plan 010: A factory for the duplicated widget state providers

> **Executor instructions**: Follow step by step; run every verify command. On any STOP condition,
> stop and report. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 476d17e..HEAD -- frontend/src/capabilities/widgets`
> If the widgets changed since 476d17e, compare the excerpts below to the live code first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (must preserve each widget's type-specific state shape through a generic)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `476d17e`, 2026-06-18

## Why this matters

Four widgets — Table, Chart, Timeline, Images — each re-implement the **same** state provider: a React
context, a `useStreamingEntries`-backed entry list, and the same set of operations (`loadEntries`,
`clearEntries`, `requestReplace`, `requestReplaceEntry`, `duplicateEntry`, `updateEntry`) wrapped in
the same `useCallback`/`useMemo` boilerplate. The shared `useStreamingEntries` hook already covers the
streaming math, but ~80 lines of provider scaffolding are copy-pasted per widget and slowly diverge (a
fix to one `duplicateEntry` won't reach the others). A factory that produces the provider + hook from
a `{ toolName, parse, getTitle }` triple removes the duplication while keeping each widget's typed
state.

## Current state

`frontend/src/capabilities/widgets/Table/useTableState.tsx` — the template (the others mirror it):
- `:14–17` `TableEntry { id: number; spec: TableSpec }`
- `:26–41` `TableState` interface (entries + the six operations)
- `:43` `const TableContext = createContext<TableState | null>(null)`
- `:47–77` `parseTableSpec(raw)` — widget-specific validator
- `:79–158` `TableProvider` — calls `useStreamingEntries<TableSpec>("render_table", parseTableSpec,
  (spec) => spec.title)` then defines `loadEntries`/`clearEntries`/`duplicateEntry`/`updateEntry`
  (all `useCallback`) and assembles the `value` with `useMemo`.
- `:160–166` `useTableState()` — the `useContext` guard.

The Chart/Timeline/Images modules (`Chart/useChartState.tsx`, `Timeline/useTimelineState.tsx`,
`Images/useImagesState.tsx`) repeat this structure with their own `Spec`, tool name, and `parse`/
`getTitle`. `requestReplace`/`requestReplaceEntry`/`nextId`/`setEntries` come from
`useStreamingEntries` (`frontend/src/capabilities/widgets/useStreamingEntries.ts`); only
`loadEntries`/`clearEntries`/`duplicateEntry`/`updateEntry` are defined per provider — identically.

### Conventions to follow

- Frontend tests: vitest + jsdom. There is an existing `useStreamingEntries.test.tsx` (337 lines) —
  the factory must keep it green and is the model for the new factory test.
- Keep the per-widget `parseXSpec` exported (plan 009's `parsers.ts` and existing tests import them).
- Generic-context typing: React context is invariant; the factory must return a correctly-typed
  `Provider` + `useState` hook per `Spec`. Use a generic function, not a single shared context.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Frontend build | `cd frontend && bun run build` | exit 0 |
| Unit tests | `cd frontend && bunx vitest run` | all pass |
| Lint | `cd frontend && bunx biome check .` | exit 0 |

## Scope

**In scope**:
- `frontend/src/capabilities/widgets/createWidgetStateProvider.tsx` (create) — the generic factory.
- `Table/useTableState.tsx`, `Chart/useChartState.tsx`, `Timeline/useTimelineState.tsx`,
  `Images/useImagesState.tsx` — re-implement on top of the factory, keeping each module's public
  exports (`useTableState`, `TableProvider`, `parseTableSpec`, `TableEntry`, `TableState`) intact.

**Out of scope**:
- `useStreamingEntries.ts` — unchanged; the factory consumes it.
- KnowledgeGraph — its state is a per-cell additive merge, NOT an entry list; it does NOT fit this
  factory. Do not touch it.
- The widget render components (`TableWidget.tsx`, etc.) and the per-widget `parseXSpec` validators —
  unchanged (validators stay in their modules and exported).
- Any change to what's persisted or rendered.

## Git workflow

- Branch: `advisor/010-widget-state-factory`. Do NOT push or commit.

## Steps

### Step 1: Build the factory

Create `createWidgetStateProvider.tsx` exposing:
```tsx
export interface WidgetEntry<Spec> { id: number; spec: Spec; }
export interface WidgetState<Spec> {
  entries: WidgetEntry<Spec>[];
  loadEntries: (entries: WidgetEntry<Spec>[]) => void;
  clearEntries: () => void;
  requestReplace: () => void;
  requestReplaceEntry: (id: number) => void;
  duplicateEntry: (id: number) => void;
  updateEntry: (id: number, spec: Spec) => void;
}
export function createWidgetStateProvider<Spec>(config: {
  toolName: string;
  parse: (raw: string) => Spec | null;
  getTitle: (spec: Spec) => string | undefined;
  copyTitle: (title: string | undefined) => string | undefined; // reuse ../duplicateTitle
}): { Provider: React.FC<{ children: ReactNode }>; useState: () => WidgetState<Spec>; } {
  // owns: createContext, useStreamingEntries(toolName, parse, getTitle),
  // the four useCallbacks (load/clear/duplicate/update), the useMemo value,
  // and the context-guard hook. EXACTLY the body currently in TableProvider.
}
```
Lift the `duplicateEntry`/`updateEntry`/`loadEntries`/`clearEntries` bodies verbatim from
`useTableState.tsx:89–132` (they're already spec-agnostic — they only touch `id` and `spec`).

**Verify**: `cd frontend && bun run typecheck` → exit 0 (the generic must compile).

### Step 2: Re-implement Table on the factory

Rewrite `Table/useTableState.tsx` to: keep `parseTableSpec` (its validator) and the `TableSpec`-typed
public aliases, then:
```ts
const { Provider, useState } = createWidgetStateProvider<TableSpec>({
  toolName: "render_table", parse: parseTableSpec, getTitle: (s) => s.title, copyTitle,
});
export const TableProvider = Provider;
export const useTableState = useState;
export type TableState = WidgetState<TableSpec>;
export type TableEntry = WidgetEntry<TableSpec>;
```
Keep every existing export name so no caller changes.

**Verify**: `cd frontend && bun run build` → exit 0; `bunx vitest run` (the Table + streaming-entries
tests) passes.

### Step 3: Re-implement Chart, Timeline, Images the same way

One at a time, building + testing after each. Each keeps its own `parseXSpec` and `getTitle`
(Chart/Timeline may title differently — confirm each module's current `getTitle` argument and
preserve it).

**Verify after each**: `cd frontend && bun run build` → exit 0.

### Step 4: Confirm the duplication is gone

`grep -rn "createContext<.*State | null>" frontend/src/capabilities/widgets` should now only match the
factory (not four per-widget files). Each widget module should be a thin config + re-export.

**Verify**: `cd frontend && bun run build && bunx vitest run && bun run test:e2e` all green.

## Test plan

- Add `createWidgetStateProvider.test.tsx` (vitest + jsdom): instantiate the factory with a trivial
  `Spec`, render the Provider, exercise `loadEntries`/`duplicateEntry`/`updateEntry`/`clearEntries`,
  assert the entry list transitions. Model after `useStreamingEntries.test.tsx`.
- All existing per-widget tests (`parseChartSpec.test.ts`, `useStreamingEntries.test.tsx`, etc.) must
  stay green unchanged — they're the regression net proving the rewrite preserved behavior.

## Done criteria

- [ ] `cd frontend && bun run build` exits 0
- [ ] `cd frontend && bunx vitest run` passes (existing tests unmodified + new factory test)
- [ ] `cd frontend && bun run test:e2e` passes
- [ ] `cd frontend && bunx biome check .` exits 0
- [ ] Only the factory defines the widget context (no per-widget `createContext<…State | null>`)
- [ ] Public exports of each widget state module are unchanged (callers untouched)
- [ ] `git status` shows only the factory + 4 widget state modules (+ test) changed
- [ ] `plans/README.md` row updated

## STOP conditions

- The generic context can't preserve a widget's exact `State` type (a caller gets `unknown`/`any`
  where it had `TableSpec`) → STOP; type safety must not regress.
- A widget's `getTitle` or `duplicateEntry` turns out NOT to be spec-agnostic (it inspects a
  widget-specific field) → STOP and report; the factory's contract assumes they only touch `id`/`spec`/title.
- KnowledgeGraph appears to fit and you're tempted to fold it in → it does NOT (additive merge, not an
  entry list) — leave it out.
- Any verify fails twice after a reasonable fix.

## Maintenance notes

- New entry-list widgets (a future `render_map` card list, etc.) get a provider for free via the
  factory. A reviewer should reject a new widget hand-rolling the context+provider boilerplate.
- KnowledgeGraph remains intentionally separate; if a second merge-style widget appears, that's a
  *different* factory, not this one.
