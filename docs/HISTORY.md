# History

How Aether unfolded — the order things were built, the decisions made along the way, and why.

This is the narrative companion to [ROADMAP.md](./ROADMAP.md). The roadmap says *what's planned*;
this says *what happened, and in what order*. It's reconstructed from the commit history: 126
commits over roughly two and a half weeks (2026-05-29 → 2026-06-15). The rhythm throughout is
deliberate — **one focused change per commit, the app working at the end of each one.** New
dependencies land with a STACK.md update in the same breath; bigger features land with a docs
refresh and, often, a code-review pass right behind them.

> Authorship: built by Andrew, pairing with Claude. Direction and decisions are his; Claude did a
> lot of the typing. Where this doc says "I" it means Andrew.

---

## Day 0–1 — Skeleton & the shell (May 29–30)

The first three commits set the stage before a single feature exists:

- **`Initial commit`** — an empty repo with intent.
- **`monorepo skeleton`** — `frontend/` + `backend/` scaffolded as one repo, two packages. Bun as
  the only required tool (runtime, package manager, TS runner, test runner — one binary). Biome,
  strict TypeScript, `.env`, `.gitignore`.
- **`Add project docs`** — README, STACK, ARCHITECTURE, ROADMAP, contributor guide. The docs
  existed *before* most of the code. That's the bet: write down the shape you're aiming at, then
  build into it.

Then the structural decision that shaped everything after: **`Add three-zone shell with capability
registry`**. A resizable layout — sidebar · chat body · capability column — and a *registry seam*
so that "things the AI can show you" are plugins, not hardcoded screens. Everything that comes
later (graphs, charts, tables, timelines, the Tiles canvas) plugs into this seam. The shell was
built once and never fundamentally rethought.

---

## Day 2–3 — It talks (May 31 – June 1)

- **`branding`** — a name and a face before it's even smart. Identity early, partly because it
  changes how you relate to the thing you're building.
- **`backend + LLM`** — the spine: `POST /api/chat` → Claude → reply renders in chat. The first
  point where it's a real app.
- **`initial textarea as hero`** — the chat input is the hero element, not an afterthought at the
  bottom. The interface *is* the conversation.
- **`stream chat responses token-by-token via SSE`** — and crucially, *surface real API errors in
  the UI*. Streaming and honest error states arrived together; no silent failures.
- **`render assistant messages as markdown`** — react-markdown + remark-gfm. Answers should look
  like answers.
- **`add agent loop + tool use`** — the second structural seam. Claude can now call a tool
  mid-stream (`get_current_datetime` as the first, deliberately trivial, real tool). Every data
  source and every render capability later flows through this loop.
- **theme toggle, neon palette, thinking glyph** — light/dark, a neon identity, and the first
  version of the "thinking" animation. Polish interleaved with plumbing from early on.

The pattern is already visible: infrastructure and UI polish alternate. A streaming SSE backend in
one commit, send-button tweaks in the next.

---

## Day 4 — Memory (June 2)

- **`Add session persistence with Supabase`** — sessions + messages tables, anonymous localStorage
  identity, session history in the sidebar, save-on-done.
- **`Fix session correctness bugs`** — immediately. Persistence is the kind of feature that's 80%
  in one commit and correct in the next.
- **`Add Vitest and unit tests`** — tests arrive once there's logic worth protecting, not before.

End of Phase 1: a working full-stack conversational platform with tool use, persistence, and a
capability column ready to host experiences.

---

## Day 6–7 — Ship it, then graph it (June 4–5)

- **`add deployment config for Vercel + Fly.io`** — frontend to Vercel's edge, backend to Fly in
  Docker. Get it *live* before piling on features; deployment friction surfaced now is friction you
  don't discover later.
- **`new Aether Tool: d3-graphing`** — the first *visual* capability: a knowledge graph. The
  platform's "answers in their best form" thesis gets its first real proof. Followed quickly by
  **graph persistence + interactivity** and a **Fly cold-start fix** (the 502s that turned out to
  be scale-to-zero, not payload size).
