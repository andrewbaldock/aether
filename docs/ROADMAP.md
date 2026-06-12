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

## Backlog

Improvements that don't fit an active phase but are earmarked for later:

- **PWA** — add a web app manifest + service worker so Aether is installable on desktop and mobile (home-screen icon, offline shell, full-screen launch). Vite plugin: `vite-plugin-pwa`.
- **`render_timeline`** — vis-timeline widget (backend tool def already written and commented out; just needs the frontend widget + `bun add vis-timeline vis-data`).
- **`web_search`** — Anthropic native server-side search tool, provider-gated to Claude, `max_uses`-capped. Deferred Tavily/Brave fallback for other providers.
- **Multi-provider model switcher polish** — Gemini/DeepSeek/Mistral are wired but the picker UI is a plain `<select>`; could become a richer grouped picker when it matters.
- **Unified Canvas (project "bigsail")** — Miro-style shared canvas where capability widgets become draggable cards. The render-tool widgets (table, chart, timeline, map) are deliberately built canvas-ready (self-contained spec from `state`); dropping them onto a canvas needs zero renderer changes. The toolbar rethink (see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)) lands here.
- **Google accounts / sign-in** — Google OAuth sign-in; on signup, sends a beautiful welcome email.
- **Stop button redesign** — the stop/cancel button is under-designed; needs a visual pass.
- **`render_map`** — MapLibre GL (free, no API token). Same render-tool pattern; deferred because MapLibre bundle weight is heavier than the others.
- **Owner Dashboard** — a protected, single-owner ops panel at `/dashboard` (not a multi-user feature): recent activity, usage stats, health, and quick links in one view. Net-new work is the **logging pipeline** — a new `api_logs` Supabase table (capability, model, in/out tokens, `duration_ms`, status, error, `user_id`) written by a **fire-and-forget Hono middleware** on every request, surfaced via a new `GET /api/logs` (recent rows + aggregates) and rendered as an Activity Feed + Usage Stats (recharts). **Reuses, doesn't rebuild:** the health panel embeds the existing System Health widget / `/api/health/full`; Quick Links is a static list. Owner-gated via Supabase auth — folds into the **Google accounts / sign-in** item above (don't build the auth gate twice). Token counts stand in for Anthropic billing in v1. Out of scope v1: GA, multi-user, email alerts, exportable reports.
- **Per-tool reload** — every render-tool widget needs a reload/refresh control to re-run its tool and rebuild from fresh data.
- **Show the active data source in "thinking" status** — while the agent is working, name the data source it's currently hitting (Wikidata, Wikipedia, World Bank, etc.) in the thinking/status line, not just a generic "working" message.
