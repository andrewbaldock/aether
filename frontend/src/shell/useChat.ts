import { useState } from "react";

// One message in the transcript. `id` is a render key, local to the frontend —
// it's not sent to the backend.
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

// Owns the conversation state and the round-trip to the backend. ChatPanel stays
// a view; this hook does the work. Plain fetch + useState is right for now —
// streaming (and TanStack Query, if it earns its place) come later.
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(text: string) {
    // Append the user's message and post the full history — the server is
    // stateless, so each turn carries the whole conversation.
    const next: Message[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", text },
    ];
    setMessages(next);
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          body != null &&
          typeof body === "object" &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }

      const data = (await res.json()) as { reply?: unknown };
      if (typeof data.reply !== "string")
        throw new Error("Malformed response from server");
      const reply = data.reply;
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: reply },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return { messages, sendMessage, isLoading, error };
}
