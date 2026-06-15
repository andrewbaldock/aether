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
