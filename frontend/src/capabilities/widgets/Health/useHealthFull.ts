import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/queryClient";

export interface ProviderResult {
  ok: boolean;
  configured: boolean;
  latencyMs: number;
  error?: string;
}

export interface HealthFullResult {
  supabase: { ok: boolean; latencyMs: number; error?: string };
  providers: {
    claude: ProviderResult;
    google: ProviderResult;
    deepseek: ProviderResult;
    mistral: ProviderResult;
  };
}

export function useHealthFull() {
  return useQuery<HealthFullResult>({
    queryKey: ["health", "full"],
    queryFn: () => apiFetch<HealthFullResult>("/api/health/full"),
    // Manual refresh only — user clicks the refresh button.
    staleTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled: false,
    retry: false,
  });
}
