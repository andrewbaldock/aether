# Stack

Every dependency in Aether, what it does, and why it was chosen. **Keep this current:** when a
commit adds, removes, or upgrades a dependency, update this file in the same commit.

Last updated: Synced the dependency tables to the lockfile — added shipped deps that were missing (`openai` OpenAI-compat client, `@tanstack/react-table`, `recharts`, `gridstack`, `sonner`, `@radix-ui/react-alert-dialog`) and pruned the "planned" list of items already shipped under different names (recharts for plotly, d3 KG for cytoscape) or never adopted (custom `useRoute` instead of `@tanstack/react-router`).

---

## Runtime & tooling (machine-level)

| Tool | Version | What it is | Why |
|------|---------|-----------|-----|
| **bun** | 1.3.x | JS runtime + package manager + TS runner + test runner, in one binary | Runs TypeScript natively (no compile step for backend), installs deps, runs scripts. Replaces node + npm + ts-node + jest. Uses the standard npm registry, so nothing is bun-locked. |

bun is the dev-time engine: it installs packages, runs the backend, and runs Vite for the
frontend. The browser only runs the *compiled* frontend output — it can't run `.tsx`/`.ts`
source. See [ARCHITECTURE.md](./ARCHITECTURE.md#two-runtimes).

---

## Frontend (`frontend/`)

### Dependencies

| Package | Version | What it does | Why chosen |
|---------|---------|--------------|-----------|
| `react` / `react-dom` | ^19.2.6 | UI library | The view layer; the chat interface and all rendered answers (charts, graphs, 3D) are React components. |
| `@tanstack/react-query` | ^5.101.0 | Server-state / caching | The data layer for every non-streaming `/api` call. One `QueryClient` + `apiFetch` (`src/lib/queryClient.ts`); reads are queries, writes are mutations that invalidate `sessionsKey(userId)`. Retries ride out Fly cold-start 502s. Replaced a hand-rolled module-level cache. |
| `@tanstack/react-query-devtools` | ^5.101.0 | Query devtools panel | Inspect cache/query state in dev. Rendered headless via `QueryDevtoolsToggle`. |
| `@tanstack/react-table` | ^8.21.3 | Headless table | Powers the `render_table` widget — sorting/structure logic, app-styled markup. |
| `recharts` | ^3.8.1 | Charting | The `render_chart` widget (line/bar/area/etc. from a chart spec). |
| `gridstack` | ^12.6.0 | Draggable/resizable grid | The **Tiles** canvas (project "bigsail") — every render-tool spec becomes a live, draggable/resizable card on a 24-column grid. Default landing surface. |
| `sonner` | ^2.0.7 | Toasts | Subtle notifications — e.g. the schema-version "saved state was reset" toast. |
| `tailwindcss` | ^4.3.0 | Utility-first CSS | Styling via composable utility classes in markup — no per-component stylesheets, no leaking. v4 uses a Vite plugin (no PostCSS). |
| `react-markdown` | ^10.x | Markdown renderer | Renders assistant messages as rich text. Used with `remark-gfm` + `remark-directive` inside `ProseMarkdown.tsx`. |
| `remark-gfm` | ^4.x | GitHub Flavored Markdown plugin | Extends `react-markdown` with GFM syntax. |
| `remark-directive` | ^4.x | Markdown directive syntax (`:::name`, `::name`, `:name`) | Powers the editorial-prose art-direction palette (`:::pullquote`, `:::callout`, `:::aside`, `::stat`, `:accent`). A tiny local remark plugin in `ProseMarkdown.tsx` maps directive nodes to styled elements; unknown directives degrade to plain text. See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md#editorial-prose-the-chat-answer). |
| `react-resizable-panels` | ^4.11.2 | Resizable/collapsible panel groups | Powers the three-zone shell (sidebar / chat / capability column). **Unit trap — see [ARCHITECTURE.md](./ARCHITECTURE.md#the-shell--three-zone-layout).** |
| `d3-force` / `d3-selection` / `d3-zoom` | ^3.x | Force layout + SVG selection + pan/zoom | The knowledge-graph widget: force-directed node layout rendered to SVG with pan/zoom. |
| `lucide-react` | ^1.17.0 | Icon set | UI glyphs across the shell. |
| `@radix-ui/react-tooltip` | ^1.2.9 | Accessible tooltip primitive | Hover/focus tooltips with correct a11y + collision handling, instead of hand-rolling. |
| `@radix-ui/react-dropdown-menu` | ^2.1.17 | Accessible menu primitive | The shared "Explore further" kebab menu on table rows / chart series / image tiles / timeline events (`widgets/ContextMenu.tsx`). Replaced a right-click-only menu that was unreachable on touch; Radix gives a visible ⋮ trigger plus outside-click/Escape/focus-trap/collision-flip for free. |
| `@radix-ui/react-alert-dialog` | ^1.1.16 | Accessible confirm dialog | Destructive confirmations (e.g. delete-conversation), with focus trap + Escape for free. |
| `@radix-ui/react-select` | ^2.3.0 | Accessible select primitive | The chat-footer model picker (`shell/ModelPicker.tsx`). Replaced a native `<select>` + a cross-browser width-hugging hack: the custom trigger hugs its content, themes with app tokens, and shows each model's blurb (impossible in a native `<option>`). Keeps health-gating + Sonnet default. |
| `@supabase/supabase-js` | ^2.106.2 | Supabase client | Persistence — session + message history. |

### Dev dependencies

| Package | Version | What it does | Why chosen |
|---------|---------|--------------|-----------|
| `vite` | ^8.0.14 | Dev server + bundler | Compiles `.tsx`/Tailwind on the fly in dev, bundles for production. Fast HMR. Dev server pinned to **port 5174** (`frontend/vite.config.ts`) so it doesn't collide with the website project on 5173. |
| `@vitejs/plugin-react` | ^6.0.2 | React support for Vite | JSX transform + React Fast Refresh. |
| `@tailwindcss/vite` | ^4.3.0 | Tailwind v4 Vite plugin | The v4 way to wire Tailwind — replaces PostCSS + `tailwind.config.js`. Pairs with `@import "tailwindcss"` in `src/index.css`. |
| `@biomejs/biome` | ^2.4.16 | Linter + formatter | One fast tool for lint + format. v2.x: `biome check --write` applies fixes. |
| `typescript` | ^6.0.3 | Type checker | Strict mode (`verbatimModuleSyntax`, `noUncheckedIndexedAccess`). |
| `@types/react`, `@types/react-dom` | ^19.2.x | React type defs | Types for React 19. |
| `@types/node` | ^22.x | Node type defs | Required by `tsconfig.node.json` (which types `vite.config.ts` under Node libs). Without it `bun run build` fails. |
| `@types/d3-force`, `@types/d3-selection`, `@types/d3-zoom` | ^3.x | d3 type defs | Types for the knowledge-graph widget's d3 modules. |
| `vitest` | ^4.1.8 | Test runner | Unit/hook tests. Run with `bunx vitest run` (the `test` script is bare `vitest`, i.e. watch mode). Uses the `jsdom` environment. |
| `@testing-library/react` | ^16.3.2 | React testing utils | `renderHook`/`render` for hook + component tests. |
| `@testing-library/user-event` | ^14.6.1 | User-interaction simulation | Realistic event firing in tests. |
| `jsdom` | ^29.x | DOM in Node | The vitest `environment` so React renders without a browser. |
| `vite-plugin-pwa` | ^1.3.0 | PWA / service worker generator | Makes Aether an installable PWA. Generates the Workbox service worker (`dist/sw.js`) + web manifest from config in `vite.config.ts`, and auto-injects the manifest link + SW registration into `index.html`. `autoUpdate` mode — SW refreshes silently, no update prompt. SW is off in `vite dev`, on in `preview`/prod. See [RUNBOOK.md](./RUNBOOK.md#pwa--service-worker) and [MOBILE.md](./MOBILE.md). |
| `@playwright/test` | ^1.60 | E2E test runner | Browser-level tests in `frontend/e2e/` (`bun run test:e2e`). Mocks `/api` at the network layer (canned SSE) — no backend, no tokens, deterministic. Drives a 7-project viewport matrix (desktop + iPhone/iPad/Pixel × portrait/landscape; WebKit for Safari, Chromium for Chrome/Android). The same matrix + mock power the dev-only `/screenshots` contact sheet (`bun run screenshots`). Browsers installed via `bunx playwright install chromium webkit`. |
| `storybook` | 10.5.6 | Component explorer | The browsable design-system docs, published at **https://aether.andrewbaldock.com/storybook**. `bun run storybook` (port **6006**) for dev; `bun run build-storybook` → `storybook-static/` for a standalone build. Stories live beside their components as `*.stories.tsx`; the `Foundations/*` MDX pages are in `.storybook/docs/`. |
| `@storybook/react-vite` | 10.5.6 | Storybook framework | Reuses the app's own `vite.config.ts`, so a story renders through the real React + Tailwind v4 pipeline against the real `@theme` tokens. Nothing is re-declared for Storybook. |
| `@storybook/addon-docs` | 10.5.6 | Autodocs + MDX | Prop tables generated from the TS types (`reactDocgen: "react-docgen-typescript"`), plus the MDX docs pages. |
| `@storybook/addon-themes` | 10.5.6 | Theme toolbar | `withThemeByClassName` flips the same `.dark` class on `<html>` that `useTheme` flips in the app — every story previews in both themes. |
| `@storybook/addon-a11y` | 10.5.6 | axe in the explorer | Reports accessibility violations per story. |

**Storybook and the PWA plugin.** `vite.config.ts` disables `vite-plugin-pwa` when
`process.env.STORYBOOK` is set — a docs site has no business registering the app's service
worker. The check is *truthy*, not `=== "1"`: the npm scripts export `STORYBOOK=1`, but
Storybook's own CLI overwrites the variable with `"true"` before it loads the config.

**Storybook ships inside the app deploy, at `/storybook`.** No second Vercel project and no
subdomain: `build:vercel` runs the normal build and then `storybook build -o dist/storybook`, so
the static explorer lands in the same output directory. Storybook's own output uses relative asset
paths, so it works from any subpath unchanged. Two things make this work, and both are easy to
break:

- **The SPA catch-all rewrite must exclude it.** `vercel.json` negatively lookaheads `storybook`
  alongside `assets/`; otherwise every Storybook URL would be rewritten to the app's `index.html`.
  A second rewrite maps bare `/storybook` → `/storybook/index.html` so the missing trailing slash
  can't 404.
- **The service worker must not claim it.** `navigateFallbackDenylist` includes `/^\/storybook/`.
  Without it, a visitor who already has the SW installed would navigate to `/storybook` and be
  served the *precached app shell* — meaning Storybook would look broken for returning visitors
  only, while working perfectly in a fresh browser. Storybook is built after `vite build`, so
  Workbox never sees those 70 files and the precache manifest stays app-only (11 entries).

### TypeScript config layout

Four files, the standard Vite project-references split plus one for Storybook:
- `tsconfig.json` — references-only root (no code), points at the three below.
- `tsconfig.app.json` — app code (`src/`, including `*.stories.tsx`), DOM libs + `vite/client` types.
- `tsconfig.node.json` — types `vite.config.ts` only, Node libs + `@types/node`.
- `tsconfig.storybook.json` — types `.storybook/` (needs DOM **and** Node types, plus JSX).

This split exists because app code runs in the **browser** (needs DOM types) while
`vite.config.ts` runs in **Node** at build time (needs Node types). They need different type
environments. `tsc -b` (build mode) walks these references; plain `tsc --noEmit` does not — which
is why the `typecheck` script uses `tsc -b --noEmit`.

> `tsconfig.storybook.json` globs `.storybook/**/*.ts{,x}` rather than the bare directory:
> TypeScript's directory includes skip dot-prefixed folders, so `".storybook"` alone resolves to
> zero inputs and the Storybook build fails with "No inputs were found in config file".

---

## Backend (`backend/`)

### Dependencies

| Package | Version | What it does | Why chosen |
|---------|---------|--------------|-----------|
| `hono` | ^4.12.23 | Web framework | Tiny, fast HTTP framework for the API. Served by bun's native server (`export default { port, fetch }` — no `@hono/node-server`). Routes: `/api/health`, `/api/models`, `/api/chat`, the `/api/sessions/*` CRUD set. |
| `@anthropic-ai/sdk` | ^0.100.1 | Claude API client | Talks to Claude (the default LLM). Used only via the connector in `backend/src/llm.ts` (`createClaudeClient`, selected by the model's `provider` tag) — the route never imports it directly, so providers stay swappable. Sends the system prompt as a cached content block (`cache_control: ephemeral`). Supports tool use: tools defined in `backend/src/tools.ts`, agent loop in `llm.ts`. |
| `openai` | ^6.42.0 | OpenAI-compatible client | One shared client (`createOpenAICompatClient` in `llm.ts`) pointed at each provider's base URL — backs **Google**, **DeepSeek**, and **Mistral**. The OpenAI SDK is used purely as the OpenAI-compat transport; OpenAI itself is not a configured provider. |
| `@supabase/supabase-js` | ^2.106.2 | Supabase client | Persistence — sessions + messages, plus the per-session graph/widget/image/ui_state jsonb blobs. |

### Dev dependencies

| Package | Version | What it does | Why chosen |
|---------|---------|--------------|-----------|
| `@biomejs/biome` | ^2.4.16 | Linter + formatter | Same config as frontend. |
| `typescript` | ^6.0.3 | Type checker | Strict mode. |
| `@types/bun` | ^1.3.14 | Bun type defs | Provides bun globals; backend `tsconfig.json` uses `"types": ["bun"]` (no DOM, no Node — bun supplies its own). |

The backend has **no build step** — bun executes TypeScript directly. That's why there's no
`build` script and a single flat `tsconfig.json` (vs. the frontend's references split).

---

## Linting: how Biome knows what to skip

Biome does **not** read `.gitignore`. Each `biome.json` has
`"files": { "includes": ["**", "!dist", "!**/*.tsbuildinfo"] }` to exclude build output. Git's
`.gitignore` and Biome's `files.includes` are separate ignore mechanisms — see
[ARCHITECTURE.md](./ARCHITECTURE.md#tooling-each-tool-has-its-own-ignore).

---

## Not yet in the stack (planned)

Earmarked for later commits — listed so the trajectory is clear (pin to these majors when installing):

- **@3dverse/livelink-react** (v0.2.x, pre-1.0) — 3D scenes (the `render_3d` North Star).
- **react-error-boundary** (v6) — one bad widget can't crash the UI.

See [ROADMAP.md](./ROADMAP.md#tool-ideas-brainstorm) for the broader candidate-tool list
(maps, diagrams, globe, etc.); those are ideas, not committed deps.

Already shipped (moved out of this list, now in the tables above): **@tanstack/react-query** +
devtools (data layer), **@tanstack/react-table** + **recharts** (table/chart widgets — recharts
took the role once earmarked for plotly), **d3-force/selection/zoom** (knowledge-graph widget —
the relationship-graph role once earmarked for cytoscape), **gridstack** (Tiles canvas),
**vitest** + testing-library + jsdom (tests), **@playwright/test** (E2E), **vite-plugin-pwa**
(PWA), **react-resizable-panels** (shell), **Supabase** (session persistence). Routing is a small
custom `useRoute` hook (`useSyncExternalStore` over the URL), not a router library.

Deploy targets: Vercel (frontend, static) + Fly.io (backend, **Docker** — `backend/Dockerfile`).
