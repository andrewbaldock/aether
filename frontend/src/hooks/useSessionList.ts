import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { TilesLayoutItem } from "../lib/composition";
import { apiFetch } from "../lib/queryClient";

export interface Session {
  id: string;
  user_id: string;
  title: string | null;
  // Model-chosen lucide icon name (PascalCase) matching the topic; null until
  // the conversation is auto-titled. Validated against the real lucide set
  // before rendering (see capabilities/widgets/vocabularyIcon.tsx).
  topic_icon: string | null;
  graph_mode: boolean;
  // The Claude model last selected for this conversation; null = server default.
  model: string | null;
  // Frontend-owned per-conversation UI memory (e.g. which capability tab was
  // last on top, and the Tiles canvas arrangement). Open-ended; null = nothing
  // remembered.
  ui_state: {
    activeWidget?: string | null;
    tilesLayout?: TilesLayoutItem[];
    // Schema version of the persisted tilesLayout. Stored as a sibling (rather
    // than inline on the array) since the array shape is awkward to stamp. A
    // mismatch on load → ignore the saved arrangement and auto-place. See
    // lib/schemaVersion.ts.
    tilesLayoutVersion?: number;
    // Card ids (`${capability}:${entryId}`) the user has hidden from the Bigsail
    // canvas. A hide, not a delete — the widget still lives in its tool tab and
    // can be re-added from there.
    hiddenCards?: string[];
  } | null;
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
  // Memoized so its identity is honestly stable for consumers that hold it
  // (e.g. useChat's SSE callbacks) rather than relying on them to ref it.
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: sessionsKey(userId) }),
    [queryClient, userId]
  );

  return { sessions: data ?? [], refresh };
}
