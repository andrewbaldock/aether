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
        rows?.map((row) => (row.id === id ? { ...row, ...patch } : row))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    // Re-sync with the server whether it succeeded or failed.
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
