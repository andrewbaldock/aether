# Control Panel: Aether & Website

A single reference for dev, build, deploy, and management across both projects. Keep this open in a tab.

---

## Aether

**Repos & Live URLs**

| | |
|---|---|
| GitHub | `https://github.com/andrewbaldock/aether` |
| Frontend (live) | `https://aether.andrewbaldock.com` (Vercel) |
| Backend API | `https://aether-ab-api.fly.dev` |
| Health check | `GET https://aether-ab-api.fly.dev/api/health` |
| Full health dashboard | Open Aether → Welcome tab → "System health →" (or open the **System Health** tab directly) |

### First-time setup

Fresh machine or starting from a clone? → **[GETTING_STARTED.md](GETTING_STARTED.md)** walks
the whole thing: toolchain, accounts/keys (minimum vs. full set), DB migrations, run, verify.
This RUNBOOK assumes you're already set up.

### Dev

| Location | Command | Port |
|---|---|---|
| `frontend/` | `bun dev` | 5174 |
| `backend/` | `bun run dev` | 8000 |

Both run concurrently in separate terminals. The frontend's Vite dev server proxies
`/api` → `http://localhost:8000` (`frontend/vite.config.ts`), so the backend must be
on 8000 in dev. Override with `PORT` only if you also update the proxy target.

### Build & Typecheck

**Frontend:**
```bash
bun run build        # runs: vitest run && tsc -b && vite build  (the real build — run before push)
bun run build:app    # runs: tsc -b && vite build  (skips vitest; used by the E2E preview server)
bun run typecheck    # runs: tsc -b --noEmit
```

`build` runs the tests first, so a failing test blocks the build. `build:app` is the same
build *without* the vitest step — Playwright's `webServer` uses it so booting the preview for
E2E doesn't re-run the unit suite (that's a separate CI job). Use `build` for a real ship.

⚠️ **Always run `bun run build` before push.** The `typecheck` and `build` commands use different TS configs; a green typecheck can still fail the build.

**Backend:**
```bash
bun run typecheck    # runs: tsc --noEmit
```

No build step — Bun runs TypeScript directly.

### Deploy

