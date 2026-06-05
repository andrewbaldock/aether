import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/queryClient";

export interface Session {
  id: string;
  user_id: string;
  title: string | null;
  graph_mode: boolean;
  // The Claude model last selected for this conversation; null = server default.
  model: string | null;
  created_at: string;
  updated_at: string;
}

interface UseSessionListResult {
  sessions: Session[];
  refresh: () => void;
}

// The query key for a user's session list — exported so mutations elsewhere can
// invalidate it after create/rename/delete.
export function sessionsKey(userId: string) {
  return ["sessions", userId] as const;
}

export function useSessionList(userId: string): UseSessionListResult {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: sessionsKey(userId),
    queryFn: () =>
      apiFetch<Session[]>(`/api/sessions?userId=${encodeURIComponent(userId)}`),
  });

  // Kept for API compatibility — callers that want an explicit re-sync can call
  // this; mutations generally invalidate sessionsKey(userId) directly instead.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: sessionsKey(userId) });

  return { sessions: data ?? [], refresh };
}
