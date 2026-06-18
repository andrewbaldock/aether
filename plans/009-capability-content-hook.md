# Plan 009: Decouple the shell from widget internals

> **Executor instructions**: Follow step by step; run every verify command. On any STOP condition,
> stop and report. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 476d17e..HEAD -- frontend/src/shell/ChatPanel.tsx frontend/src/shell/EditWidgetDialog.tsx frontend/src/capabilities`
> If any changed since 476d17e, compare the excerpts below to the live code first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (relocation behind a cleaner boundary; logic unchanged)
- **Depends on**: none (do before or after 008; before is cleaner)
- **Category**: tech-debt
- **Planned at**: commit `476d17e`, 2026-06-18

## Why this matters

The shell knows too much about widgets. `ChatPanel.tsx` imports all five per-widget state hooks and
reads their internals (`.entries.length`, graph node counts) directly to compute the unseen-glow
baseline. `EditWidgetDialog.tsx` imports the per-widget `parseXSpec` functions. So the capability
registry — meant to be a clean plugin seam where the shell never knows what's inside a widget
(`docs/ARCHITECTURE.md`, "The capability registry") — is leaking: adding a sixth capability means
editing the shell. This plan adds one aggregating hook and a public parsers module so the shell talks
to capabilities through a narrow interface (a content-count map) instead of reaching inside each one.

## Current state

`frontend/src/shell/ChatPanel.tsx`:
- `:18–28` imports the widget state hooks:
  ```ts
  import { useChartState } from "../capabilities/widgets/Chart/useChartState";
  import { useImagesState } from "../capabilities/widgets/Images/useImagesState";
  import { useKnowledgeGraphState } from "../capabilities/widgets/KnowledgeGraph/useKnowledgeGraphState";
  import { useTableState } from "../capabilities/widgets/Table/useTableState";
  import { useTimelineState } from "../capabilities/widgets/Timeline/useTimelineState";
  ```
- `~:154–158` reads each one's `.entries` (and the graph's nodes) to build the unseen-glow baseline,
  and the restore effects (`~:280–324`) use per-capability content presence.

`frontend/src/shell/EditWidgetDialog.tsx:8–11` imports the per-widget parse functions
(`parseChartSpec`, `parseTableSpec`, …) which are otherwise internal widget concerns (defined in,
e.g., `Table/useTableState.tsx:47` as `parseTableSpec`).

Each widget already exposes its state via a hook returning `{ entries, ... }` (Table/Chart/Timeline/
Images) or graph nodes (KnowledgeGraph). The capability catalog lists every capability
(`frontend/src/capabilities/catalog.tsx`).

### Conventions to follow

- The registry/plugin language is in `docs/ARCHITECTURE.md` — "Renderers are plugins keyed by
  `type`", "the shell never knows what's inside a widget", `useCapabilityContent`. Name the new hook
  to fit that vocabulary.
- Frontend tests: vitest + jsdom.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Frontend build | `cd frontend && bun run build` | exit 0 |
| Unit tests | `cd frontend && bunx vitest run` | all pass |
| E2E | `cd frontend && bun run test:e2e` | all pass |
| Lint | `cd frontend && bunx biome check .` | exit 0 |

## Scope

**In scope**:
- `frontend/src/capabilities/hooks/useCapabilityContentCounts.tsx` (create) — calls the five per-widget
  state hooks internally and returns `Record<string /*capabilityId*/, number /*content count*/>`.
- `frontend/src/capabilities/widgets/parsers.ts` (create) — the public re-export of every
  `parseXSpec`, so `EditWidgetDialog` and others import from one place instead of digging into each
  widget's state module.
- `frontend/src/shell/ChatPanel.tsx` — drop the five hook imports + `.entries.length` reads; use
  `useCapabilityContentCounts()`.
- `frontend/src/shell/EditWidgetDialog.tsx` — import parsers from the new public module.

**Out of scope**:
- The widget state hooks themselves — unchanged; the aggregator calls the existing hooks.
- The restore *logic* / ordering — only its *source of content presence* changes (count map instead
  of five direct reads). Behavior identical. (If plan 008 landed, the restore logic lives in
  `useRestoreCapabilities` — feed it the count map there.)
- Adding/removing capabilities.

## Git workflow

- Branch: `advisor/009-capability-content-hook`. Do NOT push or commit.

## Steps

### Step 1: Create the aggregator hook

```tsx
// useCapabilityContentCounts.tsx
export function useCapabilityContentCounts(): Record<string, number> {
  const table = useTableState();
  const chart = useChartState();
  const timeline = useTimelineState();
  const images = useImagesState();
  const graph = useKnowledgeGraphState();
  return useMemo(() => ({
    [TABLE_WIDGET.id]: table.entries.length,
    [CHART_WIDGET.id]: chart.entries.length,
    [TIMELINE_WIDGET.id]: timeline.entries.length,
    [IMAGES_WIDGET.id]: images.entries.length,
    [KNOWLEDGE_GRAPH_WIDGET.id]: graph.nodes.length, // confirm the graph's count field
  }), [table.entries, chart.entries, timeline.entries, images.entries, graph.nodes]);
}
```
Confirm each `*_WIDGET.id` import and the graph's content-count field name against the actual hooks.

**Verify**: `cd frontend && bun run typecheck` → exit 0.

### Step 2: Create the public parsers module

`frontend/src/capabilities/widgets/parsers.ts`:
```ts
export { parseTableSpec } from "./Table/useTableState";
export { parseChartSpec } from "./Chart/useChartState";
export { parseTimelineSpec } from "./Timeline/useTimelineState";
export { parseImagesSpec } from "./Images/useImagesState";
// (+ knowledge graph parser if EditWidgetDialog uses it)
```
(Confirm the exact exported names in each module.)

### Step 3: Re-point the shell

In `ChatPanel.tsx`: remove the five `useXState` imports (`:18–28`) and the direct `.entries.length`
reads (`~:154–158`); call `const contentCounts = useCapabilityContentCounts();` once and read
`contentCounts[id]` where the baseline/glow logic needs a count. In `EditWidgetDialog.tsx`, change the
parser imports (`:8–11`) to `from "../capabilities/widgets/parsers"`.

**Verify**: `cd frontend && bun run build` → exit 0. Confirm the coupling is gone:
`grep -n "useTableState\|useChartState\|useTimelineState\|useImagesState\|useKnowledgeGraphState" frontend/src/shell/ChatPanel.tsx`
→ no matches.

## Test plan

- Add `frontend/src/capabilities/hooks/useCapabilityContentCounts.test.tsx` (vitest + jsdom): render
  the hook inside the widget providers, push one entry into the Table provider, assert the returned
  map reflects it. Model after `useStreamingEntries.test.tsx`.
- The e2e `render-tool` + `mobile-layout` specs prove the glow/restore behavior is unchanged.

## Done criteria

- [ ] `cd frontend && bun run build` exits 0
- [ ] `cd frontend && bunx vitest run` passes, including the new hook test
- [ ] `cd frontend && bun run test:e2e` passes
- [ ] `grep -n "useTableState\|useChartState\|useTimelineState\|useImagesState\|useKnowledgeGraphState" frontend/src/shell/ChatPanel.tsx` → no matches
- [ ] `EditWidgetDialog.tsx` imports parsers from `capabilities/widgets/parsers`
- [ ] `cd frontend && bunx biome check .` exits 0
- [ ] `git status` shows only the in-scope files changed
- [ ] `plans/README.md` row updated

## STOP conditions

- A capability's content count isn't expressible as a single number from its hook (e.g. the graph
  needs more than `.nodes.length` to decide "has content") → STOP and report; the count map may need
  to be a `boolean` "hasContent" instead — adjust the interface but keep the shell decoupled.
- Moving the parser exports creates a circular import (parsers ← widget ← parsers) → STOP and report.
- An e2e glow/restore spec goes red → STOP; the content signal changed semantics, which this plan
  forbids.

## Maintenance notes

- Adding a sixth capability is now: a catalog entry + a renderer + one line in
  `useCapabilityContentCounts`. The shell otherwise doesn't change. A reviewer should reject a new
  `useXState` import landing back in `ChatPanel.tsx`.
- Consider (deferred) having each capability publish its own content-count via the registry so even
  the aggregator hook doesn't hard-list the five — only worth it once there are more capabilities.
