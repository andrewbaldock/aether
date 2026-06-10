import * as RadixTooltip from "@radix-ui/react-tooltip";
import { ChevronDown, Share2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingGlyph } from "../brand/ThinkingGlyph";
import { Wordmark } from "../brand/Wordmark";
import type { Widget } from "../capabilities/registry";
import { useCapabilities } from "../capabilities/useCapabilities";
import { CHART_WIDGET } from "../capabilities/widgets/Chart";
import { useChartState } from "../capabilities/widgets/Chart/useChartState";
import { IMAGES_WIDGET } from "../capabilities/widgets/Images";
import { useImagesState } from "../capabilities/widgets/Images/useImagesState";
import { KNOWLEDGE_GRAPH_WIDGET } from "../capabilities/widgets/KnowledgeGraph";
import { useKnowledgeGraphState } from "../capabilities/widgets/KnowledgeGraph/useKnowledgeGraphState";
import { TABLE_WIDGET } from "../capabilities/widgets/Table";
import { useTableState } from "../capabilities/widgets/Table/useTableState";
import { TIMELINE_WIDGET } from "../capabilities/widgets/Timeline";
import { useTimelineState } from "../capabilities/widgets/Timeline/useTimelineState";
import { WELCOME_WIDGET } from "../capabilities/widgets/Welcome";
import { useUpdateSession } from "../hooks/useUpdateSession";
import { useAgentEvents } from "./AgentEventContext";
import { HelpButton } from "./HelpButton";
import { ModelPicker } from "./ModelPicker";
import { useSessionContext } from "./SessionContext";
import { ToolInfoSheet } from "./ToolInfoSheet";
import { Tooltip } from "./Tooltip";
import { useChat } from "./useChat";
import { useIsMobile } from "./useIsMobile";
import { useWaitingMessage } from "./useWaitingMessage";

// Seed for a new conversation's model (until its session row exists). undefined
// means "no explicit choice yet" — the backend uses its default.
const LAST_MODEL_KEY = "aether-last-model";

function readLastModel(): string | undefined {
  return localStorage.getItem(LAST_MODEL_KEY) ?? undefined;
}

