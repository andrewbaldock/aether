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
  dataSources: {
    wikidata: ProviderResult;
    wikidataSearch: ProviderResult;
    worldBank: ProviderResult;
    wikipedia: ProviderResult;
    openalex: ProviderResult;
    wikimedia: ProviderResult;
    unsplash: ProviderResult;
  };
}

export function useHealthFull() {
  return useQuery<HealthFullResult>({
    queryKey: ["health", "full"],
    queryFn: () => apiFetch<HealthFullResult>("/api/health/full"),
    // Auto-run when the page opens so it's live on arrival; the button (refetch)
    // re-probes on demand. Don't re-fire on window focus — that'd re-probe every
    // external service each time the user tabs back.
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