- A run of brand and animation work: **`redesign wordmark in Grenze Gotisch`** (dropping the blurry
  neon-Ubuntu wordmark for crisp blackletter that holds up at small sizes), and the **`thinking
  glyph — Warhol 'A' that converges over pulsing graph nodes`** — which doubles as a working
  indicator, not just decoration.

---

## Day 8 — The data layer & going mobile (June 5–8)

- **`add TanStack Query data layer`** — one `QueryClient` + `apiFetch`, reads as queries, writes as
  mutations that invalidate the sessions key, retries that ride out Fly cold starts. Replaced a
  hand-rolled module-level cache. A deliberate "we've outgrown the ad-hoc version" upgrade.
- **`dedicated mobile view — beginnings`** then a big **mobile refine**: open to chat (not an empty
  graph), a graph⇄chat toggle, a KG info sheet, iOS zoom/keyboard fixes, `dvh` + safe-area. Mobile
  treated as a real surface, not a media query.
- **`add multi-provider support (Gemini, DeepSeek, Mistral)`** — the LLM connector becomes provider-
  agnostic. (Sonnet stays the default everywhere.)
- **`turn send button into a stop control while streaming`** — a small thing iterated on twice in
  one day until the abort affordance felt right: spinner at rest, stop icon on hover, never re-submits.
- **`dedup knowledge-graph nodes by canonical + fuzzy match`** — a *correctness* decision that
  shows real use: the model coined different slugs for the same entity across turns
  (`marie-curie` vs `marie-sklodowska-curie`), so the graph accreted duplicates. Fixed with a
  deterministic client-side fold plus tighter model guidance.

---

## Day 9–10 — Tools multiply (June 9–10)

This is where the "answers in their best form" thesis pays off — the capability registry earns its
keep as one render tool after another plugs in:

- **`Cap agent loop iterations`** — bound both `while(true)` loops with `MAX_ITERATIONS`; on the
  final pass, re-call without tools so it degrades to a text answer instead of looping forever. A
  safety rail learned from watching it run.
- **`Add title micro-agent using one-shot Haiku`** — cheap model for a cheap job.
- **`render_table` and `render_chart`** — structured answers.
- **`add widget persistence, explore-further, and share link`** — widgets survive reload; you can
  push deeper; you can share a conversation.
- **`add anthro web search tool`**, **`timeline tool`**, **`image search & gallery widget with
  rate-limited Unsplash`** — live data, time, and pictures. The rate-limiting (per-conversation
  Unsplash budget) is the kind of constraint you only add once it's real.
- **`Move toolbar to capability tab bar`** — the tools stop crowding the chat input and live in the
  tab bar; they're always on, they just open their tab.

---

## Day 13 — Tiles & "Strongification" (June 11–12)

The biggest single leap, shipped on a branch (`tiles-strongification`) and merged as PR #1 — the
only formal PR in the project, fittingly for its size.

**Tiles** (internal codename *Bigsail*): a GridStack canvas that mirrors *every* widget a
conversation produces as a live, rearrangeable card — drag, resize, no-overlap, auto-layout that
packs cards into full-width rows and squares off the bottom. It became the default home view,
surfaced on send and on restore. Critically, it **reused the existing single-spec renderers** (now
exported, no `*Card` wrappers) — no new render code, just a new way to arrange it. Layout persists
per conversation in `ui_state` with no schema change.

**Strongification** (backend intelligence) landed in the same arc:

- Keyless data tools — `wikidata_query` (SPARQL) and `world_bank` (indicator time series) — behind
  a two-step pattern: fetch real facts, *then* render. (REST Countries was dropped; its API was
  deprecated.)
- A **router + conditional planner** (Haiku, gated by a cheap heuristic) that emits an abstract
  composition plan over a new `plan` SSE event — capabilities and relationships, *never*
  coordinates. The planner knows nothing about Tiles; Tiles consumes the plan. Clean separation.
- **In-loop self-correction** — a bounded, graded retry when a render or data tool returns a
  degenerate (empty) result.

Then, immediately: **`Tiles layout polish`**, **`bug fix`**, **`Fix review findings`**, **`Add
test coverage`**, **`code review fixes`**. The big feature lands, then gets hardened in a run of
follow-ups — the post-merge cleanup is part of shipping it, not a separate phase.

