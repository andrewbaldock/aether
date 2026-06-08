import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { navigate } from "../hooks/useRoute";
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
  // session creation/persistence and sidebar highlighting.
  const onNewSession = useCallback(
    (newId: string) => {
      refreshSessions();
      navigate(`/c/${newId}`);
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
        ...actions,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx)
    throw new Error("useSessionContext must be used within SessionProvider");
  return ctx;
}
