import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { navigate } from "./useRoute";
import { apiFetch } from "../lib/queryClient";
import type { Message } from "../shell/useChat";
import { type Session, sessionsKey } from "./useSessionList";

interface UseSessionActionsArgs {
  // The user whose session list should be invalidated after a mutation.
  userId: string;
  // The currently active session id, or null before the first message.
  sessionId: string | null;
  // Point at an existing session and hydrate its messages into the view.
  switchSession: (id: string, messages: Message[]) => void;
  // Reset to a fresh, unsent conversation.
  startNewConversation: () => void;
}

export interface SessionActions {
  loadSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
}

interface DbMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// Session-list CRUD, lifted out of the Sidebar so it's pure UI. Reads go through
// the query cache; writes are mutations that invalidate the session list.
export function useSessionActions({
  userId,
  sessionId,
  switchSession,
  startNewConversation,
}: UseSessionActionsArgs): SessionActions {
  const queryClient = useQueryClient();
  const invalidateSessions = useCallback(
    () => queryClient.invalidateQueries({ queryKey: sessionsKey(userId) }),
    [queryClient, userId]
  );

  const loadSession = useCallback(
    async (id: string) => {
      if (id === sessionId) return;
      // fetchQuery caches the messages so re-opening a recent conversation is instant.
      // The query cache's onError logs failures; bail quietly on error so a failed
      // load doesn't switch the view to an empty conversation.
      let dbMessages: DbMessage[];
      let session: Session;
      try {
        [dbMessages, session] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: ["messages", id],
            queryFn: () => apiFetch<DbMessage[]>(`/api/sessions/${id}/messages`),
          }),
          apiFetch<Session>(`/api/sessions/${id}`),
        ]);
      } catch {
        navigate("/");
        return;
      }
      // Foreign session: fork it into a new session owned by this user, then
      // load the fork. The original is untouched; this user gets their own branch
      // of the conversation from that point forward.
      if (session.user_id !== userId) {
        let forkId: string;
        try {
          const fork = await apiFetch<{ id: string }>(`/api/sessions/${id}/fork`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          forkId = fork.id;
        } catch {
          navigate("/");
          return;
        }
        invalidateSessions();
        // Recurse into the fork — it's now owned by this user, so the foreign
        // branch below won't fire again.
        await loadSession(forkId);
        return;
      }
      const messages: Message[] = dbMessages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.content,
      }));
      switchSession(id, messages);
      navigate(`/c/${id}`);
      // Re-sync the list on switch so any session created moments ago (and briefly
      // untitled in memory) picks up its persisted auto-title from the DB.
      invalidateSessions();
    },
    [sessionId, switchSession, queryClient, invalidateSessions, userId]
  );

  const renameMutation = useMutation({
    mutationKey: ["renameSession"],
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiFetch<void>(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }),
    onSuccess: invalidateSessions,
  });

  const deleteMutation = useMutation({
    mutationKey: ["deleteSession"],
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/sessions/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      invalidateSessions();
      // If the deleted session was active, start fresh.
      if (id === sessionId) startNewConversation();
    },
  });

  // Fire-and-forget from the UI: the mutation cache's onError logs failures, so we
  // swallow the rejection here to avoid unhandled-rejection noise (callers don't await).
  const renameSession = useCallback(
    async (id: string, title: string) => {
      await renameMutation.mutateAsync({ id, title }).catch(() => {});
    },
    [renameMutation]
  );

  const deleteSession = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id).catch(() => {});
    },
    [deleteMutation]
  );

  return { loadSession, renameSession, deleteSession };
}