---

## Day 13–14 — Hardening the machinery (June 12–13)

A cluster of unglamorous-but-load-bearing work:

- **`Richer charts`** — orientation, stacking, axis labels, smarter type guidance.
- **`Version persisted state, guard on load`** — per-tool `schemaVersion` stamps so old saved JSON
  clears cleanly instead of crashing a new renderer.
- **`shared Radix menu/select primitives across the app`** — consolidating one-off UI into shared
  parts once the patterns repeated enough to be worth it.
- **`progressive widget rendering + max_tokens salvage`** — stream widget JSON as it arrives, and
  *salvage* a best-effort parse on truncation instead of barfing. Robustness under real model limits.
- **`New dev tools: Playwright E2E suite (desktop + mobile), SwiftBar menu-bar launcher`** — tooling
  for *me*, to make the loop faster.

---

## Day 16–17 — Routing, PWA, and the long polish tail (June 14–15)

- **`Make admin pages and tool tabs URL-driven routes`** — the URL becomes the source of truth for
  which tab is open; restore rewrites the URL to match.
- **`make Aether an installable PWA`** — manifest + service worker, documented in MOBILE.md the same
  day.
- **`make the canvas self-healing`** — never wipe tiles on rebuild or a transient error. Hard-won
  resilience.
- **`clarifying pre-pass`** — the planner judges whether a thin-but-explodable question deserves one
  clarifying question *before* composing a full answer. The agent learning when to ask.
- A long tail of Bigsail polish: card back sides (re-prompt / inspect / hide), killing PATCH storms
  and refetch loops, a static icon vocabulary replacing dynamic lucide imports, duplicating a widget
  into both its tool tab and the canvas, restore-loading sequences, and **`reliable recreation
  prompts + tool-tab prompt/param editor`** — every widget can now show the prompt that made it and
  be re-rolled or hand-edited.

The final stretch is dense with `fix(...)` commits scoped tightly to `bigsail`, `sessions`,
`shell`, `widgets`, `chat`, `e2e`. By the end, most commits name exactly the seam they touch.

---

## Day 17–18 — Locking the doors (June 15–16)

Aether had been live and open for two weeks — anonymous localStorage identity, an anon Supabase key, no row-level security. Fine for a demo of one, dangerous the moment anyone else could reach it. So the same June 15 that closed out the routing-and-polish tail opened a concentrated **security-hardening sprint** — the first time the project's energy pointed inward at the machinery's soft spots rather than outward at new capability.

**Ownership first, then a database backstop under it.** `feat(backend): enforce session ownership on all mutating routes` added app-layer ownership checks scoped to the caller's `user_id` on every write — a leaked or guessed session id could no longer edit or delete someone else's conversation. `apiFetch` attaches an `X-User-Id` header from localStorage — deliberately *the single seam* to swap for a bearer token when Google auth eventually lands. Reads and fork stayed open by design, so shared `/c/:id` links keep working. Then `fix(backend): RLS backstop — lock sessions/messages to service-role` put the same guarantee at the database level: RLS on with no anon policy, the backend reconnecting with `SUPABASE_SERVICE_ROLE_KEY`. The commit spells out the rollout order in capitals, because getting it wrong locks the live app out — set the secret and deploy *first*, apply the SQL *second*. A day later, `harden Supabase: lock down anon access to RPCs and app_state` swept up the now-dead anon surface: pinned `search_path` on the SECURITY DEFINER functions, revoked EXECUTE from public/anon, and demoted `app_state` to SELECT-only — applied to prod via Supabase MCP, advisors re-run clean.

**A route regression had already taken prod down once, quietly.** The `/api/health` route got dropped while adding the caller-id helper; it passed `tsc` and every unit test — because none of them boot the app — and only surfaced when Fly's health check 404'd in production. The fix was structural, not just a re-add: `src/smoke.test.ts` boots the app via `server.fetch` and asserts the `fly.toml` health path returns 200 and core routes aren't unrouted 404s, and `bun run deploy` now runs `verify` (tsc + tests) before `fly deploy`, so a missing route blocks the push instead of breaking prod. A follow-up made the smoke test hermetic (probe only the pure `/api/health`, not the I/O-heavy `/full`) and added `ownership.test.ts` — mocked-db route-auth tests that immediately caught a real gap: `repair-prompts` only checked ownership on its write path, so a foreign caller could read another user's widget snapshot.

