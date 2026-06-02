import { useCallback, useEffect, useRef, useState } from "react";

export interface Session {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface UseSessionListResult {
  sessions: Session[];
  refresh: () => void;
}

export function useSessionList(userId: string): UseSessionListResult {
  const [sessions, setSessions] = useState<Session[]>([]);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const refresh = useCallback(() => {
    fetch(`/api/sessions?userId=${encodeURIComponent(userIdRef.current)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Session[]>;
      })
      .then(setSessions)
      .catch((err) => console.error("Failed to load sessions:", err));
  }, []); // stable — reads userId via ref, never recreated

  // Fetch once on mount only.
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessions, refresh };
}
