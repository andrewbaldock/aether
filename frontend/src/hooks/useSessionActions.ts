import { useCallback } from "react";
import type { Message } from "../shell/useChat";

interface UseSessionActionsArgs {
  // The currently active session id, or null before the first message.
  sessionId: string | null;
  // Point at an existing session and hydrate its messages into the view.
  switchSession: (id: string, messages: Message[]) => void;
  // Reset to a fresh, unsent conversation.
  startNewConversation: () => void;
  // Re-fetch the session list (after a rename or delete).
  refreshSessions: () => void;
}

export interface SessionActions {
  loadSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
}

// Session-list CRUD, lifted out of the Sidebar so it's pure UI. The fetch +
// state-mutation logic lives here alongside the other session hooks.
export function useSessionActions({
  sessionId,
  switchSession,
  startNewConversation,
  refreshSessions,
}: UseSessionActionsArgs): SessionActions {
  const loadSession = useCallback(
    async (id: string) => {
      if (id === sessionId) return;
      try {
        const res = await fetch(`/api/sessions/${id}/messages`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const dbMessages = (await res.json()) as {
          id: string;
          role: "user" | "assistant";
          content: string;
        }[];
        const messages: Message[] = dbMessages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.content,
        }));
        switchSession(id, messages);
      } catch (err) {
        console.error("Failed to load session messages:", err);
      }
    },
    [sessionId, switchSession]
  );

  const renameSession = useCallback(
    async (id: string, title: string) => {
      try {
        const res = await fetch(`/api/sessions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        refreshSessions();
      } catch (err) {
        console.error("Failed to rename session:", err);
      }
    },
    [refreshSessions]
  );

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        refreshSessions();
        // If the deleted session was active, start fresh.
        if (id === sessionId) startNewConversation();
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    },
    [sessionId, refreshSessions, startNewConversation]
  );

  return { loadSession, renameSession, deleteSession };
}