**The rest of the sprint was the same instinct applied broadly.** `perf(backend): ETag/304 on conversation read endpoints` stopped tab-refocus refetches from re-downloading full snapshots every time — the main egress driver — by revalidating with `If-None-Match` and returning empty 304s when nothing changed. `perf+fix: reuse Anthropic client` folded the per-call `new Anthropic()` in `generateTitle`/`planTurn` into one lazily-built, key-memoized client, and in the same commit added a guard so one malformed SSE line is skipped rather than killing the turn, plus `safeHref()` so a model-supplied `javascript:`/`data:` URL can't smuggle script into a click. `ci: gate Vercel production deploy on green tests` made a passing suite the *sole* path to prod — Vercel's own git auto-deploy disconnected, a `deploy` job shipping only after frontend, backend, and e2e all pass.

Two features rode alongside the hardening. `Add per-turn timestamps and delete to the chat transcript` carried `created_at` through to the frontend (it was in the DB, dropped on load), stamped live turns client-side, and added a hover trash control backed by the new `DELETE /api/sessions/:id/messages` — with a `persisted` SSE event so placeholder ids become real DB ids and a same-session delete hits the right rows without a reload. And a small one that reads as pure product sense: `make the sidebar wordmark a "new conversation" button` — the centered wordmark was decoration; now it starts a fresh conversation.

---

## Day 19 — The blank page invites you in (June 17)

A conversational app lives or dies on its empty state, and Aether's was a hero and a lonely input. `Add starter prompts to the blank page` gave it a way in: a 50-prompt pool sampled down to five random pills per mount, each one kicking off that conversation through the existing `sendMessage` path, staggering in with a fade and the brand pink→cyan gradient on hover (reduced-motion respected). The empty state was reworked into a single flex column — hero up top, pills in the gap, input pulled into the upper-middle by a trailing spacer instead of the old absolutely-floated hack. The same commit unclipped the capability-column toolbar (a fixed height was hiding the chip row's wrapped second line) and floored the column at 260px so it couldn't be dragged too narrow.

That starter-prompts commit also produced one of the more characteristic bugs of the project: the Fisher–Yates shuffle used tuple destructuring, which under `noUncheckedIndexedAccess` assigns `T | undefined` back into `T` slots, so `tsc -b` in CI rejected it and broke the Playwright build — fixed with `fix(starter-prompts): three-step swap to satisfy tsc -b`. The rest of the day was lighter-weight: skeletons and empty-message states, a `flip sun and moon` on the theme toggle, the `MIT license`, and `fix(frontend): repair mobile e2e + harden landscape safe-area` — a `short:` viewport variant that compresses the hero so the composer stays above the fold on a landscape phone, plus `viewport-fit=cover` and left/right safe-area insets so the notch is cleared. 43 e2e passed, 0 failed.

---

## Day 20–21 — Naming the seams (June 18–19)

If June 15 pointed at the machinery's soft spots, June 18 went at its *shape*. This is the refactor day — a run of commits, each executing a numbered plan, that paid down the structural debt two providers and a dozen render tools had accreted. The remarkable thing is that every one of them changed how the code was organized and *nothing about how it behaved*, and there was a test suite standing by to prove it.

**The unification was staged, characterization-tests first.** `test(backend): characterize the agent loop before unifying it (plan 005)` pinned the text/tool/iteration-cap/max-tokens-salvage behavior of both the Claude and OpenAI-compat clients — via a test-only SDK-injection seam immune to Bun's mock-ordering — *before* touching the loops. Then `refactor(backend): unify the agent loop behind a WireAdapter seam (plan 006)` collapsed two near-identical ~300-line loops into one `runAgentLoop()`: a thin per-provider `WireAdapter` normalizes each SDK's stream into a small `LoopEvent` union, and the shared loop owns the iteration cap, token accounting, the 120ms `tool_partial` throttle, salvage, and self-correction — with no provider branch anywhere. The 005 tests passed unchanged, which was the whole point.

