import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  createSession,
  deleteSession,
  getMessages,
  listSessions,
  saveMessage,
  updateSessionTitle,
  updateSessionTitleIfEmpty,
} from "./db";
import { type ChatMessage, createClient } from "./llm";

const app = new Hono();
const llm = createClient();

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
  try {
    const session = await createSession(userId);
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
  const title = (body as { title?: unknown }).title;
  if (typeof title !== "string" || !title.trim()) {
    return c.json({ error: "Expected { title: string }" }, 400);
  }
  try {
    await updateSessionTitle(id, title.trim());
    return c.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/sessions/:id failed:", err);
    return c.json({ error: "Failed to rename session" }, 500);
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

  const { messages, sessionId, userId } = body as {
    messages?: unknown;
    sessionId?: unknown;
    userId?: unknown;
  };

  if (!isChatMessageArray(messages)) {
    return c.json({ error: "Expected { messages: { role, content }[] }" }, 400);
  }

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
