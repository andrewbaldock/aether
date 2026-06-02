import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSession } from "../hooks/useSession";
import { type Session, useSessionList } from "../hooks/useSessionList";
import { useUserId } from "../hooks/useUserId";
import type { Message } from "./useChat";

interface SessionContextValue {
  userId: string;
  // null until first message sent — session is created lazily.
  sessionId: string | null;
  sessions: Session[];
  messages: Message[];
  onMessagesChange: (messages: Message[]) => void;
  clearMessages: () => void;
  // Resolves to the current session ID, creating one if needed.
  getOrCreateSession: () => Promise<string>;
  switchSession: (id: string, messages: Message[]) => void;
  startNewConversation: () => void;
  refreshSessions: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const userId = useUserId();
  const [messages, setMessages] = useState<Message[]>([]);
  const { sessions, refresh: refreshSessions } = useSessionList(userId);

  const { sessionId, getOrCreateSession, resetSession } = useSession(
    userId,
    refreshSessions
  );

  // Track active session for sidebar highlighting — follows sessionId from
  // useSession OR switches when the user clicks a past session.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId && sessionId !== activeSessionId) {
      setActiveSessionId(sessionId);
    }
  }, [sessionId, activeSessionId]);

  const switchSession = useCallback((id: string, loaded: Message[]) => {
    setActiveSessionId(id);
    setMessages(loaded);
  }, []);

  const startNewConversation = useCallback(() => {
    resetSession();
    setMessages([]);
    setActiveSessionId(null);
  }, [resetSession]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return (
    <SessionContext.Provider
      value={{
        userId,
        sessionId: activeSessionId,
        sessions,
        messages,
        onMessagesChange: setMessages,
        clearMessages,
        getOrCreateSession,
        switchSession,
        startNewConversation,
        refreshSessions,
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
