import { useCallback, useRef, useState } from "react";
import { useAgentEvents } from "./AgentEventContext";
import { parseSseChunk } from "./parseSseChunk";

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

export interface UseChatResult {
  sendMessage: (text: string) => Promise<void>;
  // Cancels any in-flight stream and invalidates its late writes. Called when
  // the user switches or starts a conversation so a previous turn can't bleed
  // tokens into the new view.
  abortStream: () => void;
  isLoading: boolean;
  error: string | null;
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

  // Stream lifecycle guards. abortRef stops the fetch; epochRef invalidates any
  // late writes from a stream that's already been superseded (new send, or the
  // user switching conversations mid-stream).
  const abortRef = useRef<AbortController | null>(null);
  const epochRef = useRef(0);

  const abortStream = useCallback(() => {
    abortRef.current?.abort();
    epochRef.current++;
  }, []);

  async function sendMessage(text: string) {
    // Supersede any in-flight stream so its late writes are dropped.
    abortRef.current?.abort();
    const epoch = ++epochRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    bus.emit({ type: "request_start" });

    // Whether this is the session's first turn — gates the post-[DONE] refresh,
    // since a title is only assigned on the first turn. Measured before we
    // append the user message + assistant placeholder.
    const isFirstTurn = messagesRef.current.length === 0;

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
      // Drop late writes if this stream has been superseded — otherwise we'd
      // map over (and overwrite) a different conversation's messages.
      if (epoch !== epochRef.current) return;
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
        signal: controller.signal,
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

        const { events, remaining } = parseSseChunk(
          buffer,
          decoder.decode(value, { stream: true })
        );
        buffer = remaining;

        for (const data of events) {
          if (data === "[DONE]") {
            bus.emit({ type: "done" });
            // Only refresh on the first turn — that's when a title is assigned;
            // later turns don't change the sidebar, so skip the 50-row refetch.
            // Guard against a superseded stream firing a stale refresh.
            if (isFirstTurn && epoch === epochRef.current) refreshSessions();
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
          } else if (event.type === "warning") {
            // The turn streamed fine but couldn't be persisted. Surface it
            // without stripping the assistant message — it's on screen, just
            // not saved.
            if (epoch === epochRef.current) {
              setError(event.message ?? "This message could not be saved.");
            }
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
      // Intentional abort (send superseded, or conversation switched) — leave
      // the new view untouched. The epoch guard already dropped late writes.
      if (e instanceof DOMException && e.name === "AbortError") return;
      // A superseded stream that errored some other way: don't touch the
      // current view either.
      if (epoch !== epochRef.current) return;
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
      // Only the current stream owns the loading flag.
      if (epoch === epochRef.current) setIsLoading(false);
    }
  }

  return { sendMessage, abortStream, isLoading, error };
}
