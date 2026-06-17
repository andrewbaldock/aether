import * as RadixTooltip from "@radix-ui/react-tooltip";
import { ChevronDown, FileText, Plus, Share2, Trash2, X } from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { ThinkingGlyph } from "../brand/ThinkingGlyph";
import { Wordmark } from "../brand/Wordmark";
import { CAPABILITIES, HOME_BASE_ID } from "../capabilities/catalog";
import { useCapabilities } from "../capabilities/useCapabilities";
import { resolveVocabularyIcon } from "../capabilities/widgets/vocabularyIcon";
import { CHART_WIDGET } from "../capabilities/widgets/Chart";
import { useChartState } from "../capabilities/widgets/Chart/useChartState";
import { IMAGES_WIDGET } from "../capabilities/widgets/Images";
import { useImagesState } from "../capabilities/widgets/Images/useImagesState";
import { KNOWLEDGE_GRAPH_WIDGET } from "../capabilities/widgets/KnowledgeGraph";
import { useKnowledgeGraphState } from "../capabilities/widgets/KnowledgeGraph/useKnowledgeGraphState";
import { SETTINGS_WIDGET } from "../capabilities/widgets/Settings";
import { TABLE_WIDGET } from "../capabilities/widgets/Table";
import { useTableState } from "../capabilities/widgets/Table/useTableState";
import { TIMELINE_WIDGET } from "../capabilities/widgets/Timeline";
import { useTimelineState } from "../capabilities/widgets/Timeline/useTimelineState";
import { WELCOME_WIDGET } from "../capabilities/widgets/Welcome";
import { replaceRoute, useRoute, viewPath } from "../hooks/useRoute";
import { useUpdateSession } from "../hooks/useUpdateSession";
import { useAgentEvents } from "./AgentEventContext";
import { ModelPicker } from "./ModelPicker";
import { useSessionContext } from "./SessionContext";
import { StarterPrompts } from "./StarterPrompts";
import { Tooltip } from "./Tooltip";
import { ACCEPTED_TYPES, filesToAttachments } from "./attachments";
import { type Attachment, useChat } from "./useChat";
import { useIsMobile } from "./useIsMobile";
import { useToolProgress } from "./useToolProgress";
import { useWaitingMessage } from "./useWaitingMessage";

// Seed for a new conversation's model (until its session row exists). undefined
// means "no explicit choice yet" — the backend uses its default.
const LAST_MODEL_KEY = "aether-last-model";

function readLastModel(): string | undefined {
  return localStorage.getItem(LAST_MODEL_KEY) ?? undefined;
}

