import { Hono } from "hono";
import { type ChatMessage, createClient } from "./llm";

// The Aether backend: a small Hono server that holds the API keys and talks to
// the LLM. The frontend (Vite, :5173) proxies /api here. No streaming yet — a
// chat turn is one request in, one reply out.

const app = new Hono();
const llm = createClient();

// Trivial liveness check — usable before any API key is set.
app.get("/api/health", (c) => c.json({ ok: true }));

// One chat turn. The frontend posts the full conversation each time (the server
// is stateless); we hand it straight to the connector and return the reply.
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

  try {
    const reply = await llm.complete(messages);
    return c.json({ reply });
  } catch (err) {
    // Log the real error server-side; don't leak SDK/key details to the client.
    console.error("POST /api/chat failed:", err);
    return c.json({ error: "Failed to get a reply from the model" }, 500);
  }
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