The rest of the day extracted the seams the loop touches. `refactor: extract the FE↔BE wire contract into shared/contract/ (plan 001)` moved the SSE event union, the render-tool specs, and the composition plan into one place both packages import via `@contract/*` — scoped precisely to the shapes that cross the wire (Session stays two views of one DB row; the frontend's d3 types stay frontend-only). And a single commit knocked out four more plans: `createSseEmitter` typed against the contract's `SseEvent` union replacing twelve hand-rolled `writeSSE` calls (002), one `TOOL_REGISTRY` folding the execute switch and the streamable-render set together (003), a `StreamCallbacks` struct replacing nine positional args (004), and a root-level `bun run verify` (007). Backend 105/0, frontend 224 units green.

**And then, fittingly, the architecture documented itself.** `feat(docs): auto-generated draw.io architecture diagram + generator tool` added `tools/architecture-diagram/` — a `scan.ts` that builds a deterministic, token-free source digest and a `build.ts` that has Claude generate (first run) or *incrementally edit* (later runs) a four-page draw.io diagram, rendered to SVG and embedded in the README and ARCHITECTURE.md. The loop-unification and contract-extraction commits both end by regenerating it. The docs-as-you-go ethos, finally made mechanical.

Two things landed outside the refactor. `Fix Bigsail drag/resize (user is king while reading)` codified a principle that recurs from here on: packing is for the *system* while *streaming*; the user is *king* while *reading*. GridStack goes `float:true` (no gravity), and a "settled" placement mode honors saved positions verbatim so a manually-moved or resized card never gets reflowed out from under you — 44/44 Bigsail tests. And on June 19, `deliver auto-title over SSE so the sidebar title updates without reload` killed a guaranteed race: the first-turn Haiku title was generated *after* `[DONE]`, but the only title refresh fired *on* `[DONE]`, so the raw prompt stuck as the sidebar title forever. A new `titled` event now generates the title before `[DONE]` and patches it straight into the react-query cache.

---

## Day 24–27 — Correctness from real use (June 22–25)

A week of the sharpest kind of fix: the ones you only find by running the thing hard.

**The open chat proxy needed a spend backstop.** `Rate-limit /api/chat per-IP and stop leaking raw errors` added a per-IP hourly cap reusing the `app_state` shared-counter scheme — and, deliberately, *fails open* so a counter outage can't lock out real users; it's a budget backstop, not a correctness gate. The same commit stopped returning raw `err.message` to the client. But heavy testing then revealed the backstop biting the wrong hand: a 429 returns *before* the model runs, so `onDone` never fires and the session never gets auto-titled — stuck on "New conversation." `chore(backend): raise per-IP chat cap to effectively-unlimited` bumped it to `CHAT_HOURLY_BUDGET = 100_000` (from the old 60/hr), still fail-open, still enough to catch a runaway script.

**Two Bigsail correctness fixes, both from watching real layouts.** `discard stale-versioned tilesLayout on load` caught old saved layouts (from when full-width was `w:8`, not today's `w:24`) rendering as third-width cards squished at `x:0` — System 2 honors saved slots verbatim, so a schema mismatch now drops the layout and lets System 1 rebuild fresh, like a Reset, no content lost. And `stop resize white-screen at the stack breakpoint` chased a genuinely nasty loop: the stacked layout is taller, so toggling it added a scrollbar whose ~15px gutter shifted the measured width back across the 560px threshold, flipping `stacked`, relaying out, re-firing the ResizeObserver — blowing React's update limit and whiting out the page on resize. Fixed with a 24px hysteresis dead-band so a scrollbar-width jitter can't ping-pong the threshold. A companion behavioral decision, `wait until user moves a widget, to move to layout system 2`, made the handoff explicit: until a *real* user move, it's always the auto-packing template.

**The conversation icons were quietly broken most of the time.** `Make conversation icons reliable, expand icon vocabulary, tint title icon pink` found that `generateTitle` asked Haiku for the icon as free-text JSON, which it simply omitted most of the time — and unlike the title, the icon had no fallback, so most sessions showed the bare lotus glyph. Switching to a forced `tool_use` with both fields required fixed it, plus a guard dropping any off-vocabulary name (Haiku kept inventing Cat/Tv/Balloon) and an expansion of the shared vocabulary from 245 to 318 names, kept 1:1 between backend and frontend so graph and timeline entity icons got richer too. Alongside it, `Show generic "Chosen LLM" on the agent-loop diagram` stopped injecting the live model name into the diagram, and `fix session title timing` (June 28) tidied the last of the naming races. The `understand-everything` and `graphify` tool installs this week were housekeeping, not product.

---

## Day 33 — A design system you can see (July 1)

The design tokens, widget shells, and shared primitives had accreted into a real system, but it only existed as CSS and convention — nothing you could *point at*. `Add a live style-guide page and docs/DESIGN_SYSTEM.md` fixed that: a `/style-guide` route reusing the existing `AdminPage` shell to render real tokens, skeletons, and primitives pulled from the running app, not a mock. Later in the day `style-guide: derive color tokens from index.css` closed the loop that would otherwise rot — `parseTokens.ts` reads `@theme`/`:root`/`.dark` straight from `index.css?raw` so there's no hand-mirrored token list, groups swatches into ramp-ordered family rows with per-theme hex, and makes the intentional `accent = neon-pink` alias visible; a test parses the frontend icon map from source and kebab-compares it against the backend to keep the shared vocabulary honest.

**The sidebar stopped disappearing.** `Add persistent sidebar rail` replaced the floating "Open sidebar" button with a slim always-visible icon rail (`CollapsedSidebar`) carrying the wordmark, expand toggle, and new-conversation button; a follow-up moved the expand/collapse and theme toggles into a pinned footer so they sit at the true bottom of the screen. The same rail commit also fixed a subtle GridStack bug: dragging a node inside the Knowledge Graph widget dragged the *whole* Bigsail panel, because GridStack computes its drag-handle scan at `addWidget()` time — before React portals the real `.bigsail-card-drag` strip in — so it fell back to treating the whole card as the handle. `TilesCanvas` now forces a re-scan once each item's content has mounted, with a `bigsail-kg-drag.spec.ts` regression test to hold it. And `Add shared IconButton component` extracted the icon-button pattern repeated across Bigsail card chrome and the Help/Theme toggles into one `shell/IconButton.tsx` with chrome/nav variants, documented on the style-guide page and in DESIGN_SYSTEM.md — the CLAUDE.md docs-currency rule extended to cover shared UI primitives going forward.

---

## Day 39 — Editorial voice and an honest transcript (July 7)

The final chapter is three commits, and together they're about the *answer itself* — how it reads, whether it renders at all, and what actually belongs in the transcript. After weeks of building the machinery that produces answers, this is the day the answers got their craft.

**First, make sure every planned panel actually gets drawn.** `render every planned panel, honor the picked model, fix sidebar hover` chased a failure mode where the agent loop stopped *right before* rendering: `MAX_ITERATIONS=6` was too tight for a 2–8 widget plan with per-widget fetch-then-render rounds, so it hit the tool-stripped final iteration exactly when it wanted to draw, narrated "let me render all the panels," and stopped with an empty canvas. The default went to 10, and — the real fix — a **render-nudge backstop** in `llm.ts`: a planned turn that ends on text with no render call gets one re-prompt to actually call the render tools, driven by three new tests (narrate→nudge→render; no-plan→no-nudge; empty-text→no-nudge). The same commit fixed a model-switch bug where a pick made on a brand-new conversation (no row yet) lived only in localStorage, so the row got created with `model=null` and silently reverted to Sonnet, and a light-mode sidebar hover that erased the active row's selection.

**Second, give the prose an editorial voice.** `editorial prose composition for chat answers` replaced the flat wall-of-text markdown renderer with `ProseMarkdown`, a real typographic system: substantial answers get a drop-cap standfirst lead, Space-Grotesk headings with lotus dividers, pull-quotes and figures (the *article* variant); short replies stay *compact*. It ships a remark-directive art-direction palette Claude uses with restraint — `:::lead`, `:::aside`, `:::callout`, `:::pullquote`, `::stat`, `:accent` — taught in the system prompt, with unknown or malformed directives degrading cleanly to plain text so technical prose never leaks stray colons. Crucially it's **additive and non-destructive**: messages stay raw markdown, so every past conversation is retroactively upgraded on render. A live specimen went onto the style guide.

**Third — and this is the subtle one — separate the narration from the answer.** The model thinks out loud across loop iterations ("Let me pull the revenue figures…") before its data-fetch tools, and writes the real answer only in the iteration that renders. All of that text streams live, because watching it think is part of the experience — but only the *answer* belongs in the saved transcript. `separate narration from actual content` does this deterministically, by **tool type, not by guessing at wording**: an iteration whose tool calls are all data-fetch is staging; one that calls a render tool, or ends with no tools at all, is the answer. The backend classifies each segment as the loop runs (`onLoopStart` closes the previous one, `onToolStart` marks it render- or fetch-bearing) and persists only the answer, with `stripStagingChain` catching any lead-in the model wrote in the *same* message as its render calls. Legacy transcripts — with narration baked in from before this change — clean themselves lazily: `GET /messages` strips the staging chain on read and fire-and-forgets an `updateMessageContent` rewrite of any changed row, idempotently, so each conversation permanently tidies itself the next time it's opened. On the frontend, `ProseMarkdown`'s `splitPreamble` strips the whole leading staging chain so the drop cap lands on the first real paragraph, not on "let me…". The fallback line is now careful too: it only streams a placeholder if *nothing* streamed at all, so a turn that staged-but-never-answered still persists a clean reply without double-writing the pane.

Three commits, and the throughline is the same one that runs under the whole project: the answer is the product, and it should render every time, read like it was written on purpose, and leave nothing behind in the transcript that wasn't really the answer.

---

## Threads that run through the whole thing

- **One commit, one change, kept shippable.** The app works at every step; few if any commits leave
  it broken.
- **Docs as you go.** STACK.md updates ride with dependency changes; ROADMAP and KNOWN_ISSUES get
  refreshed when reality moves; some commits exist only to keep the docs honest.
- **Infrastructure and UI polish alternate.** A streaming backend and a send-button animation in
  adjacent commits; neither blocks the other.
- **The two seams paid off.** The capability registry (day 1) and the agent tool loop (day 3) were
  the early structural bets, and most later work plugged into one of them without a rewrite.
- **Ship, then harden.** Big features are followed by bug-fix and review-fix runs; the cleanup is
  part of the feature.
- **Correctness from real use.** The sharper fixes — graph node dedup, iteration caps, max-token
  salvage, self-healing canvas — came from watching it run, not from a spec.
- **Security as its own arc.** Once the app was live and open, a concentrated hardening pass
  followed the same one-change-per-commit rhythm as features: app-layer ownership *and* a database
  RLS backstop under it, service-role migration, per-IP spend rate-limiting (fail-open by design),
  ETag/304 egress control, `safeHref` sanitizing model-fed URLs, no raw-error leaks — each with tests.
- **Deploy safety became structural, not manual.** A dropped `/api/health` route took prod down
  through a gap unit tests can't see; the answer was a boot-the-app smoke test, a `bun run deploy`
  gate, and CI as the sole path to production — "ship, then harden" applied to the pipeline itself.
- **The seams got *unified*, not just extended.** After weeks of plugging into the capability
  registry and the agent loop, the June 18 refactors paid down their internal debt: two provider
  loops collapsed behind one `WireAdapter`, the FE↔BE wire contract extracted into `shared/contract/`
  — all guarded by characterization tests that proved behavior was preserved, and the architecture
  diagram made self-regenerating.
- **The user is king while reading; the system packs while streaming.** A layout principle that
  recurs across the Bigsail work — manual moves and resizes are never reflowed away; System 2 only
  takes over after a real user move.
