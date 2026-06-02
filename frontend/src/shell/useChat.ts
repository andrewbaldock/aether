import { useRef, useState } from "react";
import { useAgentEvents } from "./AgentEventContext";

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolActivity?: string;
}

interface UseChatOptions {
  userId: string;
  messages: Message[];
  onMessagesChange: (messages: Message[]) => void;
  // Called just before the first message is sent — creates a session lazily
  // so page loads and hot reloads don't spawn orphan sessions.
  getOrCreateSession: () => Promise<string>;
  refreshSessions: () => void;
}

// Owns the streaming connection to the backend. Message state lives in
// SessionContext (via messages + onMessagesChange) so the Sidebar can hydrate
// it when switching sessions without re-mounting this hook.
export function useChat({
  userId,
  messages,
  onMessagesChange,
  getOrCreateSession,
  refreshSessions,
}: UseChatOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bus = useAgentEvents();

  // Keep a ref to the latest messages so SSE callbacks can read the current
  // list without stale-closure issues — we mutate the ref each render.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  async function sendMessage(text: string) {
    bus.emit({ type: "request_start" });

    const next: Message[] = [
      ...messagesRef.current,
      { id: crypto.randomUUID(), role: "user", text },
    ];
    onMessagesChange(next);
    setIsLoading(true);
    setError(null);

    const assistantId = crypto.randomUUID();
    const withPlaceholder: Message[] = [
      ...next,
      { id: assistantId, role: "assistant", text: "" },
    ];
    onMessagesChange(withPlaceholder);
    messagesRef.current = withPlaceholder;

    function updateAssistant(updater: (m: Message) => Message) {
      const updated = messagesRef.current.map((m) =>
        m.id === assistantId ? updater(m) : m
      );
      messagesRef.current = updated;
      onMessagesChange(updated);
    }

    try {
      // Create the session lazily on first message — avoids orphan sessions
      // from page loads and hot reloads.
      const resolvedSessionId = await getOrCreateSession();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.text })),
          sessionId: resolvedSessionId,
          userId,
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

          if (data === "[DONE]") {
            bus.emit({ type: "done" });
            // Refresh after done so the sidebar picks up the saved title.
            refreshSessions();
            break outer;
          }

          const event = JSON.parse(data) as {
            type: string;
            content?: string;
            message?: string;
            tool?: string;
            input?: unknown;
            result?: string;
            iteration?: number;
          };

          if (event.type === "text" && event.content) {
            bus.emit({ type: "text", content: event.content });
            updateAssistant((m) => ({ ...m, text: m.text + event.content }));
          } else if (event.type === "tool_start" && event.tool) {
            bus.emit({
              type: "tool_start",
              tool: event.tool,
              input: event.input,
            });
            updateAssistant((m) => ({
              ...m,
              toolActivity: `Using ${event.tool}…`,
            }));
          } else if (event.type === "tool_result" && event.tool) {
            bus.emit({
              type: "tool_result",
              tool: event.tool,
              result: event.result ?? "",
            });
            updateAssistant((m) => ({ ...m, toolActivity: undefined }));
          } else if (event.type === "loop_start") {
            bus.emit({ type: "loop_start", iteration: event.iteration ?? 0 });
          } else if (event.type === "error") {
            bus.emit({
              type: "error",
              message: event.message ?? "Unknown error from server",
            });
            throw new Error(event.message ?? "Unknown error from server");
          }
        }
      }
    } catch (e) {
      // Remove the assistant placeholder on error — partial content is misleading.
      const withoutPlaceholder = messagesRef.current.filter(
        (m) => m.id !== assistantId
      );
      messagesRef.current = withoutPlaceholder;
      onMessagesChange(withoutPlaceholder);
      const message = e instanceof Error ? e.message : "Something went wrong";
      setError(message);
      bus.emit({ type: "error", message });
    } finally {
      setIsLoading(false);
    }
  }

  return { sendMessage, isLoading, error };
}
