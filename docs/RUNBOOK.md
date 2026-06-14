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

**Frontend:** Auto-deploys on push to `main` via **Vercel**.
- Config: `frontend/vercel.json`
- Proxy: `/api/*` → `https://aether-ab-api.fly.dev/api/:path*` (at the edge, no CORS issues)
- Env vars: set in Vercel dashboard, not in repo

**Backend:** Manual deploy to **Fly.io**.
```bash
# 1. ensure flyctl is on PATH (add to ~/.zshrc):
export PATH="$HOME/.fly/bin:$PATH"

# 2. from the backend directory:
cd ~/Code/aether/backend
fly deploy       # builds Docker image, pushes, rolling restart (~60s)

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

Fly.io hosts the Aether **backend API** as a Docker container. It handles compute, TLS, health checks, and auto-scaling (including scale-to-zero). Secrets (API keys) live here, never in the repo.

| | |
|---|---|
| Dashboard | https://fly.io/apps/aether-ab-api |
| App name | `aether-ab-api` |
| Region | `sjc` (San Jose) |
| Scaling | Scales to zero when idle; cold start ~5–10s |

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

Vercel hosts the Aether **frontend**. It auto-deploys on every push to `main`, serves the static React build, and proxies `/api/*` calls to Fly.io at the edge so the frontend never needs a hardcoded backend URL.

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

There is no migrations framework — schema is managed by hand in the Supabase
SQL editor. When the backend gains a column, run the matching SQL there.

**`sessions.graph_data`** (knowledge-graph persistence): stores the saved graph
snapshot `{ nodes, links }` per conversation so reopening/reloading restores the
graph the user built (and any drag-pinned node positions), rather than relying
on the model to re-emit it. Run once:
```sql
alter table sessions add column if not exists graph_data jsonb;
```

**`sessions.widget_data`** (table + chart persistence): stores the last
`render_table` and `render_chart` specs for a session so reopening a conversation
URL restores the table/chart widgets without needing a new turn. Run once:
```sql
alter table sessions add column if not exists widget_data jsonb;
```

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

Unit (frontend, from `frontend/`):
```bash
bun run test          # Vitest, watch mode
bun run test:run      # Vitest, single run (what CI runs)
```

Unit (backend, from `backend/`):
```bash
bun test              # bun:test
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
- **react-resizable-panels v4 gotcha** — `resize()` reads bare numbers as **pixels**, not percent. Always pass `"32%"` (string with unit).
- **Fly cold starts** — App scales to zero when idle; first request after idle takes 5–10s.
- **Service worker is off in dev, on in preview/prod** — `vite dev` never registers the SW (`devOptions.enabled: false`). To test PWA/offline behavior, `bun run build:app && bunx vite preview`. After a deploy, the SW updates in the background (`autoUpdate`); a hard-stuck old version usually clears with one reload, or DevTools → Application → Service Workers → Unregister.
- **ASO `.htaccess` is server-only** — it's not in `dist/` and not in the git repo. Don't try to deploy it; it's already on the server and should stay untouched.
