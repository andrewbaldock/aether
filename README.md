# Aether

> Ask questions. Get answers as 3D scenes, graphs, and charts.

A conversational explorer. The chat is the interface; answers are rendered in whatever form fits
best — table, chart, relationship graph, or 3D scene.

**The principle:** every view is a question answered in its best form.

---

## Documentation

- **[docs/STACK.md](docs/STACK.md)** — every dependency, what it does, why it was chosen, and
  its version. Kept current with the actual stack.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the frontend and backend fit together,
  the two-runtime model, and the `/api` proxy wiring.

---

## Prerequisites

- **[bun](https://bun.sh)** ≥ 1.3 — the only thing you need installed. It runs the backend,
  installs packages, and runs the frontend dev server.

  ```bash
  curl -fsSL https://bun.sh/install | bash
  bun --version   # verify
  ```

That's it. No Node, no Docker, no global tooling.

---

## Setup

```bash
git clone <repo-url> aether
cd aether

# install both packages
cd backend  && bun install && cd ..
cd frontend && bun install && cd ..

# configure the backend environment
cp backend/.env.example backend/.env
# then add your ANTHROPIC_API_KEY to backend/.env
```

The backend reads `backend/.env` (bun auto-loads it). `ANTHROPIC_API_KEY` is **required** to run
the backend — see [backend/.env.example](backend/.env.example). The root
[.env.example](.env.example) lists everything the project will use as it grows. `.env` files are
gitignored — never commit real keys.

---

## Run

The app has two halves — run each in its own terminal.

```bash
# terminal 1 — backend (Hono, port 8000)
cd backend
bun run dev

# terminal 2 — frontend (Vite, port 5173)
cd frontend
bun dev
```

Then open **http://localhost:5173**. The frontend proxies `/api` requests to the backend on
`:8000` (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#frontend--backend-wiring-the-api-proxy)).

> **Note:** this project is built incrementally — see [docs/ROADMAP.md](docs/ROADMAP.md). The
> chat now does a real round-trip to Claude (no streaming yet); set `ANTHROPIC_API_KEY` first.

---

## Checks

Run inside **either** `backend/` or `frontend/`:

```bash
bun run check        # Biome lint + format check
bun run check:fix    # Biome — apply fixes
bun run typecheck    # TypeScript type check
```

Frontend only:

```bash
bun run build        # type-check (tsc -b) + production build
```

> `typecheck` and `build` resolve different TypeScript configs in the frontend — run `build`
> before deploying, not just `typecheck`.

---

## Project layout

```
aether/
├── frontend/   React 19 + TypeScript + Vite + Tailwind v4
├── backend/    Bun + Hono + Anthropic SDK + Supabase
├── docs/       stack + architecture docs (kept current)
├── .env.example
└── README.md
```

## Deploy

Vercel (frontend) · Fly.io (backend) — both free tiers. No Docker.

---

## Tech stack at a glance

| | |
|---|---|
| **Frontend** | React 19 · TypeScript (strict) · Vite · Tailwind v4 |
| **Backend** | Bun · Hono · Anthropic SDK · Supabase |
| **Tooling** | Biome (lint + format) · TypeScript |

Full details and rationale in **[docs/STACK.md](docs/STACK.md)**.
