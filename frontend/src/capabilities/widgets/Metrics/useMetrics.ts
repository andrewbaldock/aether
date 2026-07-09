import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/queryClient";

// Mirrors MetricsResult in backend/src/metrics.ts (the wire contract). Kept in
// sync by hand — it's a small, stable shape.
export interface MetricsResult {
  sessions: number;
  messages: number;
  avgMessagesPerSession: number;
  graphModeAdoptionPct: number;
  widgetUsage: {
    table: number;
    chart: number;
    timeline: number;
    images: number;
  };
  modelDistribution: { id: string; label: string; count: number }[];
  errorRatePct: number;
  chatTurns: number;
  errors: number;
  vitals: { LCP: number | null; INP: number | null; CLS: number | null };
}

export function useMetrics() {
  return useQuery<MetricsResult>({
    queryKey: ["metrics"],
    queryFn: () => apiFetch<MetricsResult>("/api/metrics"),
    // The endpoint caches 60s server-side; don't refetch on focus.
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
