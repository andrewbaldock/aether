import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { type ChatMessage, createClient } from "./llm";

// The Aether backend: a small Hono server that holds the API keys and talks to
// the LLM. The frontend (Vite, :5173) proxies /api here. Chat turns stream
// token-by-token via SSE so the UI updates as Claude generates.

const app = new Hono();
const llm = createClient();

// Trivial liveness check — usable before any API key is set.
app.get("/api/health", (c) => c.json({ ok: true }));

// One chat turn. The frontend posts the full conversation; we stream tokens
// back as SSE events. The server is stateless — history is sent each turn.
app.post("/api/chat", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON" }, 400);
  }

  const messages = (body as { messages?: unknown }).messages;
  if (!isChatMessageArray(messages)) {
    return c.json({ error: "Expected { messages: { role, content }[] }" }, 400);
  }

  return streamSSE(c, async (stream) => {
    try {
      await llm.stream(
        messages,
        async (token) => {
          await stream.writeSSE({
            data: JSON.stringify({ type: "text", content: token }),
          });
        },
        async () => {
          await stream.writeSSE({ data: "[DONE]" });
        }
      );
    } catch (err) {
      console.error("POST /api/chat stream failed:", err);
      const message =
        err instanceof Error ? err.message : "Failed to get a reply from the model";
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

// Bun's native server: exporting { port, fetch } is all it takes to serve.
export default {
  port: Number.isFinite(port) ? port : 8000,
  fetch: app.fetch,
};
