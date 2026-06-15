import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  createSession,
  deleteMessages,
  deleteSession,
  forkSession,
  type GraphSnapshot,
  getMessages,
  getSession,
  getSessionGraph,
  getSessionWidgets,
  listSessions,
  mergeWidgetSnapshot,
  saveMessage,
  type UiState,
  updateSessionGraphData,
  updateSessionGraphMode,
  updateSessionModel,
  updateSessionTitle,
  updateSessionTitleIfEmpty,
  updateSessionUiState,
  updateSessionWidgetData,
} from "./db";
import { checkHealth, checkProviders } from "./health";
import { type ChatMessage, createClient, generateTitle } from "./llm";
import { backfillSnapshotPrompts } from "./recreationPrompt";
import { MODELS, type Provider, resolveModel } from "./models";
import { toolStatusLabel } from "./tools";

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/health/full", async (c) => {
  const result = await checkHealth();
  return c.json(result);
});

// The model picker's options — single source of truth so the frontend doesn't
// hardcode the allowlist. We filter to providers that pass a live health probe so
// the picker never offers a model whose key is missing/wrong/unreachable (it would
// only throw mid-turn). The probe is a billable 1-token completion per provider, so
// we cache the green-set in memory for a short TTL rather than re-probing every
// page load. Claude is the default everywhere — if its probe is down we still
// expose the full allowlist rather than an empty picker (better a degraded turn
// than a dead control); the chat route surfaces the real provider error.
const PROVIDER_HEALTH_TTL_MS = 60_000;
let providerHealthCache: { at: number; green: Set<Provider> } | null = null;

async function greenProviders(): Promise<Set<Provider>> {
  if (
    providerHealthCache &&
    Date.now() - providerHealthCache.at < PROVIDER_HEALTH_TTL_MS
  ) {
    return providerHealthCache.green;
  }
  const providers = await checkProviders();
  const green = new Set<Provider>(
    (Object.keys(providers) as Provider[]).filter((p) => providers[p].ok)
  );
  providerHealthCache = { at: Date.now(), green };
  return green;
}

app.get("/api/models", async (c) => {
  // We tag each model `available` rather than dropping unhealthy ones, because the
  // full allowlist is also the source of truth for LABELLING past sessions (the
  // sidebar shows each session's saved model). Dropping an entry would make a
  // session that ran on a now-down provider render with the wrong model name. The
  // picker hides the unavailable ones; the label lookup still resolves every id.
  let green: Set<Provider>;
  try {
    green = await greenProviders();
  } catch {
    // If the probe itself blows up, treat everything as available rather than
    // stranding the user with an empty picker.
    green = new Set<Provider>(MODELS.map((m) => m.provider));
  }
  // Claude is the default everywhere; if its probe is down, don't blank the picker —
  // expose the full set and let the chat route surface the real provider error.
  const allAvailable = !green.has("claude");
  const models = MODELS.map((m) => ({
    ...m,
    available: allAvailable || green.has(m.provider),
  }));
  return c.json({ models });
});

app.post("/api/sessions", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON" }, 400);
  }
  const userId = (body as { userId?: unknown }).userId;
  if (typeof userId !== "string" || !userId) {
    return c.json({ error: "Expected { userId: string }" }, 400);
  }
  // Optional initial graph mode so a new conversation inherits the last-used
  // value rather than always defaulting to the column default.
  const graphModeRaw = (body as { graphMode?: unknown }).graphMode;
  const graphMode =
    typeof graphModeRaw === "boolean" ? graphModeRaw : undefined;
  try {
    const session = await createSession(userId, undefined, graphMode);
    return c.json(session);
  } catch (err) {
    console.error("POST /api/sessions failed:", err);
    return c.json({ error: "Failed to create session" }, 500);
  }
});

app.get("/api/sessions", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "userId query param is required" }, 400);
  }
  try {
    const sessions = await listSessions(userId);
    return c.json(sessions);
  } catch (err) {
    console.error("GET /api/sessions failed:", err);
    return c.json({ error: "Failed to list sessions" }, 500);
  }
});

