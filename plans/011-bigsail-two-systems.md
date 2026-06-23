# Plan 011: Split Bigsail layout into two distinct systems (Streaming Packing + Vanilla Grid)

> **Executor instructions**: Follow step by step. Run every verification command and confirm the
> expected result before moving on. If a STOP condition occurs, stop and report — do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c4a4bf..HEAD -- frontend/src/capabilities/widgets/Bigsail`
> If any Bigsail file changed since 9c4a4bf, compare the "Current state" excerpts below against the
> live code before proceeding; on a real mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (recurring friction — this has been fought repeatedly)
- **Effort**: M
- **Risk**: MED-HIGH (rewrites the heart of Bigsail card placement; the loading contract + restore
  path must keep working)
- **Depends on**: none
- **Category**: tech-debt / architecture (a deepening — collapses one tangled conditional system into
  two simple ones with a hard handoff)
- **Planned at**: commit `9c4a4bf`, 2026-06-18

## Why this matters

Bigsail's card layout is **one system pretending to be two**, and it has caused repeated
"the card got shoved to the bottom / a gap won't close / my drag got undone" fights. Today a single
`placeCards()` decides, via a `settled` flag and a `userMoved` pin partition, whether to run the
role-based template (`autoLayout`) or honor saved positions — and the template can re-run on *every*
card-set change while a turn streams, repositioning auto cards (the "shove to the bottom"). On top of
that, GridStack runs with `float: true` (no gravity), so when a card is hidden the gap it leaves never
closes. The result is two behaviors tangled in one code path with three interacting guards
(`settled`, `userMoved`, `float`), and tuning one breaks another.

**The decision (Andrew, 2026-06-18):** make them two **entirely separate** systems with a hard,
one-time handoff, so there's nothing to fight:

- **System 1 — "Streaming Packing"**: our scripted, role-based template. Runs **only during the
  initial build of a conversation** (first time it's composed, when there is no saved `tilesLayout`
  yet). Produces an explicit x/y/w/h for every card, persists it once, and then goes **dormant for
  the life of the conversation**.
- **System 2 — "Vanilla Grid"**: plain GridStack with **`float: false`** (upward vertical
  compaction). Owns everything after the initial build — including later turns in the same
  conversation. The user drops anything anywhere; a card with nothing above it floats up; hiding a
  card pulls the cards below it up to close the row. New cards from later turns just **drop into the
  existing grid** (appended; gravity floats them up) — System 1 never re-templates them.

Concretely, Andrew's acceptance example: *4 panels, 2 per row — row A = panels 1,2; row B =
panels 3,4. Hide panel 1 → panel 3 rises into row A.* That is exactly `float: false` behavior.

This removes the `settled`-ternary, the `userMoved` pin machinery, and the template-re-runs-on-change
logic — all of which existed only to protect user moves *while the template kept running*. If the
template runs **once** and never again, there is nothing to protect against.

## Decisions locked (do NOT re-litigate)

1. **Handoff trigger = "conversation load complete."** System 1 runs only for the very first build of
   a conversation's canvas. Detection: there is no usable saved `tilesLayout` yet (a fresh conversation
   that has never been arranged). Once a layout exists in `ui_state.tilesLayout`, System 2 owns it —
   on this load and every subsequent one, including new turns.
2. **New turn after arranging = new cards drop in; arrangement kept.** A later turn's new cards are
   appended to the existing grid and float up via System 2; System 1 does NOT re-run / re-template.
   The hand-arrangement is never disturbed by a later turn.
3. **System 2 uses `float: false`.** This was `float: true` before (see the history note in
   `TilesCanvas.tsx` — it was flipped to stop the *template* fighting drags). With the template no
   longer running in user mode, `float: false` is correct and is what Andrew wants (matches the SM
   dashboard's react-grid-layout vertical compaction). The old "yank to bottom on every gesture"
   worry was the template re-running, not gravity itself.

## Current state

All paths are in `frontend/src/capabilities/widgets/Bigsail/`.

- **`tilesLayout.ts`**
  - `autoLayout(cards, stacked, pinned)` (`:119–253`) — the role-based template (System 1's core):
    top row KG+Timeline (half/half, lone→full), then Table (full), Charts (full, stacked), Images
    (full), then "extras" stacked full-width below. Stacks `y` top-down by `SLOT_H`. **Keep this — it
    becomes System 1.** It currently also takes a `pinned` arg and has lone-promotion / swap-dodge
    logic that only exists to coexist with user pins mid-stream; that coexistence goes away.
  - `placeCards(cards, saved, stacked, settled)` (`:276–317`) — THE tangle. Partitions cards into
    `pinned` (userMoved, or any-saved-when-settled) vs `autoCards`, runs `autoLayout` on the auto
    set, honors pins verbatim. The `settled` ternary + `userMoved` partition is what we're replacing.
  - `TilesLayoutItem` / `PlacedCard` types; `stackFullWidth`, `clamp`, `SLOT_H`, `FULL_W`, `HALF_W`.
- **`TilesCanvas.tsx`**
  - GridStack init (`:103–113`) with **`float: true`** (`:108`) — flip to `false`.
  - `userMovedRef` seeding (`:88–96`) + `markMoved` on `dragstop`/`resizestop` (`:119–124`) +
    `serialize()` stamping `userMoved` (`:49–70`). The `userMoved` flag becomes unnecessary for
    System 2 (every position is just honored + gravity-compacted); see Step 4 for how much to remove.
  - The reconcile effect adds/updates/removes widgets; removal is `grid.removeWidget(el, true)`
    (`:152–157`); there is **no `compact()`** today (a comment at the old `:212` explains why under the
    template regime). With `float: false`, removal auto-compacts — that's the whole point.
- **`BigsailWidget.tsx`**
  - `const settled = !busy && !restoreLoading;` (`:267`) and
    `placeCards(visibleCards, savedLayout, stacked, settled)` (`:268–271`).
  - `persistLayout()` (`:278–312`) — debounced 900ms write of `tilesLayout`, carrying forward
    not-yet-rendered cards' saved slots (the async-KG guard at `:293–297` — **keep this**).
  - `resetLayout()` (`:327–341`) writes `tilesLayout: []` + bumps `resetTick` (the GridStack
    remount key `:371`). Reset = "re-run System 1 once" under the new model.
  - The loading contract: `waitingForFirstPanel` / `showLoadingOverlay` / skeleton cards
    (`skeleton:*` ids) (`:343–348`). **Must keep working** — see [Bigsail Loading CONTRACT].
- **`tilesLayout.test.ts`** (391 lines) — tests the current `placeCards`/`settled`/`userMoved`
  behavior heavily. Will need a rewrite to the two-system model (see Test plan).

### Conventions to follow

- Frontend tests are **vitest + jsdom** (`bunx vitest run`), NOT `bun test`. Model new tests after the
  existing `tilesLayout.test.ts` structure.
- GridStack OWNS grid-item DOM; React owns only content via a portal (see the comment block at the top
  of `TilesCanvas.tsx`). Don't render grid items as JSX children.
- Theme tokens only (`bg-surface`, `text-content`) — but this plan shouldn't touch styling.
- `frontend/src/lib/composition.ts` defines `TilesLayoutItem` (re-pointed to nothing external; local).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Frontend build (real gate) | `cd frontend && bun run build` | exit 0 |
| Unit tests | `cd frontend && bunx vitest run` | all pass |
| Just the layout tests | `cd frontend && bunx vitest run tilesLayout` | all pass |
| E2E (render-tool + mobile) | `cd frontend && bun run test:e2e` | all pass |
| Lint | `cd frontend && bunx biome check src/capabilities/widgets/Bigsail` | exit 0 |
| Run the app to test live | from repo root: `bun run dev` (or the SwiftBar control panel) | servers on :5174 / :8000 |

## Scope

**In scope** (`frontend/src/capabilities/widgets/Bigsail/`):
- `tilesLayout.ts` — replace `placeCards`'s tangled partition with the two-system handoff; simplify or
  drop the `pinned`/lone-promotion/swap-dodge complexity in `autoLayout` that only served pin-coexistence.
- `TilesCanvas.tsx` — `float: false`; remove now-dead `userMoved` machinery (or reduce per Step 4).
- `BigsailWidget.tsx` — replace the `settled`-driven `placeCards` call with the new entry point.
- `tilesLayout.test.ts` — rewrite for the two-system model.

**Out of scope** (do NOT touch):
- The loading animation / skeleton-drip contract (`BigsailLoading`, `skeleton:*`, `firstPanelArrived`,
  `useAgentBusy`) — behavior must be unchanged. See [Bigsail Loading CONTRACT] and
  [reference-aether-bigsail-loading].
- Persistence schema / `SCHEMA_VERSIONS.tilesLayout` / the backend `ui_state` round-trip. (You MAY stop
  writing `userMoved`; that's an additive omission — old rows with `userMoved` still load fine since the
  field just stops being read. Do NOT bump the schema version for that.)
- The per-card content, flip/back-face, hide/duplicate actions (only their *layout* effect changes).
- `cards.ts`, `plan.ts`, `skeletonCards.ts` shapes.
- The mobile `stacked` path (skinny → full-width stack) — keep it as a short-circuit.

## Git workflow

- Branch: `advisor/011-bigsail-two-systems`.
- Do NOT push or commit. Leave the tree clean; the maintainer commits after testing live.

## The two-system model (target design)

```
                    is there a usable saved tilesLayout for this conversation?
                                   │
                  NO (fresh build) │                          │ YES (already built / arranged)
                                   ▼                          ▼
                 ┌───────────────────────────┐   ┌──────────────────────────────────────┐
   SYSTEM 1      │ Streaming Packing          │   │ SYSTEM 2: Vanilla Grid                │
  (initial only) │ autoLayout() → explicit    │   │ honor saved x/y/w/h verbatim for      │
                 │ x/y/w/h for every card,    │   │ known cards; any card with NO saved   │
                 │ persisted once             │   │ slot (new turn, unhidden, duplicate)  │
                 └──────────────┬─────────────┘   │ appends at the bottom → GridStack     │
                                │                  │ float:false floats it up; hide → rows │
                                └───── handoff ───▶│ below rise. Template NEVER runs here. │
                                  (saved layout)   └──────────────────────────────────────┘
