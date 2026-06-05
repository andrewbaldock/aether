import { type FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingGlyph } from "../brand/ThinkingGlyph";
import { Wordmark } from "../brand/Wordmark";
import { useCapabilities } from "../capabilities/useCapabilities";
import { AGENT_DIAGRAM_WIDGET } from "../capabilities/widgets/AgentDiagram";
import { KNOWLEDGE_GRAPH_WIDGET } from "../capabilities/widgets/KnowledgeGraph";
import { useAgentEvents } from "./AgentEventContext";
import { useSessionContext } from "./SessionContext";
import { useChat } from "./useChat";

// Seed for a brand-new conversation's graph mode (until its session row exists).
// Defaults to true — "Aether opens this way by default."
const LAST_GRAPH_MODE_KEY = "aether-last-graph-mode";

function readLastGraphMode(): boolean {
  return localStorage.getItem(LAST_GRAPH_MODE_KEY) !== "false";
}

export function ChatPanel() {
  const {
    userId,
    sessionId,
    sessions,
    messages,
    onMessagesChange: setMessages,
    getOrCreateSession,
    refreshSessions,
    registerAbort,
  } = useSessionContext();

  // Graph mode is derived from the active session row (single source of truth).
  // Before a session exists, fall back to the last-used value so a new
  // conversation inherits the prior choice.
  const [lastGraphMode, setLastGraphMode] = useState(readLastGraphMode);
  const currentSession = sessions.find((s) => s.id === sessionId);
  const graphMode = currentSession ? currentSession.graph_mode : lastGraphMode;

  const { sendMessage, abortStream, isLoading, error } = useChat({
    userId,
    messages,
    onMessagesChange: setMessages,
    getOrCreateSession,
    refreshSessions,
    graphMode,
  });

  // Let the session context cancel an in-flight stream before switching
  // conversations.
  useEffect(() => {
    registerAbort(abortStream);
  }, [registerAbort, abortStream]);
  const { open, activate } = useCapabilities();
  const bus = useAgentEvents();
  const [draft, setDraft] = useState("");
  const started = messages.length > 0;
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When graph mode is on, make sure the Knowledge Graph tab exists so it's ready
  // before the first graph data arrives.
  useEffect(() => {
    if (graphMode) open(KNOWLEDGE_GRAPH_WIDGET);
  }, [graphMode, open]);

  // Auto-open + activate the KG tab on the first graph-data event of a session.
  // The widget can't open itself before it's mounted, so ChatPanel (which has
  // useCapabilities) does it from the bus.
  useEffect(() => {
    const unsubscribe = bus.subscribe((event) => {
      if (
        event.type === "tool_result" &&
        event.tool === "build_knowledge_graph"
      ) {
        open(KNOWLEDGE_GRAPH_WIDGET);
        activate(KNOWLEDGE_GRAPH_WIDGET.id);
      }
    });
    return unsubscribe;
  }, [bus, open, activate]);

  // "Explore further" from a graph node: the widget emits an explore_request on
  // the bus; here we turn it into a real chat turn (only when not mid-stream).
  useEffect(() => {
    const unsubscribe = bus.subscribe((event) => {
      if (event.type === "explore_request" && !isLoading) {
        sendMessage(event.prompt);
      }
    });
    return unsubscribe;
  }, [bus, sendMessage, isLoading]);

  // Toggle graph mode. Updates the seed for the next new conversation, and (if a
  // session exists) persists to the session row, then refreshes so the derived
  // `graphMode` recomputes from the row.
  function toggleGraphMode() {
    const nextValue = !graphMode;
    localStorage.setItem(LAST_GRAPH_MODE_KEY, String(nextValue));
    setLastGraphMode(nextValue);
    if (nextValue) {
      open(KNOWLEDGE_GRAPH_WIDGET);
      activate(KNOWLEDGE_GRAPH_WIDGET.id);
    }
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph_mode: nextValue }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          refreshSessions();
        })
        .catch((err) => console.error("Failed to update graph mode:", err));
    }
  }

  // The eyeball: a momentary reveal of the Data Flow tab. Opens the column if
  // closed and surfaces that tab — no longer a sticky on/off mode.
  function revealDataFlow() {
    open(AGENT_DIAGRAM_WIDGET);
    activate(AGENT_DIAGRAM_WIDGET.id);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are triggers, not values the effect reads
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  function submit() {
    const text = draft.trim();
    if (!text || isLoading) return;
    setDraft("");
    sendMessage(text);
    textareaRef.current?.focus();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="relative flex h-full flex-col bg-surface">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {!started && (
          <div className="mx-auto mt-20 flex max-w-md flex-col items-center gap-4 text-center">
            <Wordmark height={56} />
            <p className="text-lg font-medium text-content">I Use Tools</p>
            <p className="text-sm text-content-muted">
              {graphMode
                ? "Knowledge Graph is on — just start talking and I'll map the people, places, and ideas as a live diagram beside us."
                : "Ask me anything. Flip on Knowledge Graph (the node icon below) and I'll map the conversation as a live diagram beside us."}
            </p>
          </div>
        )}
        <ul className="mx-auto max-w-2xl space-y-4">
          {messages.map((m) => (
            <li
              key={m.id}
              className={
                m.role === "user" ? "flex justify-end" : "flex justify-start"
              }
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-2xl bg-elevated px-4 py-2 text-sm text-content"
                    : "max-w-[80%] px-4 py-2 text-sm text-content"
                }
              >
                {m.role === "user" ? (
                  m.text
                ) : (
                  <>
                    {m.toolActivity && (
                      <div className="mb-1 text-xs text-content-subtle italic">
                        {m.toolActivity}
                      </div>
                    )}
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => (
                          <p className="mb-2 last:mb-0">{children}</p>
                        ),
                        h1: ({ children }) => (
                          <h1 className="mb-2 text-base font-semibold">
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="mb-2 text-sm font-semibold">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="mb-1 text-sm font-medium">
                            {children}
                          </h3>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-2 list-disc pl-4 space-y-0.5">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="mb-2 list-decimal pl-4 space-y-0.5">
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => <li>{children}</li>,
                        code: ({
                          inline,
                          children,
                        }: {
                          inline?: boolean;
                          children?: React.ReactNode;
                        }) =>
                          inline ? (
                            <code className="rounded bg-elevated px-1 py-0.5 font-mono text-xs">
                              {children}
                            </code>
                          ) : (
                            <code>{children}</code>
                          ),
                        pre: ({ children }) => (
                          <pre className="mb-2 overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs">
                            {children}
                          </pre>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="mb-2 border-l-2 border-border-strong pl-3 text-content-muted">
                            {children}
                          </blockquote>
                        ),
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            className="underline hover:text-content"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {children}
                          </a>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold">{children}</strong>
                        ),
                        hr: () => <hr className="my-2 border-border-strong" />,
                      }}
                    >
                      {m.text}
                    </ReactMarkdown>
                  </>
                )}
              </div>
            </li>
          ))}
          {started && (
            <li className="flex justify-start px-4 py-1">
              <ThinkingGlyph height={36} animate={isLoading} />
            </li>
          )}
          {error && (
            <li className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl bg-danger-surface px-4 py-2 text-sm text-danger-content">
                {error}
              </div>
            </li>
          )}
        </ul>
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className={
          started
            ? "p-4 transition-all duration-600 ease-in-out"
            : "absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 transition-all duration-600 ease-in-out"
        }
      >
        <div
          className={`relative mx-auto rounded-lg border bg-elevated transition-colors max-w-2xl ${isLoading ? "aether-loading-border" : "border-border-strong focus-within:border-content-subtle"}`}
        >
          <textarea
            ref={textareaRef}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Shift+Enter for newline)"
            rows={1}
            className={`w-full resize-none bg-transparent px-4 pt-3 pb-10 text-sm text-content placeholder:text-content-subtle focus:outline-none transition-opacity${isLoading ? " opacity-50" : ""}${started ? "" : " min-h-24"}`}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            {/* Knowledge Graph — a per-conversation MODE toggle. */}
            <div className="group relative flex">
              <button
                type="button"
                onClick={toggleGraphMode}
                aria-label="Knowledge Graph"
                aria-pressed={graphMode}
                className={
                  graphMode
                    ? "rounded-lg border border-border-strong bg-border-strong p-1.5 text-content"
                    : "rounded-lg border border-transparent p-1.5 text-content-muted hover:bg-border-strong hover:text-content"
                }
              >
                <GraphIcon />
              </button>
              <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-64 rounded-md bg-surface-overlay px-2.5 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                <span className="font-semibold">
                  Knowledge Graph · {graphMode ? "On" : "Off"}
                </span>
                <br />
                {graphMode
                  ? "I'm extracting entities and relationships as we talk and rendering them through the graphing plugin beside us. Click to turn off."
                  : "Turn on to map this conversation as a live graph. Click to turn on."}
                <br />
                <span className="text-white/60">
                  Just one plugin in Aether's capability column — the same seam
                  can render charts, tables, or live 3D scenes. Anything.
                </span>
              </span>
            </div>
            {/* Eyeball — a momentary reveal of the Data Flow tab. */}
            <div className="group relative flex">
              <button
                type="button"
                onClick={revealDataFlow}
                aria-label="Show data flow"
                className="rounded-lg border border-transparent p-1.5 text-content-muted hover:bg-border-strong hover:text-content"
              >
                <EyeIcon />
              </button>
              <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-56 rounded-md bg-surface-overlay px-2.5 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                <span className="font-semibold">See under the hood</span>
                <br />
                Reveals a live diagram of Aether's agent loop — the request,
                Claude's tokens streaming back, and each tool firing in real
                time.
              </span>
            </div>
            {/* Send */}
            <div className="group relative flex">
              <button
                type="submit"
                aria-label="Send message"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gradient-to-r from-[#fd40a4] to-[#c35ed1] text-2xl leading-none text-white hover:brightness-110 disabled:opacity-40"
                disabled={draft.trim().length === 0 || isLoading}
              >
                <span className={isLoading ? "animate-spin" : ""}>𑁍</span>
              </button>
              <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 whitespace-nowrap rounded-md bg-surface-overlay px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                Send message
              </span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// A node-link glyph: connected circles. Marks the Knowledge Graph mode toggle.
function GraphIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="9" r="2.5" />
      <circle cx="9" cy="18" r="2.5" />
      <path d="M8.1 7.3 15.6 8.1" />
      <path d="M7 8.2 8.4 15.7" />
      <path d="M10.9 16.6 16.4 10.7" />
    </svg>
  );
}

// An eye glyph. Marks the momentary "Show data flow" reveal.
function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