app.post("/api/sessions/:id/fork", async (c) => {
  const sourceId = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON" }, 400);
  }
  const userId = (body as { userId?: unknown }).userId;
  if (typeof userId !== "string" || !userId) {
    return c.json({ error: "Expected { userId: string }" }, 400);
  }
  try {
    const fork = await forkSession(sourceId, userId);
    return c.json(fork);
  } catch (err) {
    console.error("POST /api/sessions/:id/fork failed:", err);
    return c.json({ error: "Failed to fork session" }, 500);
  }
});

app.get("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const session = await getSession(id);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(session);
  } catch (err) {
    console.error("GET /api/sessions/:id failed:", err);
    return c.json({ error: "Failed to load session" }, 500);
  }
});

app.patch("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON" }, 400);
  }
  // Accepts a title rename, a graph_mode change, a model change, and/or a
  // ui_state patch — whichever fields are present and valid. One endpoint for
  // all session mutation.
  const {
    title,
    graph_mode: graphMode,
    model,
    ui_state: uiState,
  } = body as {
    title?: unknown;
    graph_mode?: unknown;
    model?: unknown;
    ui_state?: unknown;
  };
  const hasTitle = typeof title === "string" && title.trim().length > 0;
  const hasGraphMode = typeof graphMode === "boolean";
  // A plain object (frontend-owned grab-bag); round-tripped as-is.
  const hasUiState =
    typeof uiState === "object" && uiState !== null && !Array.isArray(uiState);
  // Only persist a model that's in the allowlist.
  const validModel = resolveModel(model);
  if (!hasTitle && !hasGraphMode && !validModel && !hasUiState) {
    return c.json(
      {
        error:
          "Expected { title: string }, { graph_mode: boolean }, { model: string }, and/or { ui_state: object }",
      },
      400
    );
  }
  try {
    if (hasTitle) await updateSessionTitle(id, (title as string).trim());
    if (hasGraphMode) await updateSessionGraphMode(id, graphMode as boolean);
    if (validModel) await updateSessionModel(id, validModel);
    if (hasUiState) await updateSessionUiState(id, uiState as UiState);
    return c.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/sessions/:id failed:", err);
    return c.json({ error: "Failed to update session" }, 500);
  }
});

app.delete("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await deleteSession(id);
    return c.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/sessions/:id failed:", err);
    return c.json({ error: "Failed to delete session" }, 500);
  }
});

app.get("/api/sessions/:id/messages", async (c) => {
  const id = c.req.param("id");
  try {
    const messages = await getMessages(id);
    return c.json(messages);
  } catch (err) {
    console.error("GET /api/sessions/:id/messages failed:", err);
    return c.json({ error: "Failed to load messages" }, 500);
  }
});

// Delete a chunk of a conversation (the user+assistant pair behind a turn's
// trash control). The client computes which rows form the chunk and sends their
// ids; we delete them scoped to the session.
app.delete("/api/sessions/:id/messages", async (c) => {
  const id = c.req.param("id");
  try {
    const { ids } = await c.req.json<{ ids: string[] }>();
    await deleteMessages(id, ids);
    return c.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/sessions/:id/messages failed:", err);
    return c.json({ error: "Failed to delete messages" }, 500);
  }
});

// The persisted knowledge-graph snapshot for a session. Loaded alongside
// messages when a conversation is reopened so the graph the user built (and any
// dragged-pinned positions) is restored. Returns { nodes: [], links: [] } when
// nothing has been saved yet.
app.get("/api/sessions/:id/graph", async (c) => {
  const id = c.req.param("id");
  try {
    const graph = await getSessionGraph(id);
    return c.json(graph ?? { nodes: [], links: [] });
  } catch (err) {
    console.error("GET /api/sessions/:id/graph failed:", err);
    return c.json({ error: "Failed to load graph" }, 500);
  }
});

