# Plan 008: Split the `ChatPanel.tsx` god-component

> **Executor instructions**: Follow step by step; run every verify command. On any STOP condition,
> stop and report. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 476d17e..HEAD -- frontend/src/shell/ChatPanel.tsx`
> If `ChatPanel.tsx` changed since 476d17e, compare the excerpts below to the live code first.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: HIGH (deeply entangled with SessionContext, useChat, the agent-event bus, the capability store)
- **Depends on**: none (but doing 009 after this is cleaner)
- **Category**: tech-debt
- **Planned at**: commit `476d17e`, 2026-06-18

## Why this matters

`frontend/src/shell/ChatPanel.tsx` is 1077 lines tangling at least seven concerns: conversation-title
editing, message transcript + scroll, attachment upload/drop, the unseen-glow restore state machine
(four `useEffect`s), the model picker, capability tab routing, and the composer. It's untested and
re-render-prone (effects keyed on entry counts, model, route, activeId all in one component). Splitting
it into focused subcomponents + one restore hook makes each piece testable and isolates the
restore-race logic that has bitten this app before. **This is a careful, incremental extraction — not
a rewrite.**

## Current state

`frontend/src/shell/ChatPanel.tsx` — 1077 lines. Key regions (from the audit):
- `:1–30` imports — including, at `:18–28`, the five widget state hooks (`useChartState`,
  `useImagesState`, `useKnowledgeGraphState`, `useTableState`, `useTimelineState`) and catalog/route
  helpers. (Decoupling those is plan 009 — out of scope here.)
- Relative-timestamp re-render tick — `~:86–90`.
- Attachment upload + file drop — `~:193–244`.
- Session-restore reset / restore / URL→activeId sync / no-session projection — `~:262–358` (4 effects).
- Message transcript render + scroll — `~:529–752`.
- `ConversationTitle` subcomponent (title editing) — `~:968–1076`.

It consumes `SessionContext` (messages, sessionId, getOrCreateSession), `useChat` (sendMessage,
isLoading), the agent-event bus, and the capability store (`useCapabilities`).

### Conventions to follow

- The shell components live in `frontend/src/shell/`. Match the existing component style (function
  components, hooks at top, Tailwind semantic tokens like `bg-surface`/`text-content` — never raw
  colors; see `docs` theme note).
- Frontend tests are **vitest + jsdom** (`bunx vitest run`, `import { ... } from "vitest"`), NOT
  `bun test`. See `frontend/src/**/*.test.tsx` for the pattern (e.g. `useStreamingEntries.test.tsx`).
- Build/mobile-first conventions in `CLAUDE.md` apply — don't regress the mobile layout.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Frontend build (real gate) | `cd frontend && bun run build` | exit 0 |
| Unit tests | `cd frontend && bunx vitest run` | all pass |
| E2E (chat + mobile) | `cd frontend && bun run test:e2e` | all pass |
| Lint | `cd frontend && bunx biome check .` | exit 0 |

## Scope

**In scope** (create under `frontend/src/shell/`):
- `ChatPanel/ConversationHeader.tsx` — the title-edit + share/delete header (lift `ConversationTitle`).
- `ChatPanel/MessageTranscript.tsx` — the message render loop + scroll behavior.
- `ChatPanel/ComposerFooter.tsx` — the textarea, attachments/drop, send/stop button.
- `ChatPanel/useRestoreCapabilities.ts` — the four restore effects collapsed into one hook.
- `frontend/src/shell/ChatPanel.tsx` — becomes a thin composition of the above.

**Out of scope**:
- **Plan 009's concern**: removing the five `useXState` imports / `.entries.length` reads. Leave that
  coupling exactly as-is here (009 handles it). If 009 already landed, consume its
  `useCapabilityContentCounts()` instead — but don't build it here.
- Any change to `SessionContext`, `useChat`, the bus, or the capability store.
- Visual/behavioral changes — this is structure-only. The rendered UI must be pixel-identical.

## Git workflow

- Branch: `advisor/008-split-chatpanel`. Commit per extracted component if you commit at all — but do
  NOT push. Leave the tree clean for the maintainer.

## Steps

> Extract one piece at a time, building + running tests after each, so the app is never broken between
> steps. Order: header → transcript → composer → restore hook (most isolated first).

### Step 1: Extract `ConversationHeader`

Move the `ConversationTitle` subcomponent (`~:968–1076`) and its title-edit state into
`ChatPanel/ConversationHeader.tsx`. Pass everything it needs as props (current title, sessionId,
rename/delete handlers) — do NOT have it reach into contexts ChatPanel already reads; thread via props.

**Verify**: `cd frontend && bun run build` → exit 0. The header renders identically.

### Step 2: Extract `MessageTranscript`

Move the transcript render loop + scroll refs/effects (`~:529–752`) into
`ChatPanel/MessageTranscript.tsx`, taking `messages`, `isLoading`, and any clarify-option handlers as
props.

**Verify**: `cd frontend && bun run build` → exit 0; `bun run test:e2e -- --grep "chat-flow"` passes.

### Step 3: Extract `ComposerFooter`

Move the composer (textarea/draft state), attachment upload + drop (`~:193–244`), and send/stop
control into `ChatPanel/ComposerFooter.tsx`. Props: `onSend`, `isLoading`, `onStop`, attachment
state/handlers.

**Verify**: `cd frontend && bun run build` → exit 0; `bun run test:e2e -- --grep "chat-flow"` (send +
stop) passes.

### Step 4: Collapse the restore effects into `useRestoreCapabilities`

Move the four effects (`~:262–358`: reset, restore landing/glow, URL→activeId sync, no-session
projection) into `ChatPanel/useRestoreCapabilities.ts`. The hook takes the inputs those effects read
(sessionId, route, content signals, the capability store actions) and owns the restore state machine,
exposing whatever ChatPanel needs back. **Preserve the exact ordering** — the comments at those lines
explain a known race (restore must run after content hydrates, must not clobber a manual URL nav).

**Verify**: `cd frontend && bun run build` → exit 0; `bun run test:e2e` full run passes (especially
`render-tool` and `mobile-layout`, which exercise restore).

### Step 5: ChatPanel becomes composition

`ChatPanel.tsx` now renders `<ConversationHeader/> <MessageTranscript/> <ComposerFooter/>` and calls
`useRestoreCapabilities(...)`. It should be dramatically smaller.

**Verify**: `cd frontend && bun run build && bunx vitest run && bun run test:e2e` all green;
`wc -l frontend/src/shell/ChatPanel.tsx` is well under 600.

## Test plan

- Add focused vitest tests for the newly-isolated pieces where practical:
  - `ChatPanel/ConversationHeader.test.tsx` — entering edit mode, committing a rename calls the prop.
  - `ChatPanel/useRestoreCapabilities.test.ts` — the restore state machine: a session with content on
    a non-active capability glows it; a manual URL nav is not clobbered. Model after
    `frontend/src/hooks/useRoute.test.ts` / `useStreamingEntries.test.tsx`.
- The e2e suite (`chat-flow`, `render-tool`, `mobile-layout`, `sidebar`) is the integration net — it
  must stay green throughout.

## Done criteria

- [ ] `cd frontend && bun run build` exits 0
- [ ] `cd frontend && bunx vitest run` passes, including new tests
- [ ] `cd frontend && bun run test:e2e` passes (all 7 viewport projects)
- [ ] `cd frontend && bunx biome check .` exits 0
- [ ] `ChatPanel.tsx` is under ~600 lines and is composition-only
- [ ] No behavioral/visual change (e2e proves it)
- [ ] `git status` shows only files under `frontend/src/shell/` changed
- [ ] `plans/README.md` row updated

## STOP conditions

- An extraction would require lifting or duplicating state out of `SessionContext`/`useChat`/the bus
  to make a subcomponent work → STOP and report; prop-threading should suffice.
- The restore hook can't preserve the documented effect ordering and an e2e (render-tool or
  mobile-layout) goes red → STOP; the restore race is real and this plan must not reintroduce it.
- Any verify fails twice after a reasonable fix.
- You find you must touch plan 009's coupling (the `useXState` imports) to proceed → STOP and either
  do 009 first or report.

## Maintenance notes

- After this, new chat-area features land in the relevant subcomponent, not a 1000-line file.
- A reviewer should verify the restore state machine in `useRestoreCapabilities` matches the old
  ordering exactly — that's the high-risk part.
- Pairs with 009: once the shell stops reading widget internals, the restore hook's inputs get
  cleaner still.
