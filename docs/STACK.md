# Stack

Every dependency in Aether, what it does, and why it was chosen. **Keep this current:** when a
commit adds, removes, or upgrades a dependency, update this file in the same commit.

Last updated: Health dashboard widget + `/api/health/full` route.

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
| `tailwindcss` | ^4.3.0 | Utility-first CSS | Styling via composable utility classes in markup — no per-component stylesheets, no leaking. v4 uses a Vite plugin (no PostCSS). |
| `react-markdown` | ^10.x | Markdown renderer | Renders assistant messages as rich text. Used with `remark-gfm` for tables, strikethrough, task lists. |
| `remark-gfm` | ^4.x | GitHub Flavored Markdown plugin | Extends `react-markdown` with GFM syntax. |
| `react-resizable-panels` | ^4.11.2 | Resizable/collapsible panel groups | Powers the three-zone shell (sidebar / chat / capability column). **Unit trap — see [ARCHITECTURE.md](./ARCHITECTURE.md#the-shell--three-zone-layout).** |
| `d3-force` / `d3-selection` / `d3-zoom` | ^3.x | Force layout + SVG selection + pan/zoom | The knowledge-graph widget: force-directed node layout rendered to SVG with pan/zoom. |
| `lucide-react` | ^1.17.0 | Icon set | UI glyphs across the shell. |
| `@radix-ui/react-tooltip` | ^1.2.9 | Accessible tooltip primitive | Hover/focus tooltips with correct a11y + collision handling, instead of hand-rolling. |
| `@radix-ui/react-dropdown-menu` | ^2.1.17 | Accessible menu primitive | The shared "Explore further" kebab menu on table rows / chart series / image tiles / timeline events (`widgets/ContextMenu.tsx`). Replaced a right-click-only menu that was unreachable on touch; Radix gives a visible ⋮ trigger plus outside-click/Escape/focus-trap/collision-flip for free. |
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

### TypeScript config layout

Three files, the standard Vite project-references split:
- `tsconfig.json` — references-only root (no code), points at the two below.
- `tsconfig.app.json` — app code (`src/`), DOM libs + `vite/client` types.
- `tsconfig.node.json` — types `vite.config.ts` only, Node libs + `@types/node`.

This split exists because app code runs in the **browser** (needs DOM types) while
`vite.config.ts` runs in **Node** at build time (needs Node types). They need different type
environments. `tsc -b` (build mode) walks these references; plain `tsc --noEmit` does not — which
is why the `typecheck` script uses `tsc -b --noEmit`.

---

## Backend (`backend/`)

### Dependencies

| Package | Version | What it does | Why chosen |
|---------|---------|--------------|-----------|
| `hono` | ^4.12.23 | Web framework | Tiny, fast HTTP framework for the API. Served by bun's native server (`export default { port, fetch }` — no `@hono/node-server`). Routes: `/api/health`, `/api/chat`. |
| `@anthropic-ai/sdk` | ^0.100.1 | Claude API client | Talks to Claude (the LLM). Used only via the connector in `backend/src/llm.ts` (`createClient()` keyed off `LLM_PROVIDER`) — the route never imports it directly, so Claude/Gemini/Ollama stay swappable. Sends the system prompt as a cached content block (`cache_control: ephemeral`). Supports tool use: tools defined in `backend/src/tools.ts`, agent loop in `llm.ts`. |
| `@supabase/supabase-js` | ^2.106.2 | Supabase client | Persistence (Commit 6). Two-client pattern planned: read (anon key) + write (service key). |

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

Added in later commits — listed so the trajectory is clear. Versions are current-latest as of
2026-05-30 (pin to these majors when installing):

- **@tanstack/react-router** — type-safe client-side routing (chat view, saved views). Chosen
  over react-router for its type safety and tight integration with TanStack Query.
- **plotly.js** (v3) + **react-plotly.js** (v2) — chart widgets (~M6)
- **cytoscape** (v3) — relationship graph view (M8)
- **@3dverse/livelink-react** (v0.2.x, pre-1.0) — 3D scenes (M7)
- **react-error-boundary** (v6) — one bad widget can't crash the UI

Already shipped (moved out of this list, now in the tables above): **@tanstack/react-query** +
devtools (data layer), **vitest** + testing-library + jsdom (tests), **d3-force/selection/zoom**
(knowledge-graph widget), **react-resizable-panels** (shell), **Supabase** (session persistence).

Deploy targets: Vercel (frontend) + Fly.io (backend), both free tiers. No Docker.
