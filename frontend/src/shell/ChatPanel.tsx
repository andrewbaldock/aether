import { Network, Wrench } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingGlyph } from "../brand/ThinkingGlyph";
import { Wordmark } from "../brand/Wordmark";
import { useCapabilities } from "../capabilities/useCapabilities";
import { KNOWLEDGE_GRAPH_WIDGET } from "../capabilities/widgets/KnowledgeGraph";
import { useUpdateSession } from "../hooks/useUpdateSession";
import { useAgentEvents } from "./AgentEventContext";
import { HelpButton } from "./HelpButton";
import { ModelPicker } from "./ModelPicker";
import { useSessionContext } from "./SessionContext";
import { ToolInfoSheet } from "./ToolInfoSheet";
import { useChat } from "./useChat";
import { useIsMobile } from "./useIsMobile";

// Seed for a brand-new conversation's graph mode (until its session row exists).
// Defaults to true — "Aether opens this way by default."
const LAST_GRAPH_MODE_KEY = "aether-last-graph-mode";

function readLastGraphMode(): boolean {
  return localStorage.getItem(LAST_GRAPH_MODE_KEY) !== "false";
}

// Seed for a new conversation's model (until its session row exists). undefined
// means "no explicit choice yet" — the backend uses its default.
const LAST_MODEL_KEY = "aether-last-model";

