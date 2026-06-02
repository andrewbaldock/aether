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
data animates. The exact first experience and the ones after it are **not locked** — the platform
is designed so each is a plugin, added one at a time, swapped freely.

> This phase is intentionally underspecified. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the
> platform seams that make capabilities pluggable.
