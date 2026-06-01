import { useState } from "react";

// One message in the transcript. `id` is a render key, local to the frontend —
// it's not sent to the backend.
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

// Owns the conversation state and the streaming connection to the backend.
// Tokens arrive as SSE events and are appended to the last assistant message
// as they come in, so the UI updates in real time.
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(text: string) {
    const next: Message[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", text },
    ];
    setMessages(next);
    setIsLoading(true);
    setError(null);

    // Placeholder for the assistant's reply — appended to as tokens arrive.
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "" },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.text })),
        }),
      });

      if (!res.ok || !res.body) {
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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);

          if (data === "[DONE]") break outer;

          const event = JSON.parse(data) as {
            type: string;
            content?: string;
            message?: string;
          };

          if (event.type === "text" && event.content) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, text: m.text + event.content }
                  : m
              )
            );
          } else if (event.type === "error") {
            throw new Error(event.message ?? "Unknown error from server");
          }
        }
      }
    } catch (e) {
      // Always remove the assistant placeholder on error — partial content is
      // misleading without any indication the response was cut short.
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return { messages, sendMessage, isLoading, error };
}
