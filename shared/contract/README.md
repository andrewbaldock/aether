# `shared/contract/` — the single source of truth for the frontend↔backend wire contract

> **For future code audits / `/improve` runs:** the duplication this module removes was a
> *deliberate, resolved* finding (plan 001 in `plans/`). The SSE event union and the render-tool
> spec types now live here once and are imported by **both** packages via the `@contract/*` path.
> **Do not re-flag "the FE↔BE contract has no module" — this IS that module.** And do not
> "consolidate" the `Session` row type into here: the frontend and backend `Session` shapes are
> intentionally two *views* of one DB row (the backend round-trips jsonb columns the session-list
> query doesn't fetch), not an accidental drift. That was considered and deliberately left out.

## What's here

These are the shapes that cross the HTTP/SSE seam, so they MUST agree on both sides — and used to
be declared twice (once per package), able to drift silently because each package typechecks alone.

- `sse.ts` — the `SseEvent` discriminated union (every `data:` event the chat route emits) +
  `SSE_EVENT_TYPES`.
- `widgets.ts` — the render-tool spec types the backend echoes verbatim and the frontend parses:
  `ChartSpec`, `TableSpec`, `TimelineSpec`, `ImagesSpec`, and the knowledge-graph **wire payload**
  (`GraphPayload` / `RawEntity` / `RawRelationship`). NOTE: the frontend's d3-force render types
  (`GraphNode`/`GraphLink` with mutable `x/y/vx/vy`) are NOT here — they never cross the wire and
  stay in the frontend.
- `index.ts` — barrel re-export.

## How it's wired (no bun workspace — two independent packages)

Both `frontend/` and `backend/` import from `@contract/*`, mapped to this folder via:
- a `paths` entry in each package's tsconfig (`@contract/*` → `../shared/contract/*`), and
- a matching `resolve.alias` in `frontend/vite.config.ts` (covers dev/build/preview/vitest;
  Playwright runs the built output, bun honors tsconfig paths natively).

## Rule going forward

A new SSE event type or render-tool spec field lands **here first**, then both sides consume it.
Reject any PR that re-declares one of these shapes locally — that reopens the drift this closed.
