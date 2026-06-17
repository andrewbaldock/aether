# Roadmap

Aether is built incrementally — one focused change per commit, the app working at each step.
This is deliberately **loose**: the near-term foundation is settled; the later capability work
is intentionally open and will sharpen as the platform takes shape.

## What Aether is

A **platform**, not a single app — three pillars:

- **Conversation** — an AI agent; chat is the interface.
- **Open data** — live/real data sources the agent can pull from.
- **Visuals** — rich rendering (3dverse / 3D / whatever fits the answer).

Any specific experience (a chat-driven 3D scene builder, a live-data explorer, …) is a
*capability* that plugs into the platform — not the product itself. The platform is the
deliverable; experiences are how we prove and demo it.

## Phase 1 — Foundation (the infrastructure every experience needs)

| | Focus | Scope |
|---|-------|-------|
| ✅ | Monorepo skeleton + tooling | Layout, Biome, strict TS, `.env`, `.gitignore` |
| ✅ | The shell | Three-zone resizable layout: sidebar · chat body · capability column (tabbed, fullscreen-capable, AI- or user-controlled). The capability-registry seam. |
| ✅ | Backend + LLM | Hono, the LLM connector, streaming SSE, markdown rendering |
| ✅ | Agent loop + tools | Tool-use loop; `get_current_datetime` as the first real tool |
| ✅ | Persistence | Supabase (sessions + messages tables), anonymous localStorage identity, session history in sidebar, save-on-done |

After Phase 1: a working full-stack conversational platform with tool use, persistence, and the
capability column ready to host experiences.

## Phase 2 — Capabilities (open, in flux)

The first experiences that plug into the platform. Leading direction: a **chat-driven 3D scene
builder on 3dverse** — talk, and a 3D world assembles itself; ideally a *living* scene that open
data animates. This is the home for a dedicated 3D render tool/capability (e.g. `render_3d`). The
exact first experience and the ones after it are **not locked** — the platform is designed so each
is a plugin, added one at a time, swapped freely.

> This phase is intentionally underspecified. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the
> platform seams that make capabilities pluggable.

| | Focus | Scope |
|---|-------|-------|
| ✅ | Health dashboard | System Health widget checks all plumbing on demand: Supabase + each LLM provider key. Linked from Welcome tab. Works in dev and prod. |
| ✅ | Render-tool widgets | `render_table`, `render_chart`, `render_timeline`, `render_images` — each a self-contained spec echoed from a tool call, rendered by a registered widget. `build_knowledge_graph` too. (Canvas-ready: spec lives in `state`.) |
| ✅ | Open-data tools | Keyless live sources the agent can pull from: `wikidata_query` (SPARQL) + `wikidata_search`, `world_bank` (indicator time series), `wikipedia_summary`, `openalex_search` (papers), `search_images`, and Anthropic native `web_search` (Claude-gated). |
| ✅ | Strongification (planner) | Router/classifier gate → conditional planner emitting an abstract `plan` SSE event (no coordinates) → in-loop self-correction. Planner lives in the agent layer, knows nothing about any surface. |
| ✅ | Tiles (Bigsail) canvas | GridStack grid where every render-tool spec becomes a live, draggable/resizable card. **Default landing surface** ("home base"); per-conversation layout persisted in `ui_state.tilesLayout` (follows across devices). New cards auto-place. |
| ✅ | Mobile shell | Single-breakpoint (`md`) responsive `MobileShell`: off-canvas sidebar drawer, view-switched panels, full-screen capability overlay, 44px touch targets. Desktop path untouched. (Not yet device-simulator user-tested — see Known Issues.) |
| ✅ | Multi-provider LLM | `models.ts` carries a `provider` tag; `createClient()` routes per model. Claude + Google/DeepSeek/Mistral via one OpenAI-compat client. Radix model picker. Always defaults to Sonnet. |

## Backlog

Improvements that don't fit an active phase but are earmarked for later:

- **Mobile device-simulator pass** — drive every feature by hand on the iOS/iPadOS Simulator + Android emulator (chat, drawer, each widget, Tiles drag/resize, KG pan/zoom, model picker, settings) across iPhone/iPad/Pixel, portrait + landscape. The Playwright matrix and `MobileShell` exist; this is the human verification they can't replace. Shared task (Andrew + Claude).
- **PWA** — add a web app manifest + service worker so Aether is installable on desktop and mobile (home-screen icon, offline shell, full-screen launch). Vite plugin: `vite-plugin-pwa`.
- ~~**End-to-end browser tests**~~ ✅ **Shipped.** Playwright lives in `frontend/e2e/` (`bun run test:e2e`), mocking `/api` at the network layer (canned SSE — no backend, no tokens) across a 7-project viewport matrix (desktop + iPhone/iPad/Pixel × portrait/landscape). Specs: smoke (every viewport), chat-flow (send + stop), render-tool round trip, mobile-layout (drawer/canvas/orientation/touch-targets), sidebar rename + delete on mobile. CI (`.github/workflows/ci.yml`) runs frontend-unit + backend-unit + e2e on every PR. The same matrix + mock also power a dev-only `/screenshots` device contact sheet. *Remaining nice-to-haves: "explore further" tap, resize-handle drag.*
- **`web_search` — polish/verify (mostly shipped)** — the Anthropic native server-side search tool is already defined, Claude-gated in `buildTools()`, and handled in the agent loop (`server_tool_use` / `web_search_tool_result`). Remaining: confirm it's reachable end-to-end, surface results nicely, and decide the deferred Tavily/Brave fallback for non-Claude providers.
- ~~**Shared menu/select primitive**~~ ✅ **Shipped.** `@radix-ui/react-dropdown-menu` backs the "Explore further" kebab (table/chart/images/timeline) AND the sidebar conversation kebab; `@radix-ui/react-select` backs the model picker. The KnowledgeGraph ForceGraph node menu — canvas-anchored + drag-aware, so it keeps its own phantom Radix trigger — now renders the shared `MenuItems` panel (extracted from `ExploreMenu`), so every menu in the app shares one look and behavior.
- ~~**Unified Canvas (project "bigsail")**~~ ✅ **Shipped as Tiles.** GridStack grid of live, draggable/resizable cards mirroring every render-tool spec; default landing surface, per-conversation layout persisted in `ui_state.tilesLayout`. *Future surfaces (parked): zoom/pan and a node-graph "web of ideas" flowchart mode — `Bigsail/layout.ts` is kept dormant for these. If Tiles proves out, the per-capability tab widgets get retired in favor of it.*
- **Test coverage report** — generate a code-coverage report from the existing test suites (vitest frontend, `bun test` backend) and surface it visibly: a coverage badge in the README and/or an HTML report published from CI (e.g. Codecov or a GitHub Pages / artifact upload) so the percentage shows on GitHub.
- **Google accounts / sign-in** — Google OAuth sign-in; on signup, sends a beautiful welcome email.
- **Owner Dashboard** — a protected, single-owner ops panel at `/dashboard` (not a multi-user feature): recent activity, usage stats, health, and quick links in one view. Net-new work is the **logging pipeline** — a new `api_logs` Supabase table (capability, model, in/out tokens, `duration_ms`, status, error, `user_id`) written by a **fire-and-forget Hono middleware** on every request, surfaced via a new `GET /api/logs` (recent rows + aggregates) and rendered as an Activity Feed + Usage Stats (recharts). **Reuses, doesn't rebuild:** the health panel embeds the existing System Health widget / `/api/health/full`; Quick Links is a static list. Owner-gated via Supabase auth — folds into the **Google accounts / sign-in** item above (don't build the auth gate twice). Token counts stand in for Anthropic billing in v1. Out of scope v1: GA, multi-user, email alerts, exportable reports.
- **Dev-only traffic/activity dashboard** — a lightweight in-app page (e.g. `/traffic` or `/activity`) Andrew can glance at to see Aether's traffic: an activity log of recent requests plus simple analytics (counts/trends by capability, model, status, latency). **Gated exactly like the `/screenshots` contact sheet — present in dev builds, absent in prod** (so no auth gate to build). This is the cheaper first cut of the **Owner Dashboard** above: it can share that item's `api_logs` table + `GET /api/logs` logging pipeline (build the pipeline once, surface it dev-only first), then graduate to the prod owner-gated panel once Google sign-in lands. Two flavors to decide between: (a) homegrown activity log from our own `api_logs` data — fully self-contained, works offline/dev; or (b) drop in Google Analytics / a privacy-light analytics snippet for real pageview traffic. Lean (a) first (no external dep, matches the keyless ethos); (b) optional later for true visitor analytics. *Requested by Andrew 2026-06-17.*
- ~~**Per-tool reload**~~ ✅ **Shipped.** Each populated render-tool widget (Chart/Table/Timeline/Images/KnowledgeGraph) has a `WidgetReloadHeader` refresh button that clears its content and rebuilds fresh from the conversation. Reloads (and Images' "Get more") route through `useQueuedExplore` — clicking mid-turn queues the action (coalesce, latest-wins) and fires it when the turn settles, instead of greying out.

## Tool ideas (brainstorm)

Candidate new capabilities. Each is one `render_*` / data tool + (where visual) a widget that drops onto Tiles with zero renderer changes. Ranked roughly by **wow-per-effort** given the existing seams. None committed yet.

**High wow, low effort (reuse what's built):**

- **`render_map`** — MapLibre GL (free, no token). Anything with lat/long: World Bank data by country, Wikidata `P625` coordinates, image geotags. Already half-specced in the backlog; the keyless data tools make it data-rich on day one. Heaviest bundle of the set, so lazy-load it.
- **`render_diagram` (Mermaid)** — Claude is *excellent* at Mermaid. Flowcharts, sequence diagrams, ER diagrams, gantt, mindmaps from a single string. Tiny dep, huge expressive range, validates the "explain a system" use case. (We already have a Mermaid validate/render MCP available to lean on.)
- **`render_math` / `render_code`** — KaTeX for formulas, Shiki/Prism for syntax-highlighted code blocks as first-class cards. Cheap, and makes Aether credible for technical/educational answers.
- **`render_comparison`** — a structured "X vs Y vs Z" matrix card (rows = attributes, columns = options) the agent fills from Wikidata/web_search. Decision-support framing demos extremely well.

**High wow, medium effort:**

- **3D scene (`render_3d` on 3dverse)** — the original North Star: talk → a 3D world assembles from an asset kit. The single biggest differentiator and the reason 3dverse is in the stack. Bound the risk with a fixed low-poly kit (Kenney/Quaternius) and agent tools = place/move/color/scale/environment.
- **`render_globe`** — a 3D globe (react-globe.gl / three) plotting points + arcs: flights, trade flows, earthquake feeds, satellite positions. Spectacular hero visual; pairs with live open data.
- **Live data feeds** — keyless real-time sources to push the "open data" pillar: USGS earthquakes, Open-Meteo weather, ISS position, GBIF species occurrences. Each is a thin data tool that feeds map/globe/chart/timeline.
- **`render_audio` / sonification** — Tone.js or the Web Audio API turning a data series into sound, or fetching/visualizing audio. Unexpected, memorable, genuinely novel for a chat app.

**Bigger bets (own milestones):**

- **Agentic file/image generation** — Claude composes an SVG/diagram/poster the user can download; or upload an image and ask about it (vision).
- **Spreadsheet / live table** — editable TanStack-Table card the agent and user co-edit; small step from the existing `render_table`.
- **Collaboration tools** — once shared conversations land, presence cursors + co-editing on the Tiles canvas (the true Miro endgame).
- **Connectors** — let the agent reach the user's own data (Google Drive/Sheets, Calendar) behind sign-in. Powerful, but gated on OAuth + careful scope/consent.
