import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/queryClient";
import { sessionsKey } from "./useSessionList";

// Patches fields on a session row (e.g. graph_mode, model, title) and refreshes
// the cached session list so derived UI recomputes from the row.
export function useUpdateSession(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["updateSession"],
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Record<string, unknown>;
    }) =>
      apiFetch<void>(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: sessionsKey(userId) }),
  });
}