// Relative timestamp for the label under assistant replies — "just now",
// "3 mins ago", "2 hours ago", "4 days ago", then a plain date past a week.
// Finer-grained than the Sidebar's day-bucket formatter (kept independent).
function formatRelative(iso: string): string {
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
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
    renameSession,
    deleteMessages,
    loadSession,
  } = useSessionContext();

  const route = useRoute();

  // Re-render once a minute so the relative "3 hours ago" timestamps under
  // assistant replies stay fresh during a long-lived session. Cheap (one render/
  // min) and torn down on unmount.
  const [, tickRelativeTimes] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(tickRelativeTimes, 60_000);
    return () => clearInterval(id);
  }, []);

  // Which assistant message currently shows its inline "Delete?" confirm (the
  // trash control was clicked once). null = none confirming.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  );

  // Delete a turn: the assistant message plus its immediately-preceding user
  // question. Optimistic in-memory removal for instant feedback; on failure
  // resync from the DB (source of truth). Ids are real DB ids, so the request
  // targets the right rows even for a turn created this session.
  const handleDeleteTurn = (assistantId: string) => {
    const idx = messages.findIndex((m) => m.id === assistantId);
    const prev = idx > 0 ? messages[idx - 1] : undefined;
    const userMsg = prev?.role === "user" ? prev : null;
    const toRemove = new Set([
      assistantId,
      ...(userMsg ? [userMsg.id] : []),
    ]);
    setMessages(messages.filter((m) => !toRemove.has(m.id)));
    setConfirmingDeleteId(null);
    if (sessionId) {
      void deleteMessages(sessionId, [...toRemove]).catch(() => {
        void loadSession(sessionId);
      });
    }
  };

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
  const { activate, markUnseen, restore, reset, activeId } = useCapabilities();
  // Content signals for restoring views on conversation load: a capability gets
  // the pink glow only when its widget actually has content the user hasn't seen.
  // Entries/graph hydrate async (via the persistence bridges), so the restore
  // effect keys on these and runs once they settle. We only read `.length` /
  // `.nodes.length`, never mutate here.
  const { entries: tableEntries } = useTableState();
  const { entries: chartEntries } = useChartState();
  const { entries: timelineEntries } = useTimelineState();
  const { entries: imageEntries } = useImagesState();
  const { nodes: graphNodes } = useKnowledgeGraphState();
  // Whether a utility view (Welcome/help or Settings) is currently on top. Read
  // via a ref inside the bus subscription so a graph turn doesn't yank the user
  // off a page they opened to read — without re-subscribing on every tab switch.
  const isUtilityView = (id: string) =>
    id === WELCOME_WIDGET.id || id === SETTINGS_WIDGET.id;
  const helpOnTopRef = useRef(isUtilityView(activeId));
  helpOnTopRef.current = isUtilityView(activeId);
  // Same reason: the bus subscriptions below need the *current* active tab to
  // decide "update in place vs. flag unseen", but must not re-subscribe on every
  // tab switch. Read activeId through a ref so the once-mounted closure always
  // sees the latest value.
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  // sessionId through a ref for the same once-mounted bus closure below (the
  // request_start jump reads the current session without re-subscribing).
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  // Whether the user is currently parked on a data capability (table/chart/
  // timeline/images/graph). Read via a ref for the same reason as the others: a
  // turn that starts must not yank the user off a capability they're actively
  // watching just to surface the graph.
  const isCapabilityViewRef = useRef(false);
  isCapabilityViewRef.current = CAPABILITIES.some((c) => c.id === activeId);
  const isMobile = useIsMobile();
  const updateSession = useUpdateSession(userId);
  const bus = useAgentEvents();
  // Calm filler shown beneath the glyph during dead air (gaps between real
  // status events). null when there's real status to show or nothing to fill.
  const waitingMessage = useWaitingMessage(isLoading);
  // Scripted tool progress: keeps the activity line moving through a slow tool's
  // silent fetch window. Overrides the backend's single frozen tool_start label on
  // the streaming message; superseded the instant a real status/result/text lands.
  const toolProgress = useToolProgress(isLoading);
  const [draft, setDraft] = useState("");
  // Pending attachments for the next send — images/PDFs picked, pasted, or dropped
  // into the composer. Ephemeral: cleared on send, never persisted. Show a chip per
  // attachment above the textarea with a remove control.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Drag-over affordance: highlight the composer while a file is being dragged over
  // it. A counter (not a boolean) so nested dragenter/dragleave from child elements
  // don't prematurely clear the highlight.
  const [dragDepth, setDragDepth] = useState(0);
  const started = messages.length > 0;
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add a batch of files: validate/downscale/encode off the helper, append the
  // good ones, and toast a single line summarizing any that were rejected. Shared
  // by the file picker, paste, and drop paths.
  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    const { attachments: added, errors } = await filesToAttachments(files);
    if (added.length > 0) setAttachments((prev) => [...prev, ...added]);
    if (errors.length > 0) {
      const detail =
        errors.length === 1
          ? `${errors[0]!.name}: ${errors[0]!.reason}`
          : `${errors.length} files couldn't be attached`;
      toast.error(detail);
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  // Paste handler: pull any image files off the clipboard (a pasted screenshot
  // arrives as a File item). Don't preventDefault for text — only act when there
  // are files, so normal text paste is untouched.
  function handlePaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length === 0) return;
    e.preventDefault();
    void addFiles(files);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragDepth(0);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) void addFiles(files);
  }

  // Restore the active capability view from a saved conversation. Every
  // capability is always present now; on load we just pick which view is active
  // and which capabilities should pulse with the unseen glow (those with content
  // that aren't the active view). The remembered active view is per-conversation
  // in ui_state.activeWidget. restoredSessionRef tracks which session we've
  // already restored, so restore runs once per switch and active-view SAVES
  // (below) don't fire mid-restore.
  const restoredSessionRef = useRef<string | null>(null);
  // Last-seen content counts per capability, for detecting genuinely-new content
  // (vs. a tool that returned nothing). Reset on session switch so the next
  // conversation's hydration establishes a fresh baseline rather than reading as
  // growth. `restore` owns the initial glow set; this ref handles live growth.
  const prevCountsRef = useRef<Record<string, number>>({});

  // On session switch: reset to home base so the previous conversation's view
  // doesn't bleed in, and arm restore for the new session. Keyed on sessionId.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId is the trigger, not a value the effect reads
  useEffect(() => {
    restoredSessionRef.current = null;
    prevCountsRef.current = {};
    reset();
  }, [sessionId, reset]);

  // The URL is the source of truth for which view is active; activeId is a
  // projection of it (see useActiveViewSync below for the reader that drives the
  // store from the route). This effect computes the per-session DEFAULT view used
  // only when the URL carries no explicit :view (a bare /c/:id) — the saved
  // ui_state.activeWidget if it still has content, else home base — plus the glow
  // set for content the user hasn't landed on. It runs once per session, after
  // content hydrates (keyed on the content signals).
  //
  // An explicit /c/:id/:view in the URL OVERRIDES this default and shows the tab
  // even with no content; that precedence lives in useActiveViewSync, which reads
  // route.view first and falls back to this default only when it's null.
  const routeView = route.type === "workspace" ? route.view : null;
  const savedActiveWidget = currentSession?.ui_state?.activeWidget ?? null;
  useEffect(() => {
    if (!sessionId || restoredSessionRef.current === sessionId) return;
    const withContent: string[] = [];
    if (graphNodes.length > 0) withContent.push(KNOWLEDGE_GRAPH_WIDGET.id);
    if (tableEntries.length > 0) withContent.push(TABLE_WIDGET.id);
    if (chartEntries.length > 0) withContent.push(CHART_WIDGET.id);
    if (timelineEntries.length > 0) withContent.push(TIMELINE_WIDGET.id);
    if (imageEntries.length > 0) withContent.push(IMAGES_WIDGET.id);
    // The session default: an explicit URL view wins (even empty); else the
    // remembered view IF it still has content; else home base (Tiles).
    const validUrlView =
      routeView && CAPABILITIES.some((c) => c.id === routeView)
        ? routeView
        : null;
    const landing =
      validUrlView ??
      (savedActiveWidget && withContent.includes(savedActiveWidget)
        ? savedActiveWidget
        : HOME_BASE_ID);
    // Glow every content-bearing capability except the one we're landing on.
    const unseen = withContent.filter((id) => id !== landing);
    restore(landing, unseen);
    restoredSessionRef.current = sessionId;
    // Make the URL agree with where we landed. A bare /c/:id that resolved to a
    // saved default (e.g. timeline) must become /c/:id/timeline — otherwise the
    // post-restore URL→activeId sync below sees a null view, reads it as "home base",
    // and clobbers the restored default. With the URL authoritative, null view only
    // ever means an explicit Tiles click. No-op when already correct (replaceRoute
    // guards on equal paths).
    if (!validUrlView && landing !== HOME_BASE_ID) {
      replaceRoute(viewPath(sessionId, landing));
    }
  }, [
    sessionId,
    routeView,
    savedActiveWidget,
    graphNodes,
    tableEntries,
    chartEntries,
    timelineEntries,
    imageEntries,
    restore,
  ]);

  // Keep activeId in sync with the URL AFTER the initial restore: back/forward and
  // direct navigations (tab clicks call navigate(); see CapabilityColumn) change
  // route.view, and this projects that onto the store. Admin routes are driven by
  // Shell's useUrlDrivenAdmin, so we ignore them here. For a workspace route a null
  // view (bare /c/:id) means HOME BASE — clicking the Tiles tab navigates there by
  // dropping the slug, so post-restore it must activate home base, not be ignored
  // (that left the previous tab stuck active while the URL said home — the "Tiles
  // does nothing" bug). Initial load is unaffected: this effect only runs once the
  // restore for this session has happened. No-op when already showing the target.
  useEffect(() => {
    if (!sessionId || restoredSessionRef.current !== sessionId) return;
    if (route.type !== "workspace") return;
    const target =
      route.view && CAPABILITIES.some((c) => c.id === route.view)
        ? route.view
        : HOME_BASE_ID;
    if (target !== activeIdRef.current) activate(target);
  }, [sessionId, route, activate]);

  // No-session workspace projection: on the home screen (no conversation yet) the
  // URL still names a view — / = home base, /:view = a tool tab shown empty. There
  // is no content or saved default to restore, so we just project the URL view onto
  // the store directly. (Once a conversation exists, the session-scoped effects
  // above take over.) Validated against the catalog; junk falls to home base.
  useEffect(() => {
    if (sessionId) return;
    if (route.type !== "workspace") return;
    const view =
      route.view && CAPABILITIES.some((c) => c.id === route.view)
        ? route.view
        : HOME_BASE_ID;
    if (view !== activeIdRef.current) activate(view);
  }, [sessionId, route, activate]);

  // Persist which capability the user is viewing, per conversation: a debounced
  // PATCH of ui_state.activeWidget, once this session has been restored (so we
  // never overwrite the saved view with a transient mid-restore value). Admin
  // pages aren't capabilities, so viewing one clears the remembered view (next
  // bare /c/:id load falls back to home base).
  // Depend on the stable `mutate` callback, NOT the whole `updateSession` object:
  // React Query's `useMutation` returns a fresh result object every render, so
  // listing `updateSession` here re-ran this effect every render → rescheduled the
  // debounced PATCH → onMutate rewrote the cache → re-render → repeat, a PATCH storm
  // (only `updateSession` flipped identity each cycle). `mutate` is referentially
  // stable, so the effect now re-runs only when sessionId/activeId actually change.
  const patchSession = updateSession.mutate;
  useEffect(() => {
    if (!sessionId || restoredSessionRef.current !== sessionId) return;
    const isCapabilityView = CAPABILITIES.some((c) => c.id === activeId);
    const activeWidget = isCapabilityView ? activeId : null;
    const timer = setTimeout(() => {
      patchSession({
        id: sessionId,
        patch: { ui_state: { activeWidget } },
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [sessionId, activeId, patchSession]);

  // Surface the home-base Tiles canvas while the model works: on request_start,
  // jump to Tiles. Tiles mirrors every capability (including the knowledge graph's
  // "mapping…" state) as live cards, so it's always the view we want to show as an
  // answer composes. Don't yank the user off a page they're deliberately on: a
  // utility view (help/settings) OR another data capability they're already
  // watching (e.g. they hit "Update" on the Images tab — they expect to stay there
  // and see its own loading state). The pink "unseen" glow is handled separately,
  // keyed on content actually arriving (see below) — never on the bare turn/tool
  // event, so a tool that returns nothing usable never lights up an empty tab.
  useEffect(() => {
    const unsubscribe = bus.subscribe((event) => {
      if (event.type !== "request_start") return;
      const stay = helpOnTopRef.current || isCapabilityViewRef.current;
      // Navigate (not just activate) so the URL follows the jump to home base —
      // activeId is a projection of the URL. viewPath(sessionId, null) = /c/:id (or
      // / before the session exists). replace, so it doesn't stack history.
      if (!stay) replaceRoute(viewPath(sessionIdRef.current, null));
    });
    return unsubscribe;
  }, [bus]);

  // Glow a capability's chip only when its content actually grows while the user
  // is looking elsewhere. Keying on the live counts (not the tool_result event)
  // means an empty/invalid spec — which fires a tool_result but parses to nothing
  // — never lights up a tab the user can't fill. The baseline (reset per session
  // above) means hydration on conversation-open doesn't read as fresh growth;
  // `restore` is what glows already-present, unseen content on open.
  useEffect(() => {
    const counts: Record<string, number> = {
      [KNOWLEDGE_GRAPH_WIDGET.id]: graphNodes.length,
      [TABLE_WIDGET.id]: tableEntries.length,
      [CHART_WIDGET.id]: chartEntries.length,
      [TIMELINE_WIDGET.id]: timelineEntries.length,
      [IMAGES_WIDGET.id]: imageEntries.length,
    };
    const prev = prevCountsRef.current;
    for (const [id, n] of Object.entries(counts)) {
      // (prev[id] ?? n): first run after mount/restore establishes the baseline
      // without glowing. Growth beyond it = genuinely new content.
      if (n > (prev[id] ?? n) && activeIdRef.current !== id) {
        markUnseen(id);
      }
    }
    prevCountsRef.current = counts;
  }, [
    graphNodes,
    tableEntries,
    chartEntries,
    timelineEntries,
    imageEntries,
    markUnseen,
  ]);

  // "Explore further" / empty-panel "Update": a widget emits an explore_request
  // on the bus; here we turn it into a real chat turn (only when not mid-stream).
  // displayText, when present, is the terse transcript stand-in for the prompt.
  useEffect(() => {
    const unsubscribe = bus.subscribe((event) => {
      if (event.type === "explore_request" && !isLoading) {
        sendMessage(event.prompt, event.displayText);
      }
    });
    return unsubscribe;
  }, [bus, sendMessage, isLoading]);

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

  // The send button is a Stop control only while a turn streams and there's
  // nothing staged to send — empty field AND no attachments; with either present
  // it stays a Send button (the message queues). Used by the button's type, click
  // handler, label, and rendered glyph.
  const hasStaged = draft.trim().length > 0 || attachments.length > 0;
  const isStop = isLoading && !hasStaged;

  function submit() {
    const text = draft.trim();
    // Nothing to send unless there's text OR at least one attachment (an image/PDF
    // can be sent with no prose). Sends even mid-stream — useChat queues it behind
    // the running turn and fires it when that turn finishes.
    if (!text && attachments.length === 0) return;
    const toSend = attachments;
    setDraft("");
    setAttachments([]);
    sendMessage(text, undefined, {
      ...(toSend.length > 0 ? { attachments: toSend } : {}),
    });
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
          topicIcon={currentSession?.topic_icon ?? null}
          onRename={(t) => renameSession(sessionId, t)}
        />
      )}
      <div
        ref={scrollRef}
        className={
          // When started, the scroll area is the flex-1 transcript. In the empty
          // state it has no messages, so collapse it to nothing (flex-none, no
          // padding) and let the form below become the flex-1 column that lays out
          // hero + pills + input.
          started
            ? "flex-1 overflow-y-auto px-6 pb-6 pt-2.5"
            : "flex-none overflow-y-auto px-6"
        }
      >
        <ul className="mx-auto max-w-2xl space-y-4">
          {messages.map((m, mi) => (
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
                  <>
                    {/* Attachments sent with this turn — thumbnails for images, a
                        file icon for PDFs. Live state only (not restored on reload,
                        since attachments are ephemeral). */}
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {m.attachments.map((a, ai) =>
                          a.kind === "image" && a.previewUrl ? (
                            <img
                              key={`${a.name}-${ai}`}
                              src={a.previewUrl}
                              alt={a.name}
                              className="h-20 w-20 rounded-lg object-cover"
                            />
                          ) : (
                            <span
                              key={`${a.name}-${ai}`}
                              className="flex items-center gap-1.5 rounded-lg bg-surface px-2 py-1 text-xs text-content-muted"
                            >
                              <FileText size={14} />
                              <span className="max-w-40 truncate">
                                {a.name}
                              </span>
                            </span>
                          )
                        )}
                      </div>
                    )}
                    {m.text}
                  </>
                ) : (
                  <>
                    {/* Activity line: the scripted tool progress wins on the
                        streaming (last) message during a slow tool's fetch; else
                        the backend's own tool_start/status label. */}
                    {(() => {
                      const isStreaming = mi === messages.length - 1;
                      const activity =
                        (isStreaming && toolProgress) || m.toolActivity;
                      return activity ? (
                        <div className="mb-1 text-xs text-content-subtle italic">
                          {activity}
                        </div>
                      ) : null;
                    })()}
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
                    {/* Clarifier chips: the planner asked ONE expanding question
                        this turn (m.text is the question). Tapping a chip sends the
                        pick as the next turn, flagged clarified so the planner won't
                        clarify again. A free-form typed answer counts too — it just
                        flows through the normal composer. Chips are an accelerator,
                        not a gate. Guard against double-fire while a turn streams. */}
                    {m.clarifyOptions && m.clarifyOptions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.clarifyOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            disabled={isLoading}
                            onClick={() =>
                              sendMessage(option, undefined, {
                                clarified: true,
                              })
                            }
                            className="rounded-full border border-border-strong px-3 py-1 text-xs text-content-muted transition-colors hover:bg-elevated hover:text-content disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Footer: relative timestamp + a subtle delete control.
                        Only once the reply has text (so nothing flashes before
                        it lands). The trash stays hidden until hover (group),
                        and is suppressed on the streaming message. Clicking it
                        swaps to an inline "Delete?" confirm — no modal. */}
                    {m.createdAt && m.text && (
                      <div className="group/turn mt-1 flex items-center gap-2 text-xs text-content-subtle">
                        <span title={new Date(m.createdAt).toLocaleString()}>
                          {formatRelative(m.createdAt)}
                        </span>
                        {!(mi === messages.length - 1 && isLoading) &&
                          (confirmingDeleteId === m.id ? (
                            <span className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDeleteTurn(m.id)}
                                className="text-danger-content hover:underline"
                              >
                                Delete?
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingDeleteId(null)}
                                className="hover:text-content"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              aria-label="Delete this exchange"
                              onClick={() => setConfirmingDeleteId(m.id)}
                              className="opacity-0 transition-opacity hover:text-content group-hover/turn:opacity-100"
                            >
                              <Trash2 size={13} />
                            </button>
                          ))}
                      </div>
                    )}
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
            : // Empty state: the form becomes the flex-1 column for the whole hero.
              // Hero (near the top), starter pills, and the input are three stacked
              // blocks that share the vertical space — nothing floats over anything,
              // and the input is not pinned to the bottom. They sit as one group
              // around the upper-middle with breathing room between each.
              "flex flex-1 flex-col items-center px-6 pt-20 pb-6 max-md:px-5 max-md:pt-10 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-600 ease-in-out"
        }
      >
        {!started && (
          <>
            {/* Hero — kept near the top, where it was before starter pills existed. */}
            <div className="flex w-full max-w-md flex-col items-center gap-4 text-center max-md:gap-3">
              <Wordmark height={72} />
              <p className="text-sm text-content-muted max-md:px-2">
                Ask me anything. I'll answer in whatever form fits best — text, a
                chart, a table, a graph — rendered live beside us.
              </p>
            </div>
            {/* Pills float in the gap between hero and input. The spacers are
                weighted so the cluster sits in the UPPER-middle: a small fixed gap
                under the hero, pills, a small fixed gap, then the input — and a big
                flex-1 spacer below pushes all of it up off the bottom. */}
            <div className="h-12 shrink-0 max-md:h-8" />
            <div className="w-full max-w-xl">
              <StarterPrompts onPick={sendMessage} disabled={isLoading} />
            </div>
            <div className="h-12 shrink-0 max-md:h-8" />
          </>
        )}
        <div className="mx-auto w-full max-w-2xl">
          <div
            // Drop zone for files. dragDepth (a counter, not a flag) survives the
            // dragenter/dragleave churn from child elements so the highlight only
            // clears when the cursor truly leaves the box.
            onDragEnter={(e) => {
              e.preventDefault();
              setDragDepth((d) => d + 1);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragDepth((d) => Math.max(0, d - 1))}
            onDrop={handleDrop}
            className={`relative rounded-lg border bg-elevated transition-colors ${
              dragDepth > 0
                ? "border-[#c35ed1] ring-2 ring-[#c35ed1]/40"
                : isLoading
                  ? "aether-loading-border"
                  : "border-border-strong focus-within:border-content-subtle"
            }`}
          >
            {/* Staged-attachment chips: a thumbnail for images, a file icon for
                PDFs, each removable. Sits above the textarea inside the box. */}
            {attachments.length > 0 && (
              <ul className="flex flex-wrap gap-2 px-3 pt-3">
                {attachments.map((a, i) => (
                  <li
                    key={`${a.name}-${i}`}
                    className="group/att relative flex items-center gap-2 rounded-lg border border-border-strong bg-surface py-1 pr-2 pl-1"
                  >
                    {a.kind === "image" && a.previewUrl ? (
                      <img
                        src={a.previewUrl}
                        alt={a.name}
                        className="h-9 w-9 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded bg-elevated text-content-muted">
                        <FileText size={18} />
                      </span>
                    )}
                    <span className="max-w-32 truncate text-xs text-content-muted">
                      {a.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => removeAttachment(i)}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-content-subtle transition-colors hover:bg-elevated hover:text-content"
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              ref={textareaRef}
              value={draft}
              // Don't autofocus on mobile: it slams the keyboard open the moment
              // the app loads (and was part of the on-load zoom). Desktop keeps it.
              autoFocus={!isMobile}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Type a message… (Shift+Enter for newline)"
              rows={1}
              // text-base (16px) on mobile: iOS Safari auto-zooms the page when a
              // focused input has font-size < 16px, and with autoFocus that fires
              // on load — leaving the whole UI zoomed in. 16px disables that zoom.
              className={`w-full resize-none bg-transparent px-4 pt-3 pb-10 text-sm max-md:text-base text-content placeholder:text-content-subtle focus:outline-none transition-opacity${isLoading ? " opacity-50" : ""}${started ? "" : " min-h-24"}`}
            />
            {/* Attach (+) button — bottom-left. Opens the hidden file picker;
                images can also be pasted or dropped anywhere in the box. */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                // Reset so re-picking the same file fires onChange again.
                e.target.value = "";
              }}
            />
            <div className="absolute bottom-2 left-2 flex items-center">
              <Tooltip label="Attach image or PDF" side="top">
                <button
                  type="button"
                  aria-label="Attach image or PDF"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-border-strong text-content-muted transition hover:bg-surface hover:text-content max-md:h-11 max-md:w-11"
                >
                  <Plus size={18} />
                </button>
              </Tooltip>
            </div>
            <div className="absolute bottom-2 right-2 flex items-center gap-2">
              {/* Model picker — which Claude answers this conversation. */}
              <ModelPicker
                value={model}
                onChange={selectModel}
                disabled={isLoading}
              />
              {/* Send / Stop. The button is a STOP control only while a turn is
                streaming AND the field is empty; the moment there's text to send
                it's a Send button again (the new message queues behind the running
                turn — see useChat). In stop mode the lotus spins to signal work in
                flight and swaps to a stop square on hover (touch shows the square
                outright, since there's no hover). */}
              <Tooltip
                label={isStop ? "Stop generating" : "Send message"}
                side="top"
                className="group"
              >
                <button
                  // Stop mode is an abort control, not a submit — `button` type so
                  // it never re-submits the form, and it stays enabled. Otherwise
                  // it's a normal submit (which queues when a turn is in flight).
                  type={isStop ? "button" : "submit"}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    if (isStop) abortStream();
                  }}
                  aria-label={isStop ? "Stop generating" : "Send message"}
                  className="relative flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gradient-to-r from-[#fd40a4] to-[#c35ed1] text-2xl leading-none text-white transition hover:brightness-110 disabled:opacity-40 max-md:h-11 max-md:w-11"
                  // Disabled only when there's nothing to do: not in stop mode and
                  // nothing staged (empty field + no attachments). Stop mode is
                  // always actionable.
                  disabled={!isStop && !hasStaged}
                >
                  {isStop ? (
                    <>
                      {/* Spinning lotus: the desktop "working" signal. Hidden on
                          desktop hover (swaps to the stop square below) and on
                          touch (no hover, so the stop square shows instead). */}
                      <span
                        aria-hidden="true"
                        className="animate-spin text-2xl leading-none group-hover:hidden max-md:hidden"
                      >
                        𑁍
                      </span>
                      {/* Stop square: shown on desktop hover, and always on touch. */}
                      <span
                        aria-hidden="true"
                        className="hidden h-2.5 w-2.5 rounded-xs bg-white group-hover:block max-md:block max-md:h-3 max-md:w-3"
                      />
                    </>
                  ) : (
                    <span>𑁍</span>
                  )}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
        {/* Empty state: a big flexible spacer below the input pushes the whole
            hero + pills + input cluster up into the top portion of the column,
            so the input is never pinned to the bottom on a tall viewport. */}
        {!started && <div className="flex-1" />}
      </form>
    </div>
  );
}

function ConversationTitle({
  title,
  topicIcon,
  onRename,
}: {
  title: string | null;
  topicIcon: string | null;
  onRename: (t: string) => void;
}) {
  // The model's PascalCase suggestion, validated to a real lucide name. When none
  // resolves (old convos, or the model returned nothing) we fall back to the
  // brand's Brahmi lotus glyph 𑁍 — the same mark as the Send button — rather than
  // a generic chat icon.
  const TopicIcon = topicIcon ? resolveVocabularyIcon(topicIcon) : null;
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
      <div className="aether-titlebar-texture relative flex h-11 items-center justify-center border-b border-border px-4">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          className="w-full max-w-sm rounded-md bg-elevated px-3 py-1 text-[0.9375rem] text-content outline-none ring-1 ring-border-strong text-center"
        />
      </div>
    );
  }

  return (
    <div className="aether-titlebar-texture relative flex h-11 items-center border-b border-border">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex h-full w-full items-center justify-center gap-1.5 px-4 text-[0.9375rem] text-content-muted hover:text-content transition-colors"
      >
        {TopicIcon ? (
          <TopicIcon
            className="h-4 w-4 shrink-0 text-content-subtle group-hover:text-content transition-colors"
            aria-hidden
          />
        ) : (
          <span
            aria-hidden
            className="shrink-0 text-xl leading-none text-content-subtle group-hover:text-content transition-colors"
          >
            𑁍
          </span>
        )}
        <span className="max-w-sm truncate font-display">{title ?? "·"}</span>
        {/* Edit affordance: shown on touch (no hover), reveal-on-hover on desktop. */}
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity md:opacity-0 md:group-hover:opacity-100"
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