// Save the current graph snapshot. The frontend debounces this as the graph
// grows or nodes are dragged/removed. The body is round-tripped as-is; we only
// check it has node/link arrays so a malformed save can't corrupt the column.
app.put("/api/sessions/:id/graph", async (c) => {
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON" }, 400);
  }
  const { schemaVersion, nodes, links } = body as {
    schemaVersion?: unknown;
    nodes?: unknown;
    links?: unknown;
  };
  if (!Array.isArray(nodes) || !Array.isArray(links)) {
    return c.json({ error: "Expected { nodes: [], links: [] }" }, 400);
  }
  try {
    // Preserve the frontend's stamp; dropping it makes load-time validation
    // always fail (undefined !== current version) → resets + toast on reload.
    const snapshot: GraphSnapshot = {
      ...(typeof schemaVersion === "number" ? { schemaVersion } : {}),
      nodes,
      links,
    };
    await updateSessionGraphData(id, snapshot);
    return c.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/sessions/:id/graph failed:", err);
    return c.json({ error: "Failed to save graph" }, 500);
  }
});

// Persisted render-tool widget specs (table + chart) for a session. Loaded
// when a conversation is reopened so tables/charts the model generated are
// visible without a new turn. Returns { table: null, chart: null } when nothing
// has been saved yet.
app.get("/api/sessions/:id/widgets", async (c) => {
  const id = c.req.param("id");
  try {
    const data = await getSessionWidgets(id);
    return c.json(
      data ?? { table: null, chart: null, timeline: null, images: null }
    );
  } catch (err) {
    console.error("GET /api/sessions/:id/widgets failed:", err);
    return c.json({ error: "Failed to load widgets" }, 500);
  }
});

// Save the current widget snapshot. Round-tripped as-is; we only check the
// expected top-level keys so a malformed save can't corrupt the column.
app.put("/api/sessions/:id/widgets", async (c) => {
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON" }, 400);
  }
  const b = body as {
    schemaVersion?: unknown;
    reset?: unknown;
    table?: unknown;
    chart?: unknown;
    timeline?: unknown;
    images?: unknown;
  };
  if (!("table" in b) || !("chart" in b) || !("timeline" in b)) {
    return c.json({ error: "Expected { table, chart, timeline }" }, 400);
  }
  try {
    // Merge against the stored row so a null/empty incoming field can never wipe
    // real saved widgets unless the client passes `reset: true`. See
    // mergeWidgetSnapshot. We skip the read entirely on an explicit reset.
    const existing =
      b.reset === true ? null : await getSessionWidgets(id).catch(() => null);
    const snapshot = mergeWidgetSnapshot(b, existing);
    await updateSessionWidgetData(id, snapshot);
    return c.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/sessions/:id/widgets failed:", err);
    return c.json({ error: "Failed to save widgets" }, 500);
  }
});

// Backfill missing widget recreation prompts (summary/blurb) for a conversation
// made before summary was required. Loads the stored snapshot, fills any entry that
// lacks a prompt via a cheap Haiku call, persists, and returns the patched snapshot
// so the client can update its tiles in place. No-op (and no model calls) when every
// widget already has a prompt. Called lazily by the client after a load detects gaps.
app.post("/api/sessions/:id/repair-prompts", async (c) => {
  const id = c.req.param("id");
  try {
    const existing = await getSessionWidgets(id);
    if (!existing) return c.json({ filled: 0, widgets: null });
    const { filled } = await backfillSnapshotPrompts(existing);
    if (filled > 0) await updateSessionWidgetData(id, existing);
    return c.json({ filled, widgets: existing });
  } catch (err) {
    console.error("POST /api/sessions/:id/repair-prompts failed:", err);
    return c.json({ error: "Failed to repair prompts" }, 500);
  }
});

