import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  createSession,
  deleteSession,
  forkSession,
  type GraphSnapshot,
  getMessages,
  getSession,
  getSessionGraph,
  getSessionWidgets,
  listSessions,
  saveMessage,
  type UiState,
  updateSessionGraphData,
  updateSessionGraphMode,
  updateSessionModel,
  updateSessionTitle,
  updateSessionTitleIfEmpty,
  updateSessionUiState,
  updateSessionWidgetData,
  type WidgetSnapshot,
} from "./db";
import { checkHealth } from "./health";
import { type ChatMessage, createClient, generateTitle } from "./llm";
import { MODELS, resolveModel } from "./models";
import { toolStatusLabel } from "./tools";

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/health/full", async (c) => {
  const result = await checkHealth();
  return c.json(result);
});

// The model picker's options — single source of truth so the frontend doesn't
// hardcode the allowlist.
app.get("/api/models", (c) => c.json({ models: MODELS }));

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
  const { nodes, links } = body as { nodes?: unknown; links?: unknown };
  if (!Array.isArray(nodes) || !Array.isArray(links)) {
    return c.json({ error: "Expected { nodes: [], links: [] }" }, 400);
  }
  try {
    const snapshot: GraphSnapshot = { nodes, links };
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
    table?: unknown;
    chart?: unknown;
    timeline?: unknown;
    images?: unknown;
  };
  if (!("table" in b) || !("chart" in b) || !("timeline" in b)) {
    return c.json({ error: "Expected { table, chart, timeline }" }, 400);
  }
  try {
    const snapshot: WidgetSnapshot = {
      table: Array.isArray(b.table) ? b.table : null,
      chart: Array.isArray(b.chart) ? b.chart : null,
      timeline: Array.isArray(b.timeline) ? b.timeline : null,
      // images added later; treat a missing key as "none" so older clients
      // that don't send it still save cleanly.
      images: Array.isArray(b.images) ? b.images : null,
    };
    await updateSessionWidgetData(id, snapshot);
    return c.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/sessions/:id/widgets failed:", err);
    return c.json({ error: "Failed to save widgets" }, 500);
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

  const { messages, sessionId, userId, graphMode, model } = body as {
    messages?: unknown;
    sessionId?: unknown;
    userId?: unknown;
    graphMode?: unknown;
    model?: unknown;
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
          await stream.writeSSE({ data: "[DONE]" });

          // Persist after [DONE] so we only save complete turns.
          if (persistSession && lastUserMessage) {
            // Message persistence is the critical path. If it fails, warn the
            // client after [DONE] so the turn isn't silently lost on reload.
            try {
              // Persist the transcript stand-in when the client sent one, so a
              // verbose fill instruction never reappears on reload — the model
              // already received the full `content` for this turn.
              await saveMessage(
                persistSession,
                "user",
                lastUserMessage.displayText ?? lastUserMessage.content
              );
              await saveMessage(persistSession, "assistant", assistantText);
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

            // Auto-title the session from the first user message. A one-shot
            // Haiku micro-agent names it in a few words; if that fails (bad key,
            // rate limit) it returns null and we fall back to the truncated
            // message. The conditional UPDATE is a no-op once a title exists, and
            // a failure here must never affect message persistence — so it's
            // decoupled.
            if (lastUserMessage.content) {
              try {
                const generated = await generateTitle(lastUserMessage.content);
                const title = generated ?? lastUserMessage.content.slice(0, 60);
                await updateSessionTitleIfEmpty(persistSession, title);
              } catch (err) {
                console.error("Failed to auto-title session:", err);
              }
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
        }
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
