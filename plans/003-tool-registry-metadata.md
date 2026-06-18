# Plan 003: Fold tool dispatch + metadata into one registry

> **Executor instructions**: Follow step by step; run every verify command. On any STOP condition,
> stop and report. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 476d17e..HEAD -- backend/src/tools.ts`
> If `tools.ts` changed since 476d17e, compare the excerpts below to the live code first.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (cleaner if 001's `TOOL_NAMES` exists — see note)
- **Category**: tech-debt
- **Planned at**: commit `476d17e`, 2026-06-18

## Why this matters

Knowing everything about one tool requires reading three separate places in `tools.ts`: the
`executeTool` switch (what it does), the `STREAMABLE_RENDER_TOOLS` set (whether its partial JSON
streams), and the `DATA_TOOLS` list / `buildTools` factory (when it's offered). Adding a tool means
editing all of them and not forgetting one. A single registry keyed by tool name — `{ execute,
streamable }` per tool — makes the dispatch a lookup and keeps each tool's facts in one row. This
does **not** merge the schema definitions (those stay as the Anthropic JSON-Schema blocks); it
unifies the *runtime* metadata + dispatch.

## Current state

`backend/src/tools.ts`:

- `executeTool` switch — `:801–837`:
  ```ts
  export async function executeTool(name, input, sessionId?): Promise<string> {
    switch (name) {
      case "get_current_datetime": return new Date().toISOString();
      case "search_images":        return searchImages(input, sessionId);
      case "wikidata_search":      return wikidataSearch(input);
      // … wikidata_query, world_bank, wikipedia_summary, openalex_search …
      case "render_images":        fireUnsplashCreditsForRender(input); return JSON.stringify(input);
      case "build_knowledge_graph":
      case "render_table":
      case "render_chart":
      case "render_timeline":      return JSON.stringify(input);   // echo
      default: throw new Error(`Unknown tool: "${name}"`);
    }
  }
  ```
- `STREAMABLE_RENDER_TOOLS` set — `:845–850` (the render tools whose input JSON streams: knowledge
  graph + render_table/chart/timeline/images).
- `DATA_TOOLS` list and `buildTools(...)` factory — around `:613` / `:633`, which conditionally
  include `WEB_SEARCH_TOOL` (Claude only) and `BUILD_KNOWLEDGE_GRAPH_TOOL` (graphMode only).

### Conventions to follow

- Keep the JSON-Schema tool definitions (the `TOOLS` array / `*_TOOL` consts) exactly where they are.
- Match the existing comment density — each registry row gets a one-line comment if its behavior is
  non-obvious (the echo tools, the Unsplash-credit side effect).
- If plan 001 landed, import `TOOL_NAMES` from `@contract/tools` and key the registry on those
  constants instead of bare strings.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Backend verify | `cd backend && bun run verify` | exit 0 (runs `tools.shape.test.ts`, `tools.test.ts`) |
| Lint | `cd backend && bunx biome check .` | exit 0 |

## Scope

**In scope**:
- `backend/src/tools.ts` — introduce `TOOL_REGISTRY`, rewrite `executeTool` as a lookup, derive
  `STREAMABLE_RENDER_TOOLS` from the registry.

**Out of scope**:
- The JSON-Schema definitions and `buildTools` provider/graphMode gating logic — leave as-is (you
  may have the registry *reference* them, but don't restructure `buildTools` here).
- The data-fetch implementations (`searchImages`, `wikidataSearch`, …) — unchanged; the registry
  just points at them.
- `llm.ts` consumers of `STREAMABLE_RENDER_TOOLS` — must keep working (it stays exported).

## Git workflow

- Branch: `advisor/003-tool-registry`. Do NOT push or commit.

## Steps

### Step 1: Define the registry

Above `executeTool`, add:
```ts
type ToolEntry = {
  execute: (input: unknown, sessionId?: string) => Promise<string> | string;
  streamable?: boolean; // render tools whose input_json_delta streams to the client
};

const TOOL_REGISTRY: Record<string, ToolEntry> = {
  get_current_datetime: { execute: () => new Date().toISOString() },
  search_images:        { execute: (i, s) => searchImages(i, s) },
  wikidata_search:      { execute: (i) => wikidataSearch(i) },
  wikidata_query:       { execute: (i) => wikidataQuery(i) },
  world_bank:           { execute: (i) => worldBank(i) },
  wikipedia_summary:    { execute: (i) => wikipediaSummary(i) },
  openalex_search:      { execute: (i) => openalexSearch(i) },
  render_images:        { streamable: true, execute: (i) => { fireUnsplashCreditsForRender(i); return JSON.stringify(i); } },
  render_table:         { streamable: true, execute: (i) => JSON.stringify(i) },
  render_chart:         { streamable: true, execute: (i) => JSON.stringify(i) },
  render_timeline:      { streamable: true, execute: (i) => JSON.stringify(i) },
  build_knowledge_graph:{ streamable: true, execute: (i) => JSON.stringify(i) },
};
```

### Step 2: Rewrite `executeTool` as a lookup

```ts
export async function executeTool(name: string, input: unknown, sessionId?: string): Promise<string> {
  const entry = TOOL_REGISTRY[name];
  if (!entry) throw new Error(`Unknown tool: "${name}"`);
  return entry.execute(input, sessionId);
}
```

### Step 3: Derive `STREAMABLE_RENDER_TOOLS` from the registry

Replace the hand-written set (`:845`) with:
```ts
export const STREAMABLE_RENDER_TOOLS: ReadonlySet<string> = new Set(
  Object.entries(TOOL_REGISTRY).filter(([, e]) => e.streamable).map(([name]) => name),
);
```
Keep the existing explanatory comment above it.

**Verify**: `cd backend && bun run verify` → exit 0. Confirm the set is unchanged:
the streamable names must be exactly `build_knowledge_graph, render_table, render_chart,
render_timeline, render_images` (order-independent).

## Test plan

- The existing `tools.shape.test.ts` and `tools.test.ts` are the net. Add to one of them (or a new
  `tools.registry.test.ts`, modeled after `tools.test.ts`):
  - `executeTool("get_current_datetime", {})` returns an ISO string.
  - `executeTool("render_table", { rows: [] })` echoes `JSON.stringify({ rows: [] })`.
  - `executeTool("nope", {})` rejects with `Unknown tool`.
  - `STREAMABLE_RENDER_TOOLS` has exactly the five expected names.

## Done criteria

- [ ] `cd backend && bun run verify` exits 0; new registry tests pass
- [ ] `cd backend && bunx biome check .` exits 0
- [ ] No `switch (name)` remains in `executeTool` (`grep -n "switch (name)" backend/src/tools.ts` → none)
- [ ] `STREAMABLE_RENDER_TOOLS` still exported and resolves to the same five names
- [ ] `git status` shows only `backend/src/tools.ts` (+ test file) changed
- [ ] `plans/README.md` row updated

## STOP conditions

- The render-tool echo behavior or the Unsplash-credit side effect can't be reproduced exactly in a
  registry entry — STOP (these are behavior-critical; the result string is fed back to the model).
- `STREAMABLE_RENDER_TOOLS` derived set differs from the original five names — STOP and report.
- Any verify fails twice after a reasonable fix.

## Maintenance notes

- Adding a tool is now: one JSON-Schema block (unchanged location) + one `TOOL_REGISTRY` row. The
  streamable flag and dispatch come from that single row.
- A natural follow-up (deferred): move the per-tool *schema* into the registry row too, so a tool is
  a single object. Not done here to keep risk LOW and the diff small.
