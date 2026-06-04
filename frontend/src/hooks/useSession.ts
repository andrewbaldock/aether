import { useCallback, useRef, useState } from "react";

interface UseSessionResult {
  sessionId: string | null;
  // Optional initial graph mode — used only when a brand-new session is created,
  // so a fresh conversation inherits the caller's last-used mode.
  getOrCreateSession: (graphMode?: boolean) => Promise<string>;
  setSession: (id: string) => void;
  resetSession: () => void;
}

export function useSession(
  userId: string,
  onNewSession?: () => void
): UseSessionResult {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const pendingRef = useRef<Promise<string> | null>(null);
  // Ref so onNewSession is always current without being a useCallback dep.
  const onNewSessionRef = useRef(onNewSession);
  onNewSessionRef.current = onNewSession;

  const getOrCreateSession = useCallback(
    async (graphMode?: boolean): Promise<string> => {
      if (sessionId) return sessionId;
      if (pendingRef.current) return pendingRef.current;

      const pending = fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ...(graphMode === undefined ? {} : { graphMode }),
        }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<{ id: string }>;
        })
        .then((data) => {
          setSessionId(data.id);
          pendingRef.current = null;
          onNewSessionRef.current?.();
          return data.id;
        })
        .catch((err) => {
          pendingRef.current = null;
          console.error("Failed to create session:", err);
          throw err;
        });

      pendingRef.current = pending;
      return pending;
    },
    [userId, sessionId]
  );

  // Point at an existing session (e.g. the user clicked a past conversation).
  // Clears any pending create so the next getOrCreateSession returns this id.
  const setSession = useCallback((id: string) => {
    setSessionId(id);
    pendingRef.current = null;
  }, []);

  const resetSession = useCallback(() => {
    setSessionId(null);
    pendingRef.current = null;
  }, []);

  return { sessionId, getOrCreateSession, setSession, resetSession };
}