```

The single source of truth for "which system" is: **does `savedLayout` contain a real (non-skeleton)
entry?** Empty/absent → System 1 (build it). Non-empty → System 2 (honor + float).

## Steps

### Step 1: Flip GridStack to `float: false` (System 2's gravity)

In `TilesCanvas.tsx` GridStack init (`:108`): `float: true` → `float: false`. Update the top-of-file
comment block to describe the two systems (a comment edit landing this was already drafted on
2026-06-18 — keep its intent: float:false = upward compaction = no vertical gaps in user mode; the
template only packs during the initial build).

**Verify**: `cd frontend && bun run build` → exit 0. (Behavior verified live in Step 6.)

### Step 2: Replace `placeCards` with the two-system entry point

Rewrite `placeCards(cards, saved, stacked)` in `tilesLayout.ts` (drop the `settled` param) to:

1. `if (stacked) return autoLayout(cards, true);` — unchanged mobile short-circuit.
2. Build `savedById` from `saved` (non-skeleton entries only).
3. **If no real saved entry exists** → System 1: `return autoLayout(cards, false)` (script the whole
   canvas). This is the initial build.
4. **Else** → System 2: for each card, if it has a saved slot, honor it verbatim (clamped to grid as
   today, `:298–300`); if it has NO saved slot (a new card), give it an **append position** — below
   everything currently placed, full-width (or a sane default w), so GridStack's `float: false` then
   floats it up into the first free space. Return the combined list. **Do NOT call `autoLayout` on the
   known cards** — the template must not run in System 2.

Remove the `pinned`/`autoCards` partition and the `settled` branch entirely. The `userMoved` flag is no
longer consulted here.

**Verify**: `cd frontend && bunx vitest run tilesLayout` after Step 5's test rewrite. Type-only check
now: `cd frontend && bun run typecheck` → exit 0.

### Step 3: Simplify `autoLayout` (System 1 only — no more pin coexistence)

`autoLayout` no longer needs the `pinned` parameter or the lone-promotion / swap-dodge logic
(`:154–211`) — those existed solely so the template could coexist with user pins mid-stream, which no
longer happens (System 1 runs alone, on a clean canvas). Reduce to: top row (KG left half / Timeline
right half, lone → full), Table full, Charts full stacked, Images full, extras stacked. Keep `SLOT_H`,
`FULL_W`, `HALF_W`, `stackFullWidth`.

> If removing `pinned` ripples wider than expected (other callers), STOP and report — it may be cleaner
> to keep the param but always pass `[]`. Either is acceptable; don't spend long here.

**Verify**: `cd frontend && bun run typecheck` → exit 0.

### Step 4: Remove the now-dead `userMoved` machinery in `TilesCanvas.tsx`

With System 2 honoring every saved position and gravity closing gaps, `userMoved` no longer drives
anything. Remove: the `userMovedRef` seeding (`:88–96`), the `markMoved` handlers + `dragstop`/
`resizestop` listeners (`:119–124`), and the `userMoved` stamp in `serialize()` (`:49–70`) — `serialize`
just emits `{id,x,y,w,h}`. Keep the `change` → `onLayoutChange(serialize(...))` wiring.

> Keep `TilesLayoutItem.userMoved?` in the type as an OPTIONAL, ignored field (backward-compat: old
> saved rows still carry it; reading stops, writing stops, but its presence must not break load). Do
> not bump `SCHEMA_VERSIONS.tilesLayout`.

**Verify**: `cd frontend && bun run typecheck` → exit 0.

### Step 5: Update `BigsailWidget.tsx` + rewrite the layout tests

- `BigsailWidget.tsx`: drop `const settled = …` (`:267`) and call `placeCards(visibleCards,
  savedLayout, stacked)` (no `settled`). Everything else (persist debounce + the async-KG carry-forward
  at `:293–297`, reset, loading overlay) stays. `restoreLoading` still gates `onLayoutChange` to a
  no-op during the restore drip (`:376`) — keep that.
- `tilesLayout.test.ts`: rewrite around the two systems:
  - **System 1 (no saved layout)**: KG+Timeline pair to half/half top row; lone KG → full width;
    Table/Charts/Images stack full-width in order; extras stack below. (Reuse the existing
    `autoLayout`/no-saved assertions; drop the `settled`/`userMoved`/pin-coexistence cases.)
  - **System 2 (saved layout present)**: a card with a saved slot is returned verbatim (clamped); a
    NEW card with no saved slot is appended below all saved cards (assert its `y` is ≥ the max saved
    `y+h`); the template is NOT invoked (e.g. a lone saved KG stays whatever width it was saved at, it
    does NOT get promoted to full). Note: gap-closing itself is GridStack's job (`float:false`) and is
    verified live, not in this pure unit (it tests placement input, not the engine).

**Verify**: `cd frontend && bunx vitest run` → all pass (rewritten layout tests + the rest of the suite).

### Step 6: Live verification (the real proof)

Run the app and exercise both systems by hand:

1. From repo root `bun run dev` (frontend :5174, backend :8000) — or the SwiftBar control panel.
2. **System 1**: start a NEW conversation, ask something that composes multiple cards (e.g. "compare
   France, Germany, Spain populations with a table, a chart, and a timeline"). Confirm the canvas
   builds tidily via the template, no gaps, loading animation → skeletons → real cards (the loading
   contract intact).
3. **System 2 — gap close on hide** (Andrew's acceptance test): arrange/observe 4 cards 2-per-row.
   Hide a top-left card → the card below it rises into the freed row. No vertical gap remains.
4. **System 2 — drag**: drag a card down into open space → it settles up (float). Drag to swap →
   sticks where dropped (modulo gravity pulling up). Reload the page → arrangement restored verbatim.
5. **New turn after arranging**: with a hand-arranged canvas, send another turn that adds a card →
   the new card drops in at the bottom and floats up; the existing arrangement is NOT re-templated.

Report what each step actually did. **If step 3 or 4 still "shoves to the bottom" or leaves a gap,
STOP and report exactly when** — that distinguishes a System-1-still-running bug (template leaking into
user mode) from a `float` issue.

## Test plan

- Rewrite `tilesLayout.test.ts` per Step 5 (System 1 placement + System 2 honor/append). ~unit level.
- Keep all other Bigsail unit tests green (`skeletonCards.test.ts`, `tilesLayout.test.ts` siblings).
- E2E: `bun run test:e2e` must stay green — especially `render-tool` (the SSE→widget→canvas round trip)
  and the mobile specs. These exercise the canvas mounting + a card landing.
- Live: Step 6 is the authoritative behavioral check; the unit tests can't exercise GridStack's engine.

## Done criteria

ALL must hold:

- [ ] `cd frontend && bun run build` exits 0
- [ ] `cd frontend && bunx vitest run` passes (rewritten layout tests included)
- [ ] `cd frontend && bun run test:e2e` passes (all 7 viewport projects)
- [ ] `cd frontend && bunx biome check src/capabilities/widgets/Bigsail` clean (no NEW findings)
- [ ] `grep -n "settled" frontend/src/capabilities/widgets/Bigsail/tilesLayout.ts` → no matches
      (the `settled` ternary is gone)
- [ ] `grep -rn "userMovedRef\|markMoved" frontend/src/capabilities/widgets/Bigsail/TilesCanvas.tsx`
      → no matches (dead pin machinery removed)
- [ ] `grep -n "float: false" frontend/src/capabilities/widgets/Bigsail/TilesCanvas.tsx` → matches
- [ ] Live Step 6: hiding a card raises the one below (Andrew's 4-panel test); a new turn drops cards
      into an existing arrangement without re-templating
- [ ] `git status` shows only files under `frontend/src/capabilities/widgets/Bigsail/` changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- After Step 1+2, the **loading contract** breaks (no animation, skeletons don't drip, or a real card
  doesn't replace its skeleton) — the two-system split must not touch that path. See
  [Bigsail Loading CONTRACT].
- The "is this conversation already built?" signal is ambiguous — e.g. an async-hydrating KG makes
  `savedLayout` look empty on first render and you can't distinguish "fresh build" from "loading an
  arranged conversation." If so, STOP: the handoff trigger needs a more robust signal than
  `savedLayout` emptiness (the carry-forward at `BigsailWidget.tsx:293` is a clue the saved layout is
  authoritative even when cards lag).
- Live Step 6 shows GridStack `float: false` DOES "yank cards to the bottom on every gesture" (the old
  comment's worry, independent of the template) — if so, System 2 needs explicit gap-close-on-removal
  instead of global float; STOP and report so we choose that variant.
- Removing `userMoved` would change what gets persisted in a way that breaks restoring an
  already-arranged conversation — STOP; keep writing the field if needed.
- Any verification fails twice after a reasonable fix.

## Maintenance notes

- The mental model going forward: **System 1 builds once, System 2 owns forever.** A reviewer should
  reject any change that makes `autoLayout` run again after the initial build, or that reintroduces a
  `settled`/`userMoved`-style guard — that's the tangle this plan removed.
- "Reset layout" (currently commented out in the UI, wiring intact at `BigsailWidget.tsx:327`) is now
  cleanly defined: clear `tilesLayout` → next render has no saved entry → System 1 rebuilds once.
- If a future need arises to re-pack on a later turn (Andrew chose NOT to, 2026-06-18), it's a
  deliberate System-1 re-invocation, not a template leak — gate it explicitly.
- Update [Bigsail Loading CONTRACT] / [project-aether-bigsail] memory if the handoff signal or the
  persistence shape changes materially.
```
