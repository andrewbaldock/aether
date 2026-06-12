import { useCallback, useRef, useState } from "react";
import type { CompositionPlan } from "../lib/composition";
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
  getOrCreateSession: (graphMode?: boolean) => Promise<string>;
  refreshSessions: () => void;
  // Knowledge Graph mode for this conversation. Read via a ref at send time so
  // it's always current; gates the build_knowledge_graph tool on the backend.
  graphMode: boolean;
  // The Claude model id for this conversation. Read via a ref at send time.
  // Undefined lets the backend fall back to its default.
  model?: string;
}

export interface UseChatResult {
  // `text` is sent to the model; `displayText`, when given, is what's shown in the
  // transcript instead (e.g. a terse "Update the Timeline" bubble standing in for a
  // long fill instruction the user shouldn't have to read). The model never sees
  // displayText; the transcript never shows the verbose text.
  sendMessage: (text: string, displayText?: string) => Promise<void>;
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
  graphMode,
  model,
}: UseChatOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bus = useAgentEvents();

  // Keep a ref to the latest messages so SSE callbacks can read the current
  // list without stale-closure issues — we mutate the ref each render.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Same pattern for graphMode — current at send time without re-creating the
  // sendMessage closure.
  const graphModeRef = useRef(graphMode);
  graphModeRef.current = graphMode;

  // Same pattern for the selected model.
  const modelRef = useRef(model);
  modelRef.current = model;

  // Stream lifecycle guards. abortRef stops the fetch; epochRef invalidates any
  // late writes from a stream that's already been superseded (new send, or the
  // user switching conversations mid-stream).
  const abortRef = useRef<AbortController | null>(null);
  const epochRef = useRef(0);

  const abortStream = useCallback(() => {
    const wasInFlight = abortRef.current !== null;
    abortRef.current?.abort();
    abortRef.current = null;
    epochRef.current++;
    // Bumping the epoch above invalidates the in-flight sendMessage's `finally`
    // guard, so it won't clear isLoading itself — clear it here. Callers that
    // immediately start a new turn (conversation switch, superseding send) set it
    // true again right after; a standalone user "stop" relies on this to reset.
    if (wasInFlight) setIsLoading(false);
    // A turn that's torn down (conversation switch, or a new send superseding
    // this one) emits no done/error over the wire — the fetch just rejects with
    // AbortError. Without a terminal signal, bus listeners that track per-turn
    // activity (e.g. the graph "mapping…" spinner) would hang on forever. Emit
    // idle so they reset. Only when something was actually in flight.
    if (wasInFlight) bus.emit({ type: "idle" });
  }, [bus]);

  async function sendMessage(text: string, displayText?: string) {
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

    // What the transcript shows. The full `text` still goes to the model below
    // (see the request body); displayText only swaps the on-screen bubble.
    const shownText = displayText ?? text;
    const next: Message[] = [
      ...messagesRef.current,
      { id: crypto.randomUUID(), role: "user", text: shownText },
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
      // from page loads and hot reloads. Pass the current graph mode so a
      // brand-new session is created already carrying the inherited value.
      const currentGraphMode = graphModeRef.current;
      const resolvedSessionId = await getOrCreateSession(currentGraphMode);

      // On the first turn the session row was just created (still untitled).
      // Refresh now so it appears in the sidebar immediately — the user shouldn't
      // wait for the whole answer to stream before their conversation shows up.
      // The post-[DONE] refresh below then swaps the provisional label for the
      // auto-assigned title. Guard against a superseded stream firing stale.
      if (isFirstTurn && epoch === epochRef.current) refreshSessions();

      // The model sees the full instruction for this turn even when the transcript
      // shows a terser stand-in. Every prior message uses its stored text; only the
      // just-added user turn swaps in the real `text`, plus displayText so the
      // backend persists the stand-in (not the verbose prompt) for reload.
      const wireMessages = next.map((m, i) =>
        i === next.length - 1 && displayText
          ? { role: m.role, content: text, displayText }
          : { role: m.role, content: m.text }
      );
      const requestInit: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: wireMessages,
          sessionId: resolvedSessionId,
          userId,
          graphMode: currentGraphMode,
          model: modelRef.current,
        }),
        signal: controller.signal,
      };

      // The Fly backend can scale to zero; a request landing during a
      // cold-start window gets a transient 502/503/504 from the proxy before
      // the app runs. Retry once after a short backoff — safe because nothing
      // has streamed yet (no body consumed). Never retry once bytes arrive.
      let res = await fetch("/api/chat", requestInit);
      if ([502, 503, 504].includes(res.status)) {
        await new Promise((r) => setTimeout(r, 1500));
        if (epoch === epochRef.current) {
          res = await fetch("/api/chat", requestInit);
        }
      }

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
            // Clear any lingering status blurb now the turn is complete.
            updateAssistant((m) => ({ ...m, toolActivity: undefined }));
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
            label?: string;
            plan?: CompositionPlan;
          };

          if (event.type === "text" && event.content) {
            bus.emit({ type: "text", content: event.content });
            // Real answer text supersedes any status blurb — clear the activity
            // line so it doesn't hang above the streaming reply.
            updateAssistant((m) => ({
              ...m,
              text: m.text + event.content,
              toolActivity: undefined,
            }));
          } else if (event.type === "status" && event.message) {
            // Display-only blurb for the activity indicator. Reuses the same
            // toolActivity slot as tool_start so there's a single status line.
            bus.emit({ type: "status", message: event.message });
            updateAssistant((m) => ({ ...m, toolActivity: event.message }));
          } else if (event.type === "tool_start" && event.tool) {
            bus.emit({
              type: "tool_start",
              tool: event.tool,
              input: event.input,
            });
            updateAssistant((m) => ({
              ...m,
              // Prefer the backend's human-readable label; fall back to the bare
              // tool name so an older/missing label still renders something.
              toolActivity: event.label ?? `Using ${event.tool}…`,
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
          } else if (event.type === "plan" && event.plan) {
            // The planner's abstract composition plan. BigsailPlanProvider stores
            // the latest; the canvas consumes it to order cards / draw edges.
            bus.emit({ type: "plan", plan: event.plan });
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
      // Only the current stream owns the loading flag + abort handle.
      if (epoch === epochRef.current) {
        setIsLoading(false);
        abortRef.current = null;
      }
    }
  }

  return { sendMessage, abortStream, isLoading, error };
}