// Render tools → the capability widget each one auto-opens. When a tool_result
// for one of these arrives, its tab is opened and brought to the front so the
// rendered spec is visible. Add a render tool here and its widget surfaces with
// no other wiring. (The knowledge graph stays separate — it has extra mode-gated
// open logic above.)
const RENDER_TOOL_WIDGETS: Record<string, Widget> = {
  render_table: TABLE_WIDGET,
  render_chart: CHART_WIDGET,
  render_timeline: TIMELINE_WIDGET,
  render_images: IMAGES_WIDGET,
};

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
    renameSession,
  } = useSessionContext();

  // Knowledge Graph is always on — no per-session toggle.
  const graphMode = true;

  const currentSession = sessions.find((s) => s.id === sessionId);
  const displayTitle =
    currentSession?.title ??
    messages.find((m) => m.role === "user")?.text?.slice(0, 60) ??
    null;

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
  const {
    open,
    ensure,
    activate,
    markUnseen,
    restore,
    closeAll,
    activeId,
    widgets,
  } = useCapabilities();
  // Content signals for restoring tabs on conversation load: a tab is reopened
  // only when its widget actually has content. Entries/graph hydrate async (via
  // the persistence bridges), so the restore effect keys on these and runs once
  // they settle. We only read `.length` / `.nodes.length`, never mutate here.
  const { entries: tableEntries } = useTableState();
  const { entries: chartEntries } = useChartState();
  const { entries: timelineEntries } = useTimelineState();
  const { entries: imageEntries } = useImagesState();
  const { nodes: graphNodes } = useKnowledgeGraphState();
  // Whether the Welcome/help tab is currently on top. Read via a ref inside the
  // bus subscription so a graph turn doesn't yank the user off the help page they
  // opened to read — without re-subscribing every time the active tab changes.
  const helpOnTopRef = useRef(activeId === WELCOME_WIDGET.id);
  helpOnTopRef.current = activeId === WELCOME_WIDGET.id;
  // Same reason: the bus subscriptions below need the *current* active tab to
  // decide "update in place vs. flag unseen", but must not re-subscribe on every
  // tab switch. Read activeId through a ref so the once-mounted closure always
  // sees the latest value.
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const isMobile = useIsMobile();
  const updateSession = useUpdateSession(userId);
  const bus = useAgentEvents();
  // Calm filler shown beneath the glyph during dead air (gaps between real
  // status events). null when there's real status to show or nothing to fill.
  const waitingMessage = useWaitingMessage(isLoading);
  const [draft, setDraft] = useState("");
  // Mobile-only: the Knowledge Graph info+toggle sheet (no hover tooltips on touch).
  const [kgSheetOpen, setKgSheetOpen] = useState(false);
  const [tableSheetOpen, setTableSheetOpen] = useState(false);
  const [chartSheetOpen, setChartSheetOpen] = useState(false);
  const [timelineSheetOpen, setTimelineSheetOpen] = useState(false);
  const [imagesSheetOpen, setImagesSheetOpen] = useState(false);
  const started = messages.length > 0;
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Restore the capability column from a saved conversation. On load we reopen
  // every tab that actually HAS content (Knowledge Graph included — treated like
  // any other widget, opened only when it has nodes) and bring the last-viewed
  // tab back to the front. The id of that tab is remembered per-conversation in
  // ui_state.activeWidget. restoredSessionRef tracks which session we've already
  // restored, so restore runs once per switch and active-tab SAVES (below) don't
  // fire mid-restore.
  const restoredSessionRef = useRef<string | null>(null);

  // On session switch: clear the column so the previous conversation's tabs don't
  // bleed in, and arm restore for the new session. Keyed on sessionId only.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId is the trigger, not a value the effect reads
  useEffect(() => {
    restoredSessionRef.current = null;
    closeAll();
  }, [sessionId, closeAll]);

  // Once this session's content has hydrated (entries/graph arrive async via the
  // persistence bridges), reopen the content-bearing tabs and restore the active
  // one. Keyed on the content signals so it runs after they settle; the ref guard
  // makes it run at most once per session. `restore` is atomic and does NOT bump
  // openTick, so this never pops the mobile full-screen overlay on load.
  const savedActiveWidget = currentSession?.ui_state?.activeWidget ?? null;
  useEffect(() => {
    if (!sessionId || restoredSessionRef.current === sessionId) return;
    const widgetsToOpen: Widget[] = [];
    if (graphNodes.length > 0) widgetsToOpen.push(KNOWLEDGE_GRAPH_WIDGET);
    if (tableEntries.length > 0) widgetsToOpen.push(TABLE_WIDGET);
    if (chartEntries.length > 0) widgetsToOpen.push(CHART_WIDGET);
    if (timelineEntries.length > 0) widgetsToOpen.push(TIMELINE_WIDGET);
    if (imageEntries.length > 0) widgetsToOpen.push(IMAGES_WIDGET);
    // The remembered tab, but only if it still has content; else fall back to the
    // last opened tab (or none for an empty conversation).
    const restoreActiveId =
      savedActiveWidget && widgetsToOpen.some((w) => w.id === savedActiveWidget)
        ? savedActiveWidget
        : (widgetsToOpen.at(-1)?.id ?? null);
    restore(widgetsToOpen, restoreActiveId);
    restoredSessionRef.current = sessionId;
  }, [
    sessionId,
    savedActiveWidget,
    graphNodes,
    tableEntries,
    chartEntries,
    timelineEntries,
    imageEntries,
    restore,
  ]);

  // Remember which tab the user is viewing, per conversation. Debounced PATCH of
  // ui_state.activeWidget — but only once this session has been restored (so we
  // never overwrite the saved tab with a transient mid-restore value). The help/
  // Welcome tab isn't a capability, so viewing it clears the remembered tab.
  useEffect(() => {
    if (!sessionId || restoredSessionRef.current !== sessionId) return;
    const isCapabilityTab = widgets.some(
      (w) => w.id === activeId && w.id !== WELCOME_WIDGET.id
    );
    const activeWidget = isCapabilityTab ? activeId : null;
    const timer = setTimeout(() => {
      updateSession.mutate({
        id: sessionId,
        patch: { ui_state: { activeWidget } },
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [sessionId, activeId, widgets, updateSession]);

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
      // If the user has the help page open and on top, don't yank them over to
      // the graph just because a turn started or graph data landed — they opened
      // the explainer to read it. Mount the tab in the background so it's ready,
      // but leave their view where it is.
      const helpOnTop = helpOnTopRef.current;
      if (event.type === "request_start") {
        if (helpOnTop) {
          ensure(KNOWLEDGE_GRAPH_WIDGET);
        } else {
          open(KNOWLEDGE_GRAPH_WIDGET);
          activate(KNOWLEDGE_GRAPH_WIDGET.id);
        }
      } else if (
        event.type === "tool_result" &&
        event.tool === "build_knowledge_graph"
      ) {
        if (helpOnTop || activeIdRef.current !== KNOWLEDGE_GRAPH_WIDGET.id) {
          // Help is on top, or another widget tab is active — mount in the
          // background and flag unseen so the glowing dot appears.
          ensure(KNOWLEDGE_GRAPH_WIDGET);
          markUnseen(KNOWLEDGE_GRAPH_WIDGET.id);
        } else {
          // KG is already the active tab — update in place, no dot needed.
          open(KNOWLEDGE_GRAPH_WIDGET);
        }
      }
    });
    return unsubscribe;
  }, [bus, open, activate, ensure, markUnseen]);

  // Auto-open render-tool widgets (table/chart/timeline) when their spec lands.
  // Same belt-and-braces as the graph: on a render tool_result, ensure the tab
  // exists and bring it to the front — unless the help page is on top, in which
  // case just mount it in the background so we don't yank the user off what they
  // opened to read.
  useEffect(() => {
    const unsubscribe = bus.subscribe((event) => {
      if (event.type !== "tool_result") return;
      const widget = RENDER_TOOL_WIDGETS[event.tool];
      if (!widget) return;
      if (helpOnTopRef.current || activeIdRef.current !== widget.id) {
        // Help is on top, or a different tab is active — mount in the background
        // and flag unseen so the glowing dot appears.
        ensure(widget);
        markUnseen(widget.id);
      } else {
        // This widget is already the active tab — update in place, no dot needed.
        open(widget);
      }
    });
    return unsubscribe;
  }, [bus, open, ensure, markUnseen]);

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

  // Always expose a capability tab — open it if absent, bring it to front if already there.
  // The × on the tab itself is the only close affordance.
  function revealCapability(widget: Widget) {
    open(widget);
    activate(widget.id);
  }

  // Pick a model: update the seed for the next new
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
      {started && sessionId && (
        <ConversationTitle
          title={displayTitle}
          onRename={(t) => renameSession(sessionId, t)}
        />
      )}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto px-6 pb-6${started ? " pt-2.5" : " py-6"}${
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
            <p className="text-sm text-content-muted max-md:px-2">
              Ask me anything. I'll answer in whatever form fits best — text, a
              chart, a table, a graph — rendered live beside us.
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
            <li className="flex items-center gap-2 px-4 py-1">
              <ThinkingGlyph height={36} animate={isLoading} />
              {waitingMessage && (
                <span className="text-xs text-content-subtle italic">
                  {waitingMessage}
                </span>
              )}
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
              {/* Send / Stop — while a turn is streaming the button becomes a stop
                control: the spinner is the resting state, and hovering reveals a
                stop icon that aborts the stream on click. */}
              <Tooltip
                label={isLoading ? "Stop generating" : "Send message"}
                side="top"
                className="group"
              >
                <button
                  // While loading this is an abort control, not a submit — `button`
                  // type so it never re-submits the form, and it stays enabled.
                  type={isLoading ? "button" : "submit"}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    if (isLoading) abortStream();
                  }}
                  aria-label={isLoading ? "Stop generating" : "Send message"}
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gradient-to-r from-[#fd40a4] to-[#c35ed1] text-2xl leading-none text-white hover:brightness-110 disabled:opacity-40 max-md:h-11 max-md:w-11"
                  // Only disabled when there's nothing to send. While loading the
                  // button is active so it can stop the stream.
                  disabled={!isLoading && draft.trim().length === 0}
                >
                  {isLoading ? (
                    <>
                      {/* Resting: spinner. Hidden on hover so the stop icon shows. */}
                      <span className="animate-spin group-hover:hidden">𑁍</span>
                      {/* Hover: a stop square. Smaller than the send glyph. */}
                      <span className="hidden text-base leading-none group-hover:inline">
                        ◼
                      </span>
                    </>
                  ) : (
                    <span>𑁍</span>
                  )}
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Tool row — each chip opens/activates its capability tab. */}
          <div className="mt-2 flex items-center gap-2">
            <ToolChip
              active={widgets.some((w) => w.id === KNOWLEDGE_GRAPH_WIDGET.id)}
              onClick={() => {
                if (isMobile) setKgSheetOpen(true);
                else revealCapability(KNOWLEDGE_GRAPH_WIDGET);
              }}
              label="Knowledge Graph"
              icon={<GraphIcon />}
              tooltip={
                <>
                  <span className="font-semibold">Knowledge Graph</span>
                  <br />
                  As we talk I extract the people, places, and ideas and map
                  them as a live force-directed graph beside the chat. Click a
                  node to get its Wikipedia summary; drag to rearrange.
                </>
              }
            />
            <ToolChip
              active={widgets.some((w) => w.id === TABLE_WIDGET.id)}
              onClick={() => {
                if (isMobile) setTableSheetOpen(true);
                else revealCapability(TABLE_WIDGET);
              }}
              label="Table"
              icon={<TableIcon />}
              tooltip={
                <>
                  <span className="font-semibold">Table</span>
                  <br />
                  Ask for a comparison, a ranked list, or any structured data
                  and I'll render it as a sortable table beside the chat.
                  Multiple tables stack as the conversation grows.
                </>
              }
            />
            <ToolChip
              active={widgets.some((w) => w.id === CHART_WIDGET.id)}
              onClick={() => {
                if (isMobile) setChartSheetOpen(true);
                else revealCapability(CHART_WIDGET);
              }}
              label="Chart"
              icon={<ChartIcon />}
              tooltip={
                <>
                  <span className="font-semibold">Chart</span>
                  <br />
                  Ask for trends, distributions, or comparisons over a dimension
                  and I'll render a line, bar, area, or pie chart beside the
                  chat.
                </>
              }
            />
            <ToolChip
              active={widgets.some((w) => w.id === TIMELINE_WIDGET.id)}
              onClick={() => {
                if (isMobile) setTimelineSheetOpen(true);
                else revealCapability(TIMELINE_WIDGET);
              }}
              label="Timeline"
              icon={<TimelineIcon />}
              tooltip={
                <>
                  <span className="font-semibold">Timeline</span>
                  <br />
                  Ask about anything chronological — a history, sequence, or
                  schedule — and I'll lay it out as a sortable timeline beside
                  the chat.
                </>
              }
            />
            <ToolChip
              active={widgets.some((w) => w.id === IMAGES_WIDGET.id)}
              onClick={() => {
                if (isMobile) setImagesSheetOpen(true);
                else revealCapability(IMAGES_WIDGET);
              }}
              label="Images"
              icon={<ImagesIcon />}
              tooltip={
                <>
                  <span className="font-semibold">Images</span>
                  <br />
                  Ask to see photos or pictures of something — I'll search the
                  web (Wikimedia Commons & Unsplash) and lay the results out as
                  a gallery beside the chat.
                </>
              }
            />
            <HelpButton className="ml-auto" />
          </div>

          {/* Mobile-only info sheets (no toggles — all tools are always on). */}
          <ToolInfoSheet
            open={kgSheetOpen}
            onClose={() => setKgSheetOpen(false)}
            title="Knowledge Graph"
            icon={<GraphIcon />}
          >
            As we talk I extract the people, places, and ideas and map them as a
            live graph you can open from the tool row. Click a node for its
            Wikipedia summary; drag to rearrange.
          </ToolInfoSheet>
          <ToolInfoSheet
            open={tableSheetOpen}
            onClose={() => setTableSheetOpen(false)}
            title="Table"
            icon={<TableIcon />}
          >
            Ask for a comparison, a ranked list, or any structured data and I'll
            render it as a sortable table beside the chat.
          </ToolInfoSheet>
          <ToolInfoSheet
            open={chartSheetOpen}
            onClose={() => setChartSheetOpen(false)}
            title="Chart"
            icon={<ChartIcon />}
          >
            Ask for trends, distributions, or comparisons over a dimension and
            I'll render a line, bar, area, or pie chart beside the chat.
          </ToolInfoSheet>
          <ToolInfoSheet
            open={timelineSheetOpen}
            onClose={() => setTimelineSheetOpen(false)}
            title="Timeline"
            icon={<TimelineIcon />}
          >
            Ask about anything chronological — a history, sequence, or schedule
            — and I'll lay it out as a timeline beside the chat.
          </ToolInfoSheet>
          <ToolInfoSheet
            open={imagesSheetOpen}
            onClose={() => setImagesSheetOpen(false)}
            title="Images"
            icon={<ImagesIcon />}
          >
            Ask to see photos or pictures of something — I'll search the web
            (Wikimedia Commons & Unsplash) and lay the results out as a gallery
            beside the chat.
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
    <Tooltip
      label={tooltip}
      side="top"
      contentClassName="max-w-xs whitespace-normal break-words px-2.5 py-1.5 leading-snug"
    >
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
    </Tooltip>
  );
}

