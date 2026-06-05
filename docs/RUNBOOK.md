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

### Dev

| Location | Command | Port |
|---|---|---|
| `frontend/` | `bun dev` | 5174 |
| `backend/` | `bun run dev` | 8080 |

Both run concurrently in separate terminals.

### Build & Typecheck

**Frontend:**
```bash
bun run build        # runs: tsc -b && vite build
bun run typecheck    # runs: tsc -b --noEmit
```

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

### Manage Fly.io

Fly.io hosts the Aether **backend API** as a Docker container. It handles compute, TLS, health checks, and auto-scaling (including scale-to-zero). Secrets (API keys) live here, never in the repo.

| | |
|---|---|
| Dashboard | https://fly.io/apps/aether-ab-api |
| App name | `aether-ab-api` |
| Region | `sjc` (San Jose) |
| Scaling | Scales to zero when idle; cold start ~5–10s |

**Secrets** (never in repo — live on Fly):
```bash
fly secrets set ANTHROPIC_API_KEY="sk-ant-..." --app aether-ab-api
fly secrets list --app aether-ab-api
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

### Lint & Format

Both frontend and backend use **Biome**:
```bash
bun run check         # check for issues
bun run check:fix     # auto-fix
```

### Test

Frontend only:
```bash
bun run test          # Vitest
```

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

- **`bun` only** — `npm` and `node` not on PATH. Use `bun` or `bunx` for all commands.
- **Two Vite servers are normal** — Aether frontend on 5174, website on 5173. These run concurrently.
- **Aether build has two TS configs** — `tsc --noEmit` (typecheck) and `tsc -b && vite build` (build) use different settings. A green typecheck doesn't guarantee a successful build. Always run `bun run build` before pushing.
- **react-resizable-panels v4 gotcha** — `resize()` reads bare numbers as **pixels**, not percent. Always pass `"32%"` (string with unit).
- **Fly cold starts** — App scales to zero when idle; first request after idle takes 5–10s.
- **ASO `.htaccess` is server-only** — it's not in `dist/` and not in the git repo. Don't try to deploy it; it's already on the server and should stay untouched.
