# Architecture

How Aether fits together. **Keep this current:** update it in the same commit that changes how
the pieces connect.

Last updated: agent loop + tools.

---

## The one idea

> Every view is a question answered in its best form.

The **chat is the interface.** You ask a question; the answer comes back rendered in whatever
form fits it best — a table, a chart, a relationship graph, or a 3D scene. The 3D/graph/chart
layers are not separate apps; they are *how answers are displayed*.

---

## Monorepo shape

```
aether/
├── frontend/   React 19 + Vite + Tailwind v4   → runs in the browser
├── backend/    Bun + Hono + Anthropic + Supabase → runs on the server
├── docs/       this folder
└── README.md   build/run instructions + pointer to docs
```

Two independent packages. Each has its own `package.json`, `tsconfig.json`, and `biome.json`;
each is installed and run on its own (`bun install` / `bun dev` inside each). No Docker.

> Note: the package names are `@aether/frontend` and `@aether/backend`, which implies a bun
> workspace. There is no root `package.json` with `workspaces` yet — the packages are run
> independently. A root workspace can be added later if they need to share code.

---

## Two runtimes

The single most important architectural fact. Aether has two halves that run in two different
places, each needing a different runtime.

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   FRONTEND (browser)    │  HTTP   │   BACKEND (your machine) │
│  React SPA              │ ──────> │  Hono server             │
│  runs in the browser's  │  /api   │  holds the API keys      │
│  JS engine (V8)         │ <────── │  calls Claude + Supabase │
└─────────────────────────┘         └──────────────────────────┘
        ↑                                      ↑
   browser = runtime,                   bun = runtime
   but only for COMPILED output         (the whole time)
```

- **The browser cannot run your source.** `.tsx`/`.ts` is TypeScript + JSX, which the browser
  has never heard of. **Vite** (running on bun) compiles source into browser-ready JS. The
  browser is the runtime for the *output*, not the source.
- **The backend never touches a browser.** It runs server-side on bun because it holds secrets
  (`ANTHROPIC_API_KEY`, Supabase service key). Secrets must never reach the client. **This is
  the reason the backend exists** — to keep keys off the browser and to be the single place that
  talks to Claude and the database.

So: the browser handles the last mile of the frontend; **bun handles everything a developer
does** — install, compile, run the server, run tests.

---

## Frontend ↔ backend wiring (the `/api` proxy)

In dev, the frontend calls relative paths like `/api/chat`. Vite is configured
(`frontend/vite.config.ts`) to proxy `/api` → `http://localhost:8000` (the backend):

```ts
server: { proxy: { "/api": "http://localhost:8000" } }
```

Two benefits:
1. **No CORS in dev** — to the browser, the API looks same-origin.
2. **No hardcoded backend URL** in frontend code — it just calls `/api/...`.

The `:8000` port is a contract the backend honors: the Hono server binds `:8000` (overridable via
`PORT`). The proxy line and the server's port are two files that must agree. No CORS config is
needed in dev — the proxy makes the API look same-origin.

---

## The backend (`/api/chat`)

The backend is a Hono server (`backend/src/index.ts`) served by **bun's native server**
(`export default { port, fetch }` — no `@hono/node-server`). Two routes today:

- `GET /api/health` → `{ ok: true }` — liveness, works before any API key is set.
- `POST /api/chat` — one chat turn, streamed as SSE.

```
request   { messages: { role: "user" | "assistant", content: string }[] }
response  text/event-stream
  data: {"type":"text","content":"..."}   // one event per token
  data: [DONE]                            // stream complete
  data: {"type":"error","message":"..."}  // mid-stream error
error     { error: string }              // 400 (bad body) before streaming starts
```

The frontend sends the **full conversation** on every turn; the server is **stateless** (no
session storage yet). Tokens are emitted via Hono's `streamSSE()` as they arrive from the SDK;
the frontend reads them with `fetch` + `ReadableStream`, appending each token to the last
assistant message in state.

### The LLM connector — a platform seam

The route never imports the Anthropic SDK. It calls `createClient().stream(...)` from
`backend/src/llm.ts`, a factory keyed off `LLM_PROVIDER` (default `claude`). Claude is the only
provider implemented; adding Gemini/Ollama means a new branch there, not a route change. The
system prompt (`backend/src/prompt.ts`) is sent as a cached content block
(`cache_control: ephemeral`). The Anthropic client is built lazily on first chat turn, so the
server (and `/api/health`) start fine without a key.

Tools are defined in `backend/src/tools.ts` (a `TOOLS` array of Anthropic-schema definitions plus
an `executeTool` dispatcher) and passed to `createClaudeClient` at construction time — the
`LlmClient` interface stays tool-agnostic. The `stream()` method accepts optional `onToolStart` and
`onToolResult` callbacks; the route uses these to emit `tool_start` / `tool_result` SSE events.

On the frontend, the stream reader and conversation state live in `frontend/src/shell/useChat.ts`;
`ChatPanel.tsx` is just the view.