// One chat turn. The frontend posts the full conversation; we stream tokens
// back as SSE events. Optionally persists the turn if sessionId + userId are
// provided — omitting them keeps the route backwards-compatible.
app.post("/api/chat", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON" }, 400);
  }

  const { messages, sessionId, userId, graphMode, model, clarified } = body as {
    messages?: unknown;
    sessionId?: unknown;
    userId?: unknown;
    graphMode?: unknown;
    model?: unknown;
    // True when this turn is the answer to a prior clarifier — threaded to the
    // planner so it won't clarify again (no interrogation loops).
    clarified?: unknown;
  };

  if (!isChatMessageArray(messages)) {
    return c.json({ error: "Expected { messages: { role, content }[] }" }, 400);
  }

  // Validate the requested model against the allowlist; an unknown/absent value
  // resolves to undefined, which lets the client fall back to the env/default.
  const selectedModel = resolveModel(model);

  // Narrow once here; persistSession is a string exactly when persist is true,
  // so the streaming callback below doesn't need to re-cast at every call site.
  const persistSession =
    typeof sessionId === "string" &&
    sessionId.length > 0 &&
    typeof userId === "string" &&
    userId.length > 0
      ? sessionId
      : null;

  // Build the client per request so the tool surface (and graph-mode prompt)
  // matches this conversation's mode, and so the chosen model applies this turn.
  // sessionId is threaded through for per-conversation tool limits (Unsplash cap);
  // only a persisted conversation has a count to scope to, so pass null otherwise.
  const llm = createClient({
    graphMode: graphMode === true,
    model: selectedModel,
    sessionId: persistSession ?? undefined,
  });

  // The last user message — needed for saving and for auto-titling the session.
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");

  return streamSSE(c, async (stream) => {
    let assistantText = "";

    try {
      await llm.stream(
        messages,
        async (token) => {
          assistantText += token;
          await stream.writeSSE({
            data: JSON.stringify({ type: "text", content: token }),
          });
        },
        async () => {
          // The conversation pane must never come back empty. The model is told
          // to lead with real prose, but it sometimes skips straight to tool
          // calls (notably on a familiar/repeat prompt where it figures the
          // panels say it all). If nothing streamed, emit a short fallback line
          // so the chat thread always has a reply, then persist that — not "".
          if (!assistantText.trim()) {
            const fallback =
              "Here's what I found — take a look at the panels alongside for the details.";
            assistantText = fallback;
            await stream.writeSSE({
              data: JSON.stringify({ type: "text", content: fallback }),
            });
          }

          // Persist before [DONE] so the `persisted` id round-trip (below) is
          // consumed by the client, whose read loop breaks on [DONE].
          if (persistSession && lastUserMessage) {
            // Message persistence is the critical path. If it fails, warn the
            // client so the turn isn't silently lost on reload.
            try {
              // Persist the transcript stand-in when the client sent one, so a
              // verbose fill instruction never reappears on reload — the model
              // already received the full `content` for this turn.
              const userId = await saveMessage(
                persistSession,
                "user",
                lastUserMessage.displayText ?? lastUserMessage.content
              );
              const assistantId = await saveMessage(
                persistSession,
                "assistant",
                assistantText
              );
              // Hand the client the real DB ids so its placeholder ids become
              // the actual row ids — lets a same-session delete hit the right
              // rows without a reload. Only sent once both saves succeeded.
              await stream.writeSSE({
                data: JSON.stringify({ type: "persisted", userId, assistantId }),
              });
            } catch (err) {
              console.error("Failed to persist chat turn:", err);
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "warning",
                  message:
                    "This message could not be saved and may be lost on reload.",
                }),
              });
            }
          }

          // Terminal signal now — after persistence + the `persisted` round-trip
          // (so the client's read loop, which breaks on [DONE], consumes them),
          // but BEFORE auto-titling so the turn finishes immediately and doesn't
          // wait on the title micro-agent's network call.
          await stream.writeSSE({ data: "[DONE]" });

          // Auto-title the session from the first user message. A one-shot Haiku
          // micro-agent names it in a few words; if that fails (bad key, rate
          // limit) it returns null and we fall back to the truncated message. The
          // conditional UPDATE is a no-op once a title exists, and a failure here
          // must never affect message persistence — so it's decoupled, and runs
          // after [DONE] since the client doesn't block on it.
          if (persistSession && lastUserMessage && lastUserMessage.content) {
            try {
              const generated = await generateTitle(lastUserMessage.content);
              const title =
                generated?.title ?? lastUserMessage.content.slice(0, 60);
              await updateSessionTitleIfEmpty(
                persistSession,
                title,
                generated?.icon ?? null
              );
            } catch (err) {
              console.error("Failed to auto-title session:", err);
            }
          }
        },
        async (tool, input) => {
          // Carry a human-readable, input-aware label alongside the raw tool so
          // the UI can show "Searching the web for "…"" instead of the bare name.
          // The frontend falls back to "Using {tool}…" if label is ever absent.
          await stream.writeSSE({
            data: JSON.stringify({
              type: "tool_start",
              tool,
              input,
              label: toolStatusLabel(tool, input),
            }),
          });
        },
        async (tool, result) => {
          await stream.writeSSE({
            data: JSON.stringify({ type: "tool_result", tool, result }),
          });
        },
        async (tool, partialJson, isComplete) => {
          // Streamed render-tool spec as it arrives — the frontend re-parses and
          // re-renders the widget from this growing JSON. tool_result (above) is
          // still the authoritative final; tool_partial is purely additive.
          await stream.writeSSE({
            data: JSON.stringify({
              type: "tool_partial",
              tool,
              partialJson,
              isComplete,
            }),
          });
        },
        async (iteration) => {
          await stream.writeSSE({
            data: JSON.stringify({ type: "loop_start", iteration }),
          });
        },
        async (message) => {
          await stream.writeSSE({
            data: JSON.stringify({ type: "status", message }),
          });
        },
        async (plan) => {
          // The planner's abstract composition plan for this turn (capabilities +
          // relationships, never coordinates). Bigsail consumes it to order cards
          // and draw flowchart edges; a future superskill can too.
          await stream.writeSSE({
            data: JSON.stringify({ type: "plan", plan }),
          });
        },
        async (clarify) => {
          // Thin-but-explodable turn: the planner asked ONE expanding question
          // instead of composing. The question already streamed as assistant text
          // (via onToken); this carries the tappable options so the frontend can
          // render chips. The turn ends here — no agent loop, no widgets.
          await stream.writeSSE({
            data: JSON.stringify({
              type: "clarify",
              question: clarify.question,
              options: clarify.options,
            }),
          });
        },
        clarified === true
      );
    } catch (err) {
      console.error("POST /api/chat stream failed:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Failed to get a reply from the model";
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", message }),
      });
    }
  });
});

