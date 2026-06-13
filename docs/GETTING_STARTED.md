# Getting Started

From a clean clone (or a machine where you've forgotten everything) to a running Aether,
step by step. Nothing is assumed. For day-to-day commands once you're set up, see
[RUNBOOK.md](RUNBOOK.md); for *why* it's shaped this way, see [ARCHITECTURE.md](ARCHITECTURE.md).

Aether is two independent packages — a **backend** (Hono API on Bun) and a **frontend**
(React + Vite). There is no workspace root; you install and run each separately.

---

## 1. Toolchain

**[Bun](https://bun.sh) ≥ 1.3 is the only hard requirement.** It runs the backend, installs
packages, and runs the frontend dev server — it replaces Node, npm, and ts-node.

```bash
curl -fsSL https://bun.sh/install | bash
bun --version   # verify (expect 1.3.x or newer)
```

**Node is optional** — needed for exactly one thing: Playwright's interactive E2E UI
(`bun run test:e2e:ui`), which re-spawns itself under `node`. Everything else, including
headless E2E, runs on Bun alone. If you'll use the test UI:

```bash
brew install node
```

---

## 2. Install dependencies

The two packages are independent — install both:

```bash
git clone https://github.com/andrewbaldock/aether.git
cd aether

cd backend  && bun install && cd ..
cd frontend && bun install && cd ..
```

---

## 3. Accounts & keys

All secrets live in `backend/.env` — the frontend needs **no** env in dev (it proxies `/api`
to the backend). Bun auto-loads `backend/.env` when you run the server from `backend/`.

```bash
cd backend
cp .env.example .env
$EDITOR .env
```

### The minimum to run

Just **two accounts**, both with free tiers:

| Account | Keys in `.env` | Why it's required | Sign up |
|---------|----------------|-------------------|---------|
| **Anthropic** | `ANTHROPIC_API_KEY` | Claude is the default model — chat won't work without it | <https://console.anthropic.com> |
| **Supabase** | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Stores conversations + messages | <https://supabase.com> → Settings → API |

With just those two, the app fully runs: chat, all render tools (table/chart/timeline/graph),
and keyless image search via Wikimedia Commons. **You can stop here.**

### The full set (everything lit up)

Everything below is **optional** and read lazily — a key is only touched when a turn actually
uses that provider or tool, so an unset one never blocks startup. Add them to widen what's
available:

| Account | Key in `.env` | What it unlocks | Sign up |
|---------|---------------|-----------------|---------|
| **Google AI Studio** | `GOOGLE_AI_API_KEY` | Gemini models in the picker (free tier) | <https://aistudio.google.com/apikey> |
| **DeepSeek** | `DEEPSEEK_API_KEY` | DeepSeek models in the picker | <https://platform.deepseek.com/api_keys> |
| **Mistral** | `MISTRAL_API_KEY` | Mistral models in the picker (free Experiment plan) | <https://console.mistral.ai/api-keys> |
| **Unsplash** | `UNSPLASH_ACCESS_KEY` | Adds glossier Unsplash photos to image search (Wikimedia works without it) | <https://unsplash.com/developers> — copy the **Access Key** (public Client-ID, not the Secret) |

A model whose provider key is unset **still appears** in the picker but errors if you pick it.
Image search degrades gracefully to Wikimedia-only without the Unsplash key.

Plus a few non-account tuning vars (all have sane defaults): `ANTHROPIC_MODEL`,
`LLM_MAX_TOKENS`, `PORT`. See [backend/.env.example](../backend/.env.example) for the annotated
full list.

> **Deploy-time accounts** (not needed to run locally): **Fly.io** hosts the backend and
> **Vercel** hosts the frontend — see [RUNBOOK.md](RUNBOOK.md). You don't need either to
> develop; they only matter when shipping.

---

## 4. Set up the database (Supabase, one time)

Run the SQL migrations in `backend/sql/` against your Supabase project, in order, via the
Supabase dashboard **SQL Editor** (paste + run each):

```
backend/sql/001_app_state.sql          # app-wide counters (e.g. the Unsplash rate cap)
backend/sql/002_session_image_data.sql # per-session image widget storage
backend/sql/003_session_ui_state.sql   # per-session UI memory (active tab, tiles layout)
```

(The core `sessions` / `messages` tables are created by the earliest migration in that folder;
run every file in `backend/sql/` in numeric order on a fresh project.)

---

## 5. Run both halves

Two terminals — the frontend's Vite proxy forwards `/api` → `localhost:8000`, so the backend
**must** be on 8000 in dev.

```bash
# terminal 1 — backend (Hono, port 8000)
cd backend && bun run dev

# terminal 2 — frontend (Vite, port 5174)
cd frontend && bun dev
```

Open **<http://localhost:5174>**.

---

## 6. Verify it works

1. **Type a message and send it** — you should see the reply stream in token by token.
2. **Check the dependencies** — Welcome tab → "System health →" (or the **System Health**
   tab) → **Check now**. Every provider/data-source you configured should go green; unset
   keys show amber ("not configured"), which is fine.
3. **Run the checks** (from either package):
   ```bash
   bun run check       # Biome lint + format
   bun run typecheck   # TypeScript
   ```
   And a full frontend build (also runs the unit tests):
   ```bash
   cd frontend && bun run build
   ```

If the chat streams and System Health is green for your configured providers, you're up.

---

## What you need to *develop* (vs. just run)

Running Aether needs the accounts above. **Developing** on it needs a toolchain — almost all
of which `bun install` already pulled in. Nothing extra to install for the core loop:

| Tool | Purpose | How you get it |
|------|---------|----------------|
| **Bun** ≥ 1.3 | Runtime, package manager, test runner, TS runner | Installed in step 1 |
| **Biome** | Lint + format (both packages) | `bun install` (dev dep); run `bun run check` |
| **TypeScript** | Type checking | `bun install`; run `bun run typecheck` (and `bun run build` on the frontend — they use different TS configs) |
| **Vitest** + Testing Library + jsdom | Frontend unit/hook tests | `bun install`; run `bun run test:run` |
| **`bun test`** | Backend unit tests | Built into Bun; run from `backend/` |
| **Playwright** | End-to-end browser tests (7-viewport matrix, mocked `/api`) | `bun install` pulled the package; install browsers once: `cd frontend && bunx playwright install chromium webkit` |
| **Node** (optional) | *Only* for Playwright's interactive test UI (`bun run test:e2e:ui`) | `brew install node` |

That's the whole required dev toolchain. Editor-wise, any editor works; if you use VS Code,
the Biome extension gives you format-on-save matching the repo config (there's no committed
`.vscode/`).

For the full test command list and the testing strategy, see
[RUNBOOK.md](RUNBOOK.md#test) and [ARCHITECTURE.md](ARCHITECTURE.md#testing).

### Optional local conveniences

Not required — nice-to-haves for a smoother local setup (these are how the maintainer runs it):

- **Pretty dev hostnames via Caddy** — serve `https://aether-dev` instead of
  `localhost:5174` (Caddy as a local reverse proxy with `tls internal`). Needs a `/etc/hosts`
  entry + a `Caddyfile` block per host. Only matters if you want HTTPS locally (e.g. to test
  `crypto.randomUUID`, which needs a secure context).
- **A dev-server control panel** — the maintainer runs a SwiftBar menu-bar plugin to
  start/stop the three dev servers (frontend, backend, website) without juggling terminals.
  Entirely optional; two `bun run dev` terminals do the same job.

---

## Common first-run snags

- **`command not found: bun`** — Bun isn't on your PATH. Re-run the install line in step 1, or
  restart your terminal so the shell picks up `~/.bun/bin`.
- **Chat fails immediately / 500 from `/api/chat`** — `ANTHROPIC_API_KEY` missing or wrong in
  `backend/.env`, or the backend isn't running on 8000. Check terminal 1's logs.
- **Sidebar empty / can't save conversations** — Supabase not configured, or migrations not
  run. Check System Health → Supabase.
- **`bun dev` "works" but the page is blank at 127.0.0.1** — Vite sometimes binds IPv6-only;
  always open `http://localhost:5174`, not `http://127.0.0.1:5174`.
- **Playwright test UI hangs on "Loading…"** — `node` not installed (`brew install node`); the
  UI mode needs it. Headless `bun run test:e2e` doesn't.

More gotchas (deploys, providers, port mapping, Tailwind/Radix traps) live in
[RUNBOOK.md](RUNBOOK.md) under **Traps & Notes**.