---

## Tooling: each tool has its own ignore

A cross-cutting fact that already cost time once and will again if forgotten:

**There is no master ignore file.** `.gitignore` configures **git only** (what gets committed).
Other tools do not read it:

| Tool | Reads | Controls |
|------|-------|----------|
| git | `.gitignore` | what gets committed |
| Biome | `biome.json` → `files.includes` | what gets linted/formatted |
| TypeScript | `tsconfig.json` → `include`/`exclude` | what gets type-checked |

So "just add it to `.gitignore`" only ever configures git. To stop Biome linting `dist/`, it
needs its own rule (`files.includes` with `!dist`). To stop tsc checking something, it needs
`exclude`. Three separate mechanisms for three separate tools.

---

## The shell — three-zone layout

The app is one persistent shell with three horizontal zones. This is the frame every experience
runs inside; it is the platform's primary surface.

```
┌──────────┬───────────────────────────┬──────────────────────────────────┐
│          │                           │                                  │
│  SIDEBAR │      CHAT (body)          │     CAPABILITY COLUMN            │
│          │                           │                                  │
│  logo    │   messages                │   [ tab | tab | tab ]  ⛶  ×      │
│  nav     │   …                       │   ┌──────────────────────────┐   │
│          │                           │   │  active widget           │   │
│  convos  │   ┌─────────────────────┐ │   │  (3dverse / data / …)    │   │
│   • …    │   │ type a message…  ↑  │ │   └──────────────────────────┘   │
│          │   └─────────────────────┘ │                                  │
└──────────┴───────────────────────────┴──────────────────────────────────┘
  resizable          resizable boundary        resizable · closable
  collapsible
```

**Zones**
- **Sidebar** — resizable, collapsible. Logo + nav (top), conversation history (list).
- **Chat (body)** — message transcript + composer. Full width when alone; narrows when the
  capability column opens.
- **Capability column** — hosts widgets. **Tabbed** (multiple widgets coexist). **Fullscreen-
  capable** (expands over the chat for an immersive moment, then restores). Opened/closed by the
  **agent or the user**; resizable, closable.

**Three states**
```
1. CHAT ONLY          2. SPLIT                    3. CAPABILITY FULLSCREEN
┌────┬──────────┐     ┌────┬─────┬──────────┐     ┌────┬───────────────────┐
│ SB │  chat    │     │ SB │chat │[tab|tab] │     │ SB │ [tab | tab | tab] │
│    │          │  →  │    │     │ widget   │  →  │    │   widget          │
└────┴──────────┘     └────┴─────┴──────────┘     └────┴───────────────────┘
```

Panel resize/collapse is handled by **`react-resizable-panels`** (resizable, collapsible panel
groups) rather than hand-rolled drag math.

## The capability registry — the first platform seam

The capability column is not a fixed slot; it is a small managed system that **both the agent
and the user act on**. The shared state is the **capability registry**:

```
            ┌─────────────────────────────┐
  agent  ──▶│   capability registry       │◀──  user
  (tools)   │   [{ id, type, title,       │     (open/close tabs,
            │      state, active }]        │      resize, fullscreen)
            └─────────────────────────────┘
                         │
                         ▼
            Capability column renders tabs + the active widget
```

- The agent's tools address the column: *open a widget, update widget N, bring one forward.*
- Each **widget type** (a 3dverse scene, a data view, …) is a **plugin** that registers a
  renderer keyed by `type`. The registry and the column don't know what's inside a widget — they
  only know `{ id, type, title, state }` and hand `state` to the matching renderer.

This is where **conversation, capabilities, and visuals meet** — designing it well *is* designing
the platform. New experiences plug in by registering a renderer; nothing in the shell changes.

---

## Data flow

**Lit up as of Commit 5** (agent loop + tools):

```
user message
   → frontend POST /api/chat                    ← built
   → Hono handler (streamSSE)                   ← built
   → Claude call via connector (stream)         ← built
   → SSE token events → frontend reader         ← built
   → tokens appended live in the chat           ← built
   → agent loop: tool_use? → executeTool        ← built (Commit 5)
       → feed tool_result back → continue       ← built (Commit 5)
       → exits when stop_reason !== "tool_use"  ← built (Commit 5)
```

SSE wire format — all event types:
```
data: {"type":"text","content":"..."}              // one event per token
data: {"type":"tool_start","tool":"...","input":{}} // tool call beginning
data: {"type":"tool_result","tool":"...","result":"..."} // tool result fed back
data: [DONE]                                       // stream complete
data: {"type":"error","message":"..."}             // mid-stream error
```

The agent loop runs entirely on the backend; the frontend sees only SSE events. Tool
definitions live in `backend/src/tools.ts`; the loop in `backend/src/llm.ts`.

Still ahead:

```
   → frontend renders widgets (chart / graph / 3D)
   → persist session + widget specs to Supabase
```

See [ROADMAP.md](./ROADMAP.md) for the build sequence.
