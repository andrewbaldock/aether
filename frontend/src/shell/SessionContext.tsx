import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { navigate, parseRoute, viewPath } from "../hooks/useRoute";
import { useSession } from "../hooks/useSession";
import {
  type SessionActions,
  useSessionActions,
} from "../hooks/useSessionActions";
import { type Session, useSessionList } from "../hooks/useSessionList";
import { useUserId } from "../hooks/useUserId";
import type { Message } from "./useChat";

interface SessionContextValue extends SessionActions {
  userId: string;
  // null until first message sent — session is created lazily.
  sessionId: string | null;
  sessions: Session[];
  messages: Message[];
  onMessagesChange: (messages: Message[]) => void;
  // Resolves to the current session ID, creating one if needed. An optional
  // graphMode is applied only when a brand-new session is created.
  getOrCreateSession: (graphMode?: boolean) => Promise<string>;
  switchSession: (id: string, messages: Message[]) => void;
  startNewConversation: () => void;
  refreshSessions: () => void;
  // True the one time the page is opened/refreshed straight onto a /c/:id URL (a
  // cold URL/refresh load). Bigsail consumes it once to play the deliberate
  // restore-loading sequence; in-app sidebar switches never set it, so they stay
  // instant. consume returns true exactly once, then resets to false.
  consumeColdUrlLoad: () => boolean;
  // useChat registers its stream-abort here so the context can cancel an
  // in-flight turn before switching conversations.
  registerAbort: (fn: () => void) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const userId = useUserId();
  const [messages, setMessages] = useState<Message[]>([]);
  const { sessions, refresh: refreshSessions } = useSessionList(userId);

  // sessionId from useSession is the single source of truth — it drives both
  // session creation/persistence and sidebar highlighting. When the first message
  // creates the session, carry whatever bare tool view the user was on (/chart →
  // /c/:newId/chart) so starting a conversation doesn't yank them off that tab.
  const onNewSession = useCallback(
    (newId: string) => {
      refreshSessions();
      const current = parseRoute(location.pathname);
      const view = current.type === "workspace" ? current.view : null;
      navigate(viewPath(newId, view));
    },
    [refreshSessions]
  );

  const { sessionId, getOrCreateSession, setSession, resetSession } =
    useSession(userId, onNewSession);

  // useChat owns the AbortController; it registers its abort here on mount so
  // switchSession/startNewConversation can cancel an in-flight stream.
  const abortStreamRef = useRef<() => void>(() => {});
  const registerAbort = useCallback((fn: () => void) => {
    abortStreamRef.current = fn;
  }, []);

  // One-shot "this session arrived via a cold URL/refresh load" flag. Initialized
  // SYNCHRONOUSLY at first render from the initial URL — a /c/:id path on the very
  // first paint means the page was opened/refreshed straight onto a conversation
  // (vs. an in-app sidebar switch, which mutates the URL later via navigation).
  // Must be set here, in the provider's render, not in a child effect: child render
  // (Bigsail's lazy useState consumes this) runs before any parent effect fires, so
  // an effect-based mark would always lose the race. Ref-backed so consume-once is
  // race-free and costs no render. Bigsail consumes it to play the restore-loading
  // sequence; consume returns true exactly once, then resets to false.
  const coldUrlLoadRef = useRef<boolean | null>(null);
  if (coldUrlLoadRef.current === null) {
    const r = parseRoute(location.pathname);
    coldUrlLoadRef.current = r.type === "workspace" && !!r.sessionId;
  }
  const consumeColdUrlLoad = useCallback(() => {
    const was = coldUrlLoadRef.current === true;
    coldUrlLoadRef.current = false;
    return was;
  }, []);

  const switchSession = useCallback(
    (id: string, loaded: Message[]) => {
      abortStreamRef.current();
      setSession(id);
      setMessages(loaded);
    },
    [setSession]
  );

  const startNewConversation = useCallback(() => {
    abortStreamRef.current();
    resetSession();
    setMessages([]);
    navigate("/");
  }, [resetSession]);

  const actions = useSessionActions({
    userId,
    sessionId,
    switchSession,
    startNewConversation,
  });

  return (
    <SessionContext.Provider
      value={{
        userId,
        sessionId,
        sessions,
        messages,
        onMessagesChange: setMessages,
        getOrCreateSession,
        switchSession,
        startNewConversation,
        refreshSessions,
        registerAbort,
        consumeColdUrlLoad,
        ...actions,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

// The auto-generated title of the active conversation (its subject), or null when
// there's no current session or it hasn't been titled yet. Convenience over the
// raw sessions/sessionId lookup — used by widget headers to read "what is this chat
// about" for a subject-flavoured label.
export function useCurrentSessionTitle(): string | null {
  const { sessions, sessionId } = useSessionContext();
  return sessions.find((s) => s.id === sessionId)?.title ?? null;
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx)
    throw new Error("useSessionContext must be used within SessionProvider");
  return ctx;
}
