import type { SseEvent } from "@contract/sse";
import * as Sentry from "@sentry/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { type Session, sessionsKey } from "../hooks/useSessionList";
import { track } from "../lib/analytics";
import { useAgentEvents } from "./AgentEventContext";
import { parseSseChunk } from "./parseSseChunk";

// Render tools whose completion means a widget was produced this turn — the
// success signal for the render-tool features. build_knowledge_graph is tracked
// separately (its own feature), so it's not in this set.
const RENDER_TOOLS = new Set([
  "render_table",
  "render_chart",
  "render_timeline",
  "render_images",
]);

// An ephemeral attachment for a turn — an image or PDF carried inline as base64.
// Mirrors the backend Attachment wire shape, plus a client-only `name`/`previewUrl`
// for rendering chips. Never persisted: only the just-sent user turn carries these,
// and reloading a conversation shows the text only (the bytes are gone).
export interface Attachment {
  kind: "image" | "document";
  mediaType: string;
  data: string; // base64, no data: URI prefix
  name: string; // filename or a synthesized label, shown on the chip
  previewUrl?: string; // object URL for image thumbnails (images only)
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  // Attachments shown alongside this user bubble for the current turn. Live state
  // only — not restored on reload (attachments are ephemeral).
  attachments?: Attachment[];
  toolActivity?: string;
  // Tappable clarifier options, set when the planner asked ONE expanding question
  // this turn (the question is the message `text`). ChatPanel renders these as
  // chips; tapping one sends a follow-up turn flagged `clarified` so the planner
  // won't clarify again. Absent on every normal turn.
  clarifyOptions?: string[];
  // ISO timestamp. On reload it's the DB `created_at`; for a live turn it's
  // stamped client-side at creation (within a second of the DB value, which
  // replaces it on the next reload). Drives the relative "3 hours ago" label.
  createdAt?: string;
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
  // displayText; the transcript never shows the verbose text. `opts.clarified` marks
  // a turn that answers a prior clarifier, so the backend planner won't clarify
  // again (no interrogation loops).
  sendMessage: (
    text: string,
    displayText?: string,
    opts?: { clarified?: boolean; attachments?: Attachment[] }
  ) => Promise<void>;
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
  const queryClient = useQueryClient();

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

  // FIFO of messages the user sent while a turn was already streaming. Each is
  // already shown as a user bubble (appended at enqueue time); we hold only what
  // the next turn needs to fire. Drained one-at-a-time as each turn completes.
  const queueRef = useRef<
    {
      text: string;
      displayText?: string;
      clarified?: boolean;
      attachments?: Attachment[];
    }[]
  >([]);

