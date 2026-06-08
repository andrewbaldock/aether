import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { apiFetch } from "../lib/queryClient";
import { sessionsKey } from "./useSessionList";

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
  onNewSession?: (id: string) => void
): UseSessionResult {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Dedups concurrent creates: getOrCreateSession can be called twice before the
  // first POST resolves; both callers should share one in-flight create.
  const pendingRef = useRef<Promise<string> | null>(null);
  // Ref so onNewSession is always current without being a useCallback dep.
  const onNewSessionRef = useRef(onNewSession);
  onNewSessionRef.current = onNewSession;

  const createSession = useMutation({
    mutationKey: ["createSession"],
    mutationFn: (graphMode?: boolean) =>
      apiFetch<{ id: string }>("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ...(graphMode === undefined ? {} : { graphMode }),
        }),
      }),
  });

  const getOrCreateSession = useCallback(
    async (graphMode?: boolean): Promise<string> => {
      if (sessionId) return sessionId;
      if (pendingRef.current) return pendingRef.current;

      const pending = createSession
        .mutateAsync(graphMode)
        .then((data) => {
          setSessionId(data.id);
          pendingRef.current = null;
          queryClient.invalidateQueries({ queryKey: sessionsKey(userId) });
          onNewSessionRef.current?.(data.id);
          return data.id;
        })
        .catch((err) => {
          pendingRef.current = null;
          throw err;
        });

      pendingRef.current = pending;
      return pending;
    },
    [userId, sessionId, createSession, queryClient]
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