// Dev-only: re-run the frontend's screenshot capture on demand, so the
// /screenshots admin tab's "Run now" button works without a terminal. Registered
// ONLY in local dev — never on Fly (FLY_APP_NAME is set there) and never under
// NODE_ENV=production. Playwright can't run in the serverless/prod backend anyway,
// so dev-only is the honest boundary. The capture script itself writes into the
// frontend (which is gitignored); we just shell out to it.
const IS_DEV =
  !process.env.FLY_APP_NAME && process.env.NODE_ENV !== "production";

if (IS_DEV) {
  app.post("/api/screenshots/run", async (c) => {
    try {
      // The backend runs from backend/ (bun run --watch src/index.ts); the
      // capture lives in the sibling frontend package.
      const proc = Bun.spawn(["bun", "run", "screenshots"], {
        cwd: new URL("../../frontend", import.meta.url).pathname,
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        console.error("screenshot capture failed:", stderr);
        return c.json(
          { error: `Capture exited ${exitCode}: ${stderr.slice(-500)}` },
          500
        );
      }
      return c.json({ ok: true });
    } catch (err) {
      console.error("POST /api/screenshots/run failed:", err);
      const message = err instanceof Error ? err.message : "Capture failed";
      return c.json({ error: message }, 500);
    }
  });
}

function isChatMessageArray(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((m): m is ChatMessage => {
      if (m == null || typeof m !== "object") return false;
      const { role, content, displayText } = m as Record<string, unknown>;
      return (
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.length > 0 &&
        (displayText === undefined || typeof displayText === "string")
      );
    })
  );
}

const port = Number(process.env.PORT ?? 8000);

export default {
  port: Number.isFinite(port) ? port : 8000,
  fetch: app.fetch,
  // SSE chat responses stream Claude's output, which can idle longer than Bun's
  // default 10s idleTimeout between chunks (time-to-first-token, long answers) —
  // the server would cut the socket mid-stream and the browser saw a NetworkError.
  // 255s is Bun's max; LLM turns comfortably fit under it.
  idleTimeout: 255,
};
