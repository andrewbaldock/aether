import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/queryClient";

interface Health {
  ok: boolean;
}

// Polls the backend's health endpoint so the app can surface a clear "backend
// unreachable" state (see BackendStatusBanner) instead of silently failing.
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<Health>("/api/health"),
    refetchInterval: 15_000,
    // Keep checking even when the tab is backgrounded so recovery is noticed.
    refetchIntervalInBackground: true,
  });
}
