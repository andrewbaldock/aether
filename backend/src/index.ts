import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  createSession,
  deleteSession,
  getMessages,
  listSessions,
  saveMessage,
  updateSessionTitle,
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

  const persist =
    typeof sessionId === "string" &&
    sessionId.length > 0 &&
    typeof userId === "string" &&
    userId.length > 0;

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
          if (persist && lastUserMessage) {
            try {
              await saveMessage(
                sessionId as string,
                "user",
                lastUserMessage.content
              );
              await saveMessage(
                sessionId as string,
                "assistant",
                assistantText
              );

              // Auto-title the session from the first user message if it has no
              // title yet — we do a best-effort update, errors are non-fatal.
              const sessions = await listSessions(userId as string);
              const session = sessions.find((s) => s.id === sessionId);
              if (session && !session.title && lastUserMessage.content) {
                const title = lastUserMessage.content.slice(0, 60);
                await updateSessionTitle(sessionId as string, title).catch(
                  () => {}
                );
              }
            } catch (err) {
              console.error("Failed to persist chat turn:", err);
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
