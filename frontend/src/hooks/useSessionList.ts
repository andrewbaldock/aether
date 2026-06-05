import { useCallback, useEffect, useState } from "react";

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

export function useSessionList(userId: string): UseSessionListResult {
  const [sessions, setSessions] = useState<Session[]>([]);

  // userId is a stable per-browser id (localStorage), so refresh is effectively
  // stable too — but we depend on it honestly rather than hiding it behind a ref.
  const refresh = useCallback(() => {
    fetch(`/api/sessions?userId=${encodeURIComponent(userId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Session[]>;
      })
      .then(setSessions)
      .catch((err) => console.error("Failed to load sessions:", err));
  }, [userId]);

  // Fetch once on mount only.
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessions, refresh };
}