**Frontend:** Ships to **Vercel via CI**, not Vercel's own git integration.
A push to `main` runs the three test jobs (see [Test → CI](#ci)); the gated `deploy`
job then builds with `vercel build --prod` and ships **prebuilt**. Vercel's native
git auto-deploy is **disconnected**, so CI is the only path to prod — a red test job
means no deploy.
- Config: `frontend/vercel.json`
- Proxy: `/api/*` → `https://aether-ab-api.fly.dev/api/:path*` (at the edge, no CORS issues)
- Env vars: set in Vercel dashboard, not in repo

**Backend:** Manual deploy to **Fly.io**.
```bash
# 1. ensure flyctl is on PATH (add to ~/.zshrc):
export PATH="$HOME/.fly/bin:$PATH"

# 2. from the backend directory:
cd ~/Code/aether/backend
bun run deploy   # typecheck + tests (incl. smoke), THEN fly deploy if green

# `bun run deploy` runs `verify` (tsc + bun test) first and only shells out to
# `fly deploy` if it passes. The smoke test (src/smoke.test.ts) boots the app and
# asserts the fly.toml health-check route returns 200 — a missing/renamed route
# (which unit tests can't see) fails here instead of taking prod down on deploy.
# Use bare `fly deploy` only to ship an image you've already verified.

# 3. verify health check after deploy completes
curl https://aether-ab-api.fly.dev/api/health
```

### PWA / Service Worker

Aether is an installable PWA — it can be added to the home screen / dock and launches
standalone (no browser chrome). Wired via **`vite-plugin-pwa`** (config in `frontend/vite.config.ts`).

**How it works:**
- `registerType: "autoUpdate"` — the service worker updates **silently in the background** and
  takes over on the next load. There is no "new version available" prompt to maintain; visitors
  always converge on the latest deploy after one extra reload.
- The build emits `dist/sw.js` + `dist/workbox-*.js` (Workbox precache) and
  `dist/manifest.webmanifest`. The plugin auto-injects `<link rel="manifest">` and the SW
  registration script into `index.html` — no manual `<script>` to add.
- **`/api/*` is excluded** from the SPA navigation fallback (`workbox.navigateFallbackDenylist`),
  so API calls always hit the network and never get served the cached `index.html`.
- The SW is **disabled in `vite dev`** (`devOptions.enabled: false`) to avoid stale-cache
  surprises while iterating. To exercise the real SW locally, build + preview:
  ```bash
  bun run build:app
  bunx vite preview        # serves dist/ with the SW active
  ```

**Icons & manifest assets** live in `frontend/public/`:
- `icon-source.svg` — the build source (512px, the dark favicon glyph with safe-area padding).
- `pwa-192x192.png`, `pwa-512x512.png` — standard (`purpose: any`) icons.
- `maskable-512x512.png` — maskable icon (Android adaptive masks).
- `apple-touch-icon.png` (180px) — iOS home-screen icon.

**Regenerating icons** (after editing `icon-source.svg`) — uses macOS `sips`, no extra tooling:
```bash
cd ~/Code/aether/frontend/public
sips -s format png --resampleHeightWidth 192 192 icon-source.svg --out pwa-192x192.png
sips -s format png --resampleHeightWidth 512 512 icon-source.svg --out pwa-512x512.png
sips -s format png --resampleHeightWidth 512 512 icon-source.svg --out maskable-512x512.png
sips -s format png --resampleHeightWidth 180 180 icon-source.svg --out apple-touch-icon.png
```
The manifest `theme_color`/`background_color` are `#110d1a` (the near-black brand shell) and are
mirrored by the `theme-color` meta + iOS `apple-mobile-web-app-*` tags in `index.html`.

**Deploy:** nothing extra — the SW and manifest are static `dist/` assets that ride the normal
Vercel push. Worth an install test on a real device (Add to Home Screen on iOS Safari / Chrome
install prompt) after a deploy that touches the manifest or icons.

### Manage Fly.io

Fly.io hosts the Aether **backend API** as a Docker container. It handles compute, TLS, and health checks. Secrets (API keys) live here, never in the repo.

| | |
|---|---|
| Dashboard | https://fly.io/apps/aether-ab-api |
| App name | `aether-ab-api` |
| Region | `sjc` (San Jose) |
| Internal port | `8080` (`fly.toml` → `PORT=8080`; not 8000 — that's dev only) |
| Scaling | **One always-on machine** (`min_machines_running = 1`) — deliberately *not* scale-to-zero, because a chat request landing during a cold start got a 502 from the Fly proxy before the app booted. See `backend/fly.toml`. |

**Secrets** (never in repo — live on Fly). Set the LLM provider keys (see *Manage
LLM Providers* above) plus the Supabase keys here. Setting a secret triggers an
automatic rolling redeploy.
```bash
# set one or many at once (one redeploy); values are write-only after
fly secrets set ANTHROPIC_API_KEY="sk-ant-..." \
  GOOGLE_AI_API_KEY="AQ..." \
  DEEPSEEK_API_KEY="sk-..." \
  MISTRAL_API_KEY="..." \
  --app aether-ab-api

fly secrets list --app aether-ab-api   # names + digests only, never values
```

**Logs:**
```bash
fly logs --app aether-ab-api
```

**SSH into machine:**
```bash
fly ssh console --app aether-ab-api
```

### Manage Vercel

Vercel hosts the Aether **frontend**: it serves the static React build and proxies `/api/*` calls to Fly.io at the edge so the frontend never needs a hardcoded backend URL. Deploys come from the gated CI `deploy` job (push to `main`, after tests pass) — **not** Vercel's own git integration, which is disconnected. See [Deploy → Frontend](#deploy) and [Test → CI](#ci).

| | |
|---|---|
| Dashboard | https://vercel.com/andrewbaldocks-projects/aether |
| Project | `aether` |
| Config | `frontend/vercel.json` |
| Env vars | Set in Vercel dashboard |

### Manage Supabase

Supabase is the **database** (Postgres) and auth layer. Aether uses it to persist chat sessions and message history. You manage the schema, run SQL queries, and browse stored data from the dashboard. The backend connects to it via the env vars below.

| | |
|---|---|
| Dashboard | https://supabase.com/dashboard/project/ltjnrftafphaampgihdf |
| Project ref | `ltjnrftafphaampgihdf` |
| URL | `https://ltjnrftafphaampgihdf.supabase.co` |

**Env vars** (development: `backend/.env`; production: Fly secrets):
```
SUPABASE_URL=https://ltjnrftafphaampgihdf.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
```

#### Schema changes

There is no migrations framework — schema is managed by hand as numbered SQL files in
`backend/sql/`, applied in the Supabase SQL editor. On a fresh project, run every file in numeric
order (see [GETTING_STARTED.md](GETTING_STARTED.md#4-set-up-the-database-supabase-one-time)). When
the backend gains a column, add a new numbered file and run it.

Current files:

| File | Adds |
|------|------|
| `000_baseline.sql` | core `sessions` + `messages` tables |
| `001_app_state.sql` | `app_state` table + `increment_app_counter()` (e.g. Unsplash rate cap) |
| `002_session_image_data.sql` | `sessions.image_data` jsonb + `increment_session_unsplash_search()` |
| `003_session_ui_state.sql` | `sessions.ui_state` jsonb (active tab, Tiles layout) |
| `004_session_topic_icon.sql` | `sessions.topic_icon` text |

Two of those `sessions` columns hold the per-conversation render snapshots:
- **`sessions.graph_data`** — the saved knowledge-graph snapshot `{ nodes, links }` (incl.
  drag-pinned positions), so reopening restores the graph the user built instead of relying on the
  model to re-emit it.
- **`sessions.widget_data`** — the last `render_table` / `render_chart` (and the other render-tool)
  specs, so reopening a conversation URL restores the widgets without a new turn.

(Both ship as part of `000_baseline.sql`; the frontend stamps each blob with a `schemaVersion` and
discards stale shapes on load — see [ARCHITECTURE.md](ARCHITECTURE.md#persisted-json-schema-versioning-libschemaversionts).)

### Manage LLM Providers

Aether is **multi-provider**. The model picker routes each conversation to a
provider based on the chosen model (`backend/src/models.ts` tags every model with
its provider; `backend/src/llm.ts` picks the client). Claude uses the Anthropic
SDK; Google / DeepSeek / Mistral share one OpenAI-compatible client (the `openai`
SDK pointed at each provider's base URL). Keys are read **lazily** — a missing key
only fails a turn that actually uses that provider, so the app runs on Anthropic
alone.

| Provider | Models in picker | Get a key | Free tier | Notes |
|---|---|---|---|---|
| Anthropic | Sonnet 4.6 (default), Opus 4.8, Haiku 4.5 | https://console.anthropic.com | no | required to run |
| Google | Gemini 3.5 Flash, 3.1 Flash-Lite | https://aistudio.google.com/apikey | yes (1,500 req/day) | OpenAI-compat shim mislabels streamed tool calls as `finish_reason: "stop"` — handled in `llm.ts` |
| DeepSeek | DeepSeek V4 Flash | https://platform.deepseek.com/api_keys | trial credits, then ~cheap | needs a small balance (a `402 Insufficient Balance` = top up) |
| Mistral | Mistral Small | https://console.mistral.ai/api-keys | yes (Experiment plan, phone-verified) | "connector access scope" on key creation is irrelevant — pick the default |

**Env vars** (development: `backend/.env`; production: Fly secrets — see below):
```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AQ...
DEEPSEEK_API_KEY=sk-...
MISTRAL_API_KEY=...
```

Optional overrides: `ANTHROPIC_MODEL` (Claude fallback model), `ANTHROPIC_MAX_TOKENS`
and `LLM_MAX_TOKENS` (output budgets for Claude vs the OpenAI-compat providers).
See `backend/.env.example` for the annotated list.

**Excluded:** OpenAI (no free API tier) and Groq (not used).

### Lint & Format

Both frontend and backend use **Biome**:
```bash
bun run check         # check for issues
bun run check:fix     # auto-fix
```

### Test

Three runners, all wired into [CI](#ci): **vitest** (frontend unit), **bun:test**
(backend unit), and **Playwright** (e2e). Tests live in:
- `frontend/src/**/*.test.ts*` — frontend unit (vitest+jsdom)
- `backend/src/*.test.ts` — backend unit (bun:test, includes `smoke.test.ts`)
- `frontend/e2e/*.spec.ts` — e2e (Playwright, 7 viewport projects)

Unit (frontend, from `frontend/`):
```bash
bun run test          # Vitest, watch mode
bun run test:run      # Vitest, single run (what CI runs)
```
The frontend unit suite **also runs as the first step of `bun run build`** — a failing
test blocks the build (see [Build & Typecheck](#build--typecheck)).

Unit (backend, from `backend/`):
```bash
bun test              # bun:test
bun run verify        # typecheck + bun test (the gate `bun run deploy` runs first)
```

End-to-end (Playwright, from `frontend/`):
```bash
bun run test:e2e         # all 7 viewport projects; builds a preview server + mocks /api
bun run test:e2e:ui      # interactive UI mode against the preview build
bun run test:e2e:dev     # headless, against the running dev server (5174) — no build wait
bun run test:e2e:dev:ui  # UI mode, against the dev server — fastest way to watch a flow
```
- The plain `test:e2e` / `test:e2e:ui` **build their own preview server** (`build:app` +
  `vite preview` on 5174) — this is what CI runs and the most robust for a full run.
- The `:dev` variants set `E2E_BASE_URL=http://localhost:5174` so Playwright skips the
  build and drives your **already-running dev server**. Great for UI mode / watching one
  flow; under heavy parallel load the dev server can flake (it compiles live), so prefer
  the preview build for a clean full run. A local run gets 1 retry (CI gets 2) to absorb
  the odd load hiccup — the mock is deterministic, so a retry never hides a real bug.

⚠️ **UI mode requires `node` on PATH.** Playwright's `--ui` mode re-spawns itself under
`node`; with bun-only it dies silently and the window hangs on "Loading…". Node is
installed (Homebrew) — if a fresh machine hits this, `brew install node`.

E2E is fully self-contained: `/api` is mocked at the network layer with canned SSE
(`e2e/fixtures/mockApi.ts` + `e2e/fixtures/sse.ts`), so **no backend, no LLM tokens,
deterministic**. To prove it, stop the Hono dev server first — the tests still pass.
Run one project: `bun run test:e2e --project=iphone-15-portrait`.

**Adding a new SSE fixture / scenario:** the wire format is `data: <json>\n` per event,
terminated by `data: [DONE]\n` (the frontend's `parseSseChunk` only keeps `data:`-
prefixed lines). Add a builder in `e2e/fixtures/sse.ts` (mirror `tableTurn` — note the
tool name must be the real one, e.g. `render_table`, not `table`), expose it via a
`MockApi.streamX()` helper (NB: not `use*` — that prefix trips Biome's react-hooks
lint), then drive it from a spec. The 7-viewport matrix lives in `e2e/devices.ts` and is
shared by the test config and the screenshots script.

**Screenshots contact sheet (dev only):** with the dev servers running, open the
**Screenshots** admin tab (or `/screenshots`) and hit **Run now**, or from `frontend/`:
```bash
bun run screenshots   # captures all 7 viewports → public/screenshots-out/ (gitignored)
```
The tab and its `/api/screenshots/run` endpoint exist **only in dev** — absent from any
prod build.

**Smoke tests (two layers, both gate automatically):**
- **Backend** — `backend/src/smoke.test.ts` runs inside `bun test` / `bun run verify` /
  `bun run deploy`. It boots the app and asserts the `fly.toml` health-check route returns
  200, so a missing/renamed route fails here instead of taking prod down (see
  [Deploy → Backend](#deploy)).
- **Frontend** — `frontend/e2e/smoke.spec.ts` is the cheapest e2e gate: across all 7
  viewports it loads the app, checks the compose box renders, and asserts **no
  `console.error`** (filtering benign `/api` load-race noise).

### CI

`.github/workflows/ci.yml` runs on **every PR** and on **push to `main`**. Three test jobs
run in parallel; the deploy job is gated on all three.

| Job | Command | Notes |
|---|---|---|
| `frontend-unit` | `bun run test:run` | vitest (from `frontend/`) |
| `backend-unit`  | `bun test`        | bun:test, incl. `smoke.test.ts` (from `backend/`) |
| `e2e`           | `bun run test:e2e` | Playwright builds its own preview; caches browser binaries; uploads report + traces on failure (7-day retention) |
| `deploy`        | `vercel build --prod` → `vercel deploy --prebuilt` | **`needs` all three**; **push-to-`main` only**; this is the sole path to prod (see [Deploy → Frontend](#deploy)) |

- **Biome lint is NOT in CI.** Run `bun run check` locally; it does not gate.
- A red test job blocks the Vercel deploy — Vercel's own git auto-deploy is disconnected.

---

## Website

**Repo & Live URL**

| | |
|---|---|
| GitHub | `https://github.com/andrewbaldock/website` |
| Live | `https://andrewbaldock.com` |
| Hosting | A Small Orange (ASO) shared hosting |

### Dev

```bash
cd ~/Code/website
bun dev              # Vite dev server, port 5173
```

### Build & Preview

```bash
bun run build        # → dist/
bun run preview      # preview prod build at http://localhost:4173
```

### Resume PDF

Only needed when `src/resumeData.js` changes:

```bash
bun run resume:pdf   # renders via Playwright/Chromium, outputs public/resume.pdf
# Then commit the updated public/resume.pdf
```

⚠️ **Web pages omit email/phone** (privacy); the PDF includes both.

### Deploy — A Small Orange (SFTP / ForkLift)

```bash
cd ~/Code/website
bun run build        # generates dist/
bun run preview      # optional: sanity-check at http://localhost:4173
```

Then in **ForkLift**:
1. Connect to ASO SFTP (credentials in ForkLift favorites)
2. Upload **contents of `dist/`** into `public_html/`, overwriting:
   - `assets/` folder
   - `index.html`
   - `resume.pdf` (if it changed)

**Do NOT delete or touch `.htaccess`** on the server — it lives only in `public_html/` and handles the SPA deep-link fallback for `/resume` and `/aether`.

### Manage A Small Orange (ASO)

ASO is traditional **shared web hosting** — think cPanel-era hosting. It serves the website as static files over Apache. No CI/CD, no containers; you manually SFTP the built files up. The `.htaccess` file on the server is what makes React Router's client-side URLs work without 404ing on refresh.

| | |
|---|---|
| Control panel | https://my.asmallorange.com |
| SFTP | ForkLift (credentials in favorites) |
| Edit `.htaccess` | ForkLift → remote file editor (show hidden files) → `public_html/.htaccess` |

### Lint

```bash
bun run lint         # ESLint
```

---

## Traps & Notes

- **Prefer `bun`** — use `bun`/`bunx` for all package + script commands. `node` and `npm` ARE installed now (Homebrew, for Playwright UI mode — see below), but bun is the default for everything Aether.
- **Playwright UI mode needs `node`** — `test:e2e:ui` re-spawns itself under `node`; without node on PATH the window hangs forever on "Loading…" (no error). Node is installed; if a fresh machine hits this, `brew install node`. Headless `test:e2e` does NOT need node.
- **E2E full runs: use the built preview server, not the dev server** — `test:e2e` builds its own preview (robust). The `:dev` variants drive the live dev server, which can flake under full parallel load (it compiles on demand) — fine for watching one flow, not ideal for a clean full run.
- **Two Vite servers are normal** — Aether frontend on 5174, website on 5173. These run concurrently.
- **Aether build has two TS configs** — `tsc --noEmit` (typecheck) and `tsc -b && vite build` (build) use different settings. A green typecheck doesn't guarantee a successful build. Always run `bun run build` before pushing.
- **CI gates the Vercel deploy** — a red `frontend-unit` / `backend-unit` / `e2e` job blocks prod. Vercel's own git auto-deploy is off; the gated CI `deploy` job is the only path to production. (Biome lint is *not* in CI — run `bun run check` yourself.)
- **react-resizable-panels v4 gotcha** — `resize()` reads bare numbers as **pixels**, not percent. Always pass `"32%"` (string with unit).
- **Fly: one always-on machine, no scale-to-zero** — `min_machines_running = 1` in `fly.toml` keeps a machine warm so chat requests don't hit a cold-start 502. (It was previously scale-to-zero; the cold-start 502s are why that changed.)
- **Service worker is off in dev, on in preview/prod** — `vite dev` never registers the SW (`devOptions.enabled: false`). To test PWA/offline behavior, `bun run build:app && bunx vite preview`. After a deploy, the SW updates in the background (`autoUpdate`); a hard-stuck old version usually clears with one reload, or DevTools → Application → Service Workers → Unregister.
- **ASO `.htaccess` is server-only** — it's not in `dist/` and not in the git repo. Don't try to deploy it; it's already on the server and should stay untouched.
