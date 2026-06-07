import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/queryClient";

interface Health {
  ok: boolean;
}

// Polls the backend's health endpoint so the app can surface a clear "backend
// unreachable" state (see BackendStatusBanner) instead of silently failing.
//
// DEV-only: the only consumer (BackendStatusBanner) renders nothing in prod, so
// gating the query keeps prod tabs from hammering /api/health every 15s forever
// for a banner that never shows.
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<Health>("/api/health"),
    enabled: import.meta.env.DEV,
    refetchInterval: 15_000,
    // Keep checking even when the tab is backgrounded so recovery is noticed.
    refetchIntervalInBackground: true,
  });
}
