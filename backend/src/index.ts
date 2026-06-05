import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  createSession,
  deleteSession,
  type GraphSnapshot,
  getMessages,
  getSessionGraph,
  listSessions,
  saveMessage,
  updateSessionGraphData,
  updateSessionGraphMode,
  updateSessionTitle,
  updateSessionTitleIfEmpty,
} from "./db";
import { type ChatMessage, createClient } from "./llm";

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));

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

app.patch("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON" }, 400);
  }
  // Accepts a title rename and/or a graph_mode change — whichever fields are
  // present and valid. One endpoint for all session mutation.
  const { title, graph_mode: graphMode } = body as {
    title?: unknown;
    graph_mode?: unknown;
  };
  const hasTitle = typeof title === "string" && title.trim().length > 0;
  const hasGraphMode = typeof graphMode === "boolean";
  if (!hasTitle && !hasGraphMode) {
    return c.json(
      { error: "Expected { title: string } and/or { graph_mode: boolean }" },
      400
    );
  }
  try {
    if (hasTitle) await updateSessionTitle(id, (title as string).trim());
    if (hasGraphMode) await updateSessionGraphMode(id, graphMode as boolean);
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

  const { messages, sessionId, userId, graphMode } = body as {
    messages?: unknown;
    sessionId?: unknown;
    userId?: unknown;
    graphMode?: unknown;
  };

  if (!isChatMessageArray(messages)) {
    return c.json({ error: "Expected { messages: { role, content }[] }" }, 400);
  }

  // Build the client per request so the tool surface (and graph-mode prompt)
  // matches this conversation's mode.
  const llm = createClient({ graphMode: graphMode === true });

  // Narrow once here; persistSession is a string exactly when persist is true,
  // so the streaming callback below doesn't need to re-cast at every call site.
  const persistSession =
    typeof sessionId === "string" &&
    sessionId.length > 0 &&
    typeof userId === "string" &&
    userId.length > 0
      ? sessionId
      : null;

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
              await saveMessage(
                persistSession,
                "user",
                lastUserMessage.content
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

            // Auto-title the session from the first user message. The
            // conditional UPDATE is a no-op once a title exists, and a failure
            // here must never affect message persistence — so it's decoupled.
            if (lastUserMessage.content) {
              try {
                const title = lastUserMessage.content.slice(0, 60);
                await updateSessionTitleIfEmpty(persistSession, title);
              } catch (err) {
                console.error("Failed to auto-title session:", err);
              }
            }
          }
        },
        async (tool, input) => {
          await stream.writeSSE({
            data: JSON.stringify({ type: "tool_start", tool, input }),
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
      const { role, content } = m as Record<string, unknown>;
      return (
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.length > 0
      );
    })
  );
}

const port = Number(process.env.PORT ?? 8000);

export default {
  port: Number.isFinite(port) ? port : 8000,
  fetch: app.fetch,
};
