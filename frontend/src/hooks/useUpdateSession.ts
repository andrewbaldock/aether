import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/queryClient";
import { type Session, sessionsKey } from "./useSessionList";

interface UpdateVars {
  id: string;
  // Partial<Session> (not Record<string, unknown>) so a key typo — e.g. writing
  // `graphMode` instead of `graph_mode` — fails to compile rather than silently
  // no-op'ing the optimistic merge below.
  patch: Partial<Session>;
}

// Patches fields on a session row (e.g. graph_mode, model, title). Applies the
// change optimistically to the cached session list so model/graph-mode toggles
// flip instantly instead of lagging a full PATCH round-trip (painful on a Fly
// cold start), then rolls back if the request fails.
export function useUpdateSession(userId: string) {
  const queryClient = useQueryClient();
  const key = sessionsKey(userId);
  return useMutation({
    mutationKey: ["updateSession"],
    mutationFn: ({ id, patch }: UpdateVars) =>
      apiFetch<void>(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onMutate: async ({ id, patch }) => {
      // Cancel in-flight refetches so they can't clobber our optimistic write.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Session[]>(key);
      queryClient.setQueryData<Session[]>(key, (rows) =>
        rows?.map((row) => {
          if (row.id !== id) return row;
          // Deep-merge ui_state so a partial patch (e.g. ChatPanel writing only
          // { activeWidget }) doesn't clobber sibling keys like tilesLayout. The
          // backend's updateSessionUiState read-modify-writes the same way, so the
          // optimistic cache and the persisted row stay symmetric — without this,
          // a tab switch would momentarily drop the saved Bigsail layout until the
          // refetch lands.
          const merged = { ...row, ...patch };
          if (patch.ui_state) {
            merged.ui_state = { ...row.ui_state, ...patch.ui_state };
          }
          return merged;
        })
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Roll back to the pre-mutation snapshot, then re-sync to server truth.
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      queryClient.invalidateQueries({ queryKey: key });
    },
    // NOTE: no success-path invalidation. Every patch here writes fields the client
    // already knows (tilesLayout, activeWidget, model), so the optimistic onMutate
    // write IS the truth — a refetch would only echo it back. Worse, it CLOSED A
    // LOOP: a Bigsail layout PATCH → invalidate → GET → new session-array identity →
    // `placed` recomputes → GridStack reconcile → grid.update() → `change` → another
    // PATCH, forever (the GET/PATCH/GET/PATCH storm in the network panel). Server-
    // derived fields (auto title / topic_icon) are refetched on their own path
    // (SSE `done` → refreshSessions), not here, so dropping this loses no real sync.
  });
}