function readLastModel(): string | undefined {
  return localStorage.getItem(LAST_MODEL_KEY) ?? undefined;
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
  // Current graph mode read inside the bus subscription (avoids re-subscribing
  // every time it flips).
  const graphModeRef = useRef(graphMode);
  graphModeRef.current = graphMode;

  // Model follows the same pattern as graph mode: the active session row is the
  // source of truth; before a session exists, fall back to the last-used value.
  const [lastModel, setLastModel] = useState(readLastModel);
  const model = currentSession
    ? (currentSession.model ?? undefined)
    : lastModel;

  const { sendMessage, abortStream, isLoading, error } = useChat({
    userId,
    messages,
    onMessagesChange: setMessages,
    getOrCreateSession,
    refreshSessions,
    graphMode,
    model,
  });

  // Let the session context cancel an in-flight stream before switching
  // conversations.
  useEffect(() => {
    registerAbort(abortStream);
  }, [registerAbort, abortStream]);
  const { open, ensure, activate } = useCapabilities();
  const isMobile = useIsMobile();
  const updateSession = useUpdateSession(userId);
  const bus = useAgentEvents();
  const [draft, setDraft] = useState("");
  // Mobile-only: the Knowledge Graph info+toggle sheet (no hover tooltips on touch).
  const [kgSheetOpen, setKgSheetOpen] = useState(false);
  const started = messages.length > 0;
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When graph mode is on, make sure the Knowledge Graph tab exists so it's ready
  // before the first graph data arrives. Use `ensure` (mount-only, no activate):
  // activating here would force the mobile full-screen overlay open over an empty
  // graph on load. The overlay surfaces only on real intent — toggling graph mode
  // (below) or graph data arriving (the bus subscription).
  useEffect(() => {
    if (graphMode) ensure(KNOWLEDGE_GRAPH_WIDGET);
  }, [graphMode, ensure]);

  // Surface the KG tab at the right moments so its "mapping…" loading state and
  // the resulting graph are actually on-screen:
  //   • request_start while graph mode is on — activate the tab as the turn
  //     begins, so the loading animation is visible the whole time the model
  //     works (not just when data lands).
  //   • tool_result — belt-and-braces: ensure the tab is up when graph data
  //     arrives, even if graph mode was off at request time.
  // The widget can't open itself before it's mounted, so ChatPanel (which has
  // useCapabilities) does it from the bus.
  useEffect(() => {
    const unsubscribe = bus.subscribe((event) => {
      if (event.type === "request_start" && graphModeRef.current) {
        open(KNOWLEDGE_GRAPH_WIDGET);
        activate(KNOWLEDGE_GRAPH_WIDGET.id);
      } else if (
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
      updateSession.mutate({ id: sessionId, patch: { graph_mode: nextValue } });
    }
  }

  // Pick a model. Mirrors toggleGraphMode: update the seed for the next new
  // conversation, and (if a session exists) persist to the row, then refresh so
  // the derived `model` recomputes from the row.
  function selectModel(nextModel: string) {
    localStorage.setItem(LAST_MODEL_KEY, nextModel);
    setLastModel(nextModel);
    if (sessionId) {
      updateSession.mutate({ id: sessionId, patch: { model: nextModel } });
    }
  }

  // Follow streaming output: re-fire as the last message's text grows (tokens
  // append in place, so messages.length is unchanged mid-stream). Only auto-scroll
  // when the user is already near the bottom — if they scrolled up to read, leave
  // them be. "auto" (not "smooth") keeps up with fast streaming without lagging.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are triggers, not values the effect reads
  useEffect(() => {
    const el = scrollRef.current;
    const nearBottom = el
      ? el.scrollHeight - el.scrollTop - el.clientHeight < 120
      : true;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length, messages.at(-1)?.text, isLoading]);

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
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto px-6 py-6${
          // Empty state on mobile: centre the hero in the scroll region so the
          // wordmark + tagline + the (static) form just beneath read as one
          // centred cluster, rather than split top-and-bottom or jammed at the
          // very bottom behind the URL bar.
          started
            ? ""
            : " max-md:flex max-md:flex-col max-md:items-center max-md:justify-center"
        }`}
      >
        {!started && (
          <div className="mx-auto mt-20 flex w-full max-w-md flex-col items-center gap-4 text-center max-md:mt-0 max-md:gap-3">
            <Wordmark height={72} />
            <div className="flex items-center gap-2.5">
              <Wrench className="h-5 w-5 text-content-muted" aria-hidden />
              <p className="font-display text-lg font-semibold text-content">
                I Can Use Tools
              </p>
              <Network className="h-5 w-5 text-content-muted" aria-hidden />
            </div>
            <p className="text-sm text-content-muted max-md:px-2">
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
            ? // On mobile the form sits at the bottom edge; clear the iOS home
              // indicator with a safe-area bottom inset (no-op on desktop/no inset).
              "p-4 max-md:px-5 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-600 ease-in-out"
            : // Desktop empty state floats the input vertically centred. On mobile
              // that absolute centring collides with the hero copy on a short
              // screen, so keep the form in normal flow (static) — the hero +
              // input + tool row stack and the scroll area centres them.
              "absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 max-md:static max-md:inset-auto max-md:translate-y-0 max-md:px-5 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-600 ease-in-out"
        }
      >
        <div className="mx-auto max-w-2xl">
        <div
          className={`relative rounded-lg border bg-elevated transition-colors ${isLoading ? "aether-loading-border" : "border-border-strong focus-within:border-content-subtle"}`}
        >
          <textarea
            ref={textareaRef}
            value={draft}
            // Don't autofocus on mobile: it slams the keyboard open the moment
            // the app loads (and was part of the on-load zoom). Desktop keeps it.
            autoFocus={!isMobile}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Shift+Enter for newline)"
            rows={1}
            // text-base (16px) on mobile: iOS Safari auto-zooms the page when a
            // focused input has font-size < 16px, and with autoFocus that fires
            // on load — leaving the whole UI zoomed in. 16px disables that zoom.
            className={`w-full resize-none bg-transparent px-4 pt-3 pb-10 text-sm max-md:text-base text-content placeholder:text-content-subtle focus:outline-none transition-opacity${isLoading ? " opacity-50" : ""}${started ? "" : " min-h-24"}`}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            {/* Model picker — which Claude answers this conversation. */}
            <ModelPicker
              value={model}
              onChange={selectModel}
              disabled={isLoading}
            />
            {/* Send */}
            <div className="group relative flex">
              <button
                type="submit"
                onClick={(e) => e.currentTarget.blur()}
                aria-label="Send message"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gradient-to-r from-[#fd40a4] to-[#c35ed1] text-2xl leading-none text-white hover:brightness-110 disabled:opacity-40 max-md:h-11 max-md:w-11"
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

        {/* Tool row — Aether's capabilities, beneath the box so they read as
            "what I can do" rather than crowding the compose controls. The
            Knowledge Graph is the first; future tools append as siblings. */}
        <div className="mt-2 flex items-center gap-2">
          <ToolChip
            active={graphMode}
            // Desktop: tap toggles instantly (the hover tooltip explains it).
            // Mobile: no hover, so tap opens an info+toggle sheet instead of
            // silently flipping an unlabelled icon.
            onClick={() => {
              if (isMobile) setKgSheetOpen(true);
              else toggleGraphMode();
            }}
            label="Knowledge Graph"
            icon={<GraphIcon />}
            tooltip={
              <>
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
              </>
            }
          />
          {/* Help anchored to the right of the tool row, beneath the box. */}
          <HelpButton className="ml-auto" />
        </div>

        {/* Mobile-only: the Knowledge Graph info + toggle sheet. */}
        <ToolInfoSheet
          open={kgSheetOpen}
          onClose={() => setKgSheetOpen(false)}
          title="Knowledge Graph"
          icon={<GraphIcon />}
          enabled={graphMode}
          onToggle={toggleGraphMode}
        >
          {graphMode
            ? "It's on — as we talk I extract the people, places, and ideas and render them as a live graph you can open from the tool row."
            : "Turn it on to map this conversation as a live graph — people, places, and ideas, drawn as we talk."}
          <span className="mt-2 block text-content-subtle">
            Just one plugin in Aether's capability column — the same seam can
            render charts, tables, or live 3D scenes. Anything.
          </span>
        </ToolInfoSheet>
        </div>
      </form>
    </div>
  );
}

// A capability in the tool row beneath the chatbox. Toggle tools (like the
// Knowledge Graph) use `active` for the on/off pill styling; future momentary
// tools can leave it false. Carries an icon, a text label, and a rich hover
// tooltip explaining what the tool does.
function ToolChip({
  active,
  onClick,
  label,
  icon,
  tooltip,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  tooltip: React.ReactNode;
}) {
  return (
    <div className="group relative flex">
      <button
        type="button"
        onClick={(e) => {
          onClick();
          e.currentTarget.blur();
        }}
        aria-label={label}
        aria-pressed={active}
        className={
          active
            ? "flex items-center gap-1.5 rounded-lg border border-border-strong bg-border-strong px-2.5 py-1.5 text-xs font-medium text-content max-md:py-2.5"
            : "flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-content-muted hover:bg-border-strong hover:text-content max-md:py-2.5"
        }
      >
        {icon}
        {/* Icon-only on mobile: keeps the tool row compact as more tools land.
            aria-label on the button carries the name for assistive tech. */}
        <span className="max-md:hidden">{label}</span>
      </button>
      <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 w-64 rounded-md bg-surface-overlay px-2.5 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {tooltip}
      </span>
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