function ConversationTitle({
  title,
  onRename,
}: {
  title: string | null;
  onRename: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title ?? "");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(title ?? "");
      inputRef.current?.select();
    }
  }, [editing, title]);

  function commit() {
    const t = draft.trim();
    if (t && t !== title) onRename(t);
    setEditing(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  }

  function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (editing) {
    return (
      <div className="relative flex items-center justify-center border-b border-border px-4 pb-2 pt-3.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          className="w-full max-w-sm rounded-md bg-elevated px-3 py-1 text-sm text-content outline-none ring-1 ring-border-strong text-center"
        />
      </div>
    );
  }

  return (
    <div className="relative border-b border-border">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex w-full items-center justify-center gap-1 px-4 pb-2 pt-3.5 text-sm text-content-muted hover:text-content transition-colors"
      >
        <span className="max-w-sm truncate">{title ?? "·"}</span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-hidden
        />
      </button>
      <RadixTooltip.Root open={copied || undefined}>
        <RadixTooltip.Trigger asChild>
          <button
            type="button"
            onClick={handleShare}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-md p-1.5 text-content-muted hover:bg-elevated hover:text-content transition-colors"
            aria-label="Copy link"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side="top"
            sideOffset={6}
            className="pointer-events-none z-50 select-none rounded-md bg-surface-overlay px-2 py-1 text-xs text-white shadow-lg whitespace-nowrap"
          >
            {copied ? "URL Copied" : "Copy link"}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
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

// A simple table grid glyph.
function TableIcon() {
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 9v12" />
    </svg>
  );
}

// A vertical timeline spine + dots glyph.
function TimelineIcon() {
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
      <line x1="6" y1="3" x2="6" y2="21" />
      <circle cx="6" cy="7" r="2" fill="currentColor" stroke="none" />
      <circle cx="6" cy="14" r="2" fill="currentColor" stroke="none" />
      <line x1="10" y1="7" x2="20" y2="7" />
      <line x1="10" y1="14" x2="18" y2="14" />
    </svg>
  );
}

// A stacked-frames glyph (lucide "images").
function ImagesIcon() {
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
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <circle cx="7.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
      <path d="M3 13l3.5-3.5a1.5 1.5 0 0 1 2 0L17 18" />
      <path d="M14 7h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9" />
    </svg>
  );
}

// A bar-chart glyph.
function ChartIcon() {
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
      <path d="M3 3v18h18" />
      <path d="M7 16V10" />
      <path d="M12 16V6" />
      <path d="M17 16v-4" />
    </svg>
  );
}