  const abortStream = useCallback(() => {
    // A manual stop also discards anything the user had queued behind this turn —
    // stopping means "I'm done", not "skip to the next queued message".
    queueRef.current = [];
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

  // Public send. Always appends the user bubble immediately. If a turn is already
  // streaming, the new message is queued (FIFO) and fired when that turn ends —
  // the send button stays a Send button while text is present, so users can stack
  // follow-ups instead of having to wait or stop. Otherwise the turn runs now.
  async function sendMessage(
    text: string,
    displayText?: string,
    opts?: { clarified?: boolean; attachments?: Attachment[] }
  ) {
    // What the transcript shows. The full `text` still goes to the model later;
    // displayText only swaps the on-screen bubble.
    const shownText = displayText ?? text;
    const attachments = opts?.attachments;
    // A turn answering a prior clarifier — the "did the clarify flow convert?" signal.
    if (opts?.clarified) track("clarify_answered");
    const withUser: Message[] = [
      ...messagesRef.current,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: shownText,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
        createdAt: new Date().toISOString(),
      },
    ];
    onMessagesChange(withUser);
    messagesRef.current = withUser;

    // A turn is in flight — queue this one and let the current turn's drain pick
    // it up. The bubble is already on screen; only the send payload waits.
    if (abortRef.current !== null) {
      queueRef.current.push({
        text,
        displayText,
        clarified: opts?.clarified,
        attachments,
      });
      return;
    }

    await runTurn(text, displayText, opts?.clarified, attachments);
  }

  // Runs one network turn. The user bubble for `text` is already in
  // messagesRef.current (appended by sendMessage or a prior drain). On completion
  // it drains the next queued message, so a backlog fires in order.
  async function runTurn(
    text: string,
    displayText?: string,
    clarified?: boolean,
    attachments?: Attachment[]
  ) {
    // Supersede any lingering aborted stream so its late writes are dropped.
    abortRef.current?.abort();
    const epoch = ++epochRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    bus.emit({ type: "request_start" });

    // The message list including this turn's user bubble but not yet the assistant
    // placeholder — used for the wire payload and the first-turn check.
    const next = messagesRef.current;

    // Whether this is the session's first turn — gates the post-[DONE] refresh,
    // since a title is only assigned on the first turn. The user bubble is already
    // present, so the first turn has exactly one message.
    const isFirstTurn = next.length === 1;

    // Product-analytics signals for the chat loop. conversation_started fires once
    // per session (only the first turn); message_sent on every turn, carrying the
    // dimensions the funnels slice by.
    if (isFirstTurn)
      track("conversation_started", { graphMode: graphModeRef.current });
    track("message_sent", {
      isFirstTurn,
      graphMode: graphModeRef.current,
      model: modelRef.current,
      hasAttachments: !!(attachments && attachments.length > 0),
      clarified: !!clarified,
    });

    setIsLoading(true);
    setError(null);

    // The user bubble for this turn is the last message in `next` — capture its
    // id so the `persisted` event can swap it for the real DB id (step 8b).
    const localUserId = next.at(-1)?.id;

    const assistantId = crypto.randomUUID();
    const withPlaceholder: Message[] = [
      ...next,
      {
        id: assistantId,
        role: "assistant",
        text: "",
        createdAt: new Date().toISOString(),
      },
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
      //
      // Skip any prior messages persisted with empty content (e.g. an assistant
      // row from a turn that errored before streaming). They add nothing for the
      // model and would fail the backend's non-empty-content validation, breaking
      // otherwise-valid saved conversations. The just-added user turn is always
      // last and never empty, so the displayText swap below stays aligned.
      // Keep the just-added user turn even when its text is empty — an image- or
      // PDF-only message has no prose but must still be sent (the backend accepts
      // empty content when attachments are present). Prior empty rows are still
      // dropped (errored assistant placeholders add nothing and fail validation).
      const sendable = next.filter(
        (m, i) => m.text.trim().length > 0 || i === next.length - 1
      );
      // Only the wire fields go over the network — strip the client-only
      // name/previewUrl. Attachments ride only the final (just-sent) user turn.
      const wireAttachments =
        attachments && attachments.length > 0
          ? attachments.map((a) => ({
              kind: a.kind,
              mediaType: a.mediaType,
              data: a.data,
            }))
          : undefined;
      const wireMessages = sendable.map((m, i) => {
        const isLast = i === sendable.length - 1;
        return {
          role: m.role,
          content: isLast && displayText ? text : m.text,
          ...(isLast && displayText ? { displayText } : {}),
          ...(isLast && wireAttachments
            ? { attachments: wireAttachments }
            : {}),
        };
      });
      const requestInit: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: wireMessages,
          sessionId: resolvedSessionId,
          userId,
          graphMode: currentGraphMode,
          model: modelRef.current,
          // Marks a turn that answers a prior clarifier — the backend planner
          // won't clarify again (no interrogation loops).
          ...(clarified ? { clarified: true } : {}),
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
            // No refresh here: the first-turn title now arrives as a `titled` SSE
            // event (handled below) and is patched straight into the session cache,
            // so there's nothing left to refetch on [DONE].
            break outer;
          }

          // SseEvent is the shared FE↔BE contract union (@contract/sse) — see the
          // import at the top of this file. The reader narrows on `event.type`.
          // One malformed event line must not kill the whole stream. A truncated
          // or non-JSON line (mid-chunk split, proxy hiccup) would otherwise throw
          // out of the read loop and abort the turn — skip it and keep reading.
          let event: SseEvent;
          try {
            event = JSON.parse(data) as SseEvent;
          } catch {
            console.warn("[useChat] skipping unparseable SSE line:", data);
            continue;
          }

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
            // Feature-success signal: a widget was actually produced this turn.
            if (event.tool === "build_knowledge_graph")
              track("knowledge_graph_built");
            else if (RENDER_TOOLS.has(event.tool))
              track("tool_rendered", { tool: event.tool });
            updateAssistant((m) => ({ ...m, toolActivity: undefined }));
          } else if (event.type === "tool_partial" && event.tool) {
            // Streamed render-tool spec — widgets re-parse it to paint as it
            // arrives. Bus-only: no message-state change (no transcript text), so
            // non-subscribers don't re-render mid-stream.
            bus.emit({
              type: "tool_partial",
              tool: event.tool,
              partialJson: event.partialJson ?? "",
              isComplete: event.isComplete ?? false,
            });
          } else if (event.type === "loop_start") {
            bus.emit({ type: "loop_start", iteration: event.iteration ?? 0 });
          } else if (event.type === "plan" && event.plan) {
            // The planner's abstract composition plan. BigsailPlanProvider stores
            // the latest; the canvas consumes it to order cards / draw edges.
            bus.emit({ type: "plan", plan: event.plan });
          } else if (
            event.type === "clarify" &&
            event.question &&
            Array.isArray(event.options)
          ) {
            // The planner asked ONE expanding question instead of composing. The
            // question text already streamed as this assistant message's `text`;
            // stash the options on the message so ChatPanel renders tappable chips.
            // Also emit on the bus so Bigsail shows its "let's aim this first" state.
            const options = event.options;
            updateAssistant((m) => ({ ...m, clarifyOptions: options }));
            bus.emit({
              type: "clarify",
              question: event.question,
              options,
            });
          } else if (
            event.type === "persisted" &&
            event.userId &&
            event.assistantId
          ) {
            // The turn was saved; swap our client placeholder ids for the real
            // DB row ids so a later delete this session targets the right rows.
            // Drop if this stream has been superseded.
            if (epoch === epochRef.current) {
              const remap = new Map<string, string>();
              if (localUserId) remap.set(localUserId, event.userId);
              remap.set(assistantId, event.assistantId);
              const updated = messagesRef.current.map((m) => {
                const remapped = remap.get(m.id);
                return remapped ? { ...m, id: remapped } : m;
              });
              messagesRef.current = updated;
              onMessagesChange(updated);
            }
          } else if (
            event.type === "titled" &&
            event.sessionId &&
            event.title
          ) {
            // The first-turn auto-title landed. Patch the named row's title/icon
            // straight into the session-list cache — no refetch, and no race with
            // the title write (it's already persisted backend-side by now). Drop if
            // this stream has been superseded.
            if (epoch === epochRef.current) {
              const { sessionId: titledId, title, icon } = event;
              queryClient.setQueryData<Session[]>(sessionsKey(userId), (rows) =>
                rows?.map((r) =>
                  r.id === titledId ? { ...r, title, topic_icon: icon } : r
                )
              );
            }
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
      // The chat stream uses a raw fetch (not the query/mutation cache), so its
      // failures don't flow through logApiError — report them here. Real errors
      // only; the AbortError/superseded cases returned above.
      Sentry.captureException(e);
      setError(message);
      bus.emit({ type: "error", message });
    } finally {
      // Only the current stream owns the loading flag + abort handle.
      if (epoch === epochRef.current) {
        abortRef.current = null;
        // Drain the next queued message, if any. Its user bubble is already on
        // screen (appended at enqueue time); fire its turn now. Keep isLoading
        // true across the handoff so the indicator doesn't flicker between turns.
        const queued = queueRef.current.shift();
        if (queued) {
          // Not awaited: this finally must unwind so the current turn settles
          // before the next one mutates refs. runTurn re-arms abortRef/epoch.
          void runTurn(
            queued.text,
            queued.displayText,
            queued.clarified,
            queued.attachments
          );
        } else {
          setIsLoading(false);
        }
      }
    }
  }

  return { sendMessage, abortStream, isLoading, error };
}
