import { useCallback, useMemo } from "react";
import { useUpdateSession } from "../../../hooks/useUpdateSession";
import { useSessionContext } from "../../../shell/SessionContext";

// The set of Bigsail cards the user has HIDDEN from the canvas, persisted per
// conversation in session.ui_state.hiddenCards. Hiding is reversible (NOT a delete):
// the widget still lives in its tool tab and can be re-added from there. The card id
// is the stable `${capability}:${entryId}` key.
//
// Both BigsailWidget (to filter the canvas) and the tool tabs (to show a re-add
// button on a hidden entry) read this one hook, so the hide state has a single
// source of truth. Writes go through useUpdateSession, whose ui_state patch is
// deep-merged — so patching only { hiddenCards } never clobbers tilesLayout or
// activeWidget.

export interface HiddenCards {
  hidden: Set<string>;
  isHidden: (cardId: string) => boolean;
  hide: (cardId: string) => void;
  unhide: (cardId: string) => void;
}

export function useHiddenCards(): HiddenCards {
  const { userId, sessionId, sessions } = useSessionContext();
  const updateSession = useUpdateSession(userId);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === sessionId) ?? null,
    [sessions, sessionId]
  );

  const hidden = useMemo(
    () => new Set(currentSession?.ui_state?.hiddenCards ?? []),
    [currentSession]
  );

  const persist = useCallback(
    (next: Set<string>) => {
      if (!sessionId) return;
      updateSession.mutate({
        id: sessionId,
        // Deep-merged into ui_state — siblings (tilesLayout, activeWidget) survive.
        patch: { ui_state: { hiddenCards: [...next] } },
      });
    },
    [sessionId, updateSession]
  );

  const isHidden = useCallback((cardId: string) => hidden.has(cardId), [hidden]);

  const hide = useCallback(
    (cardId: string) => {
      if (hidden.has(cardId)) return;
      persist(new Set(hidden).add(cardId));
    },
    [hidden, persist]
  );

  const unhide = useCallback(
    (cardId: string) => {
      if (!hidden.has(cardId)) return;
      const next = new Set(hidden);
      next.delete(cardId);
      persist(next);
    },
    [hidden, persist]
  );

  return { hidden, isHidden, hide, unhide };
}
