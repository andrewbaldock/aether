import { RefreshCw } from "lucide-react";
import type { Widget } from "../../registry";
import { type ProviderResult, useHealthFull } from "./useHealthFull";

export function HealthWidget(_props: { widget: Widget }) {
  const { data, isFetching, dataUpdatedAt, refetch } = useHealthFull();

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-surface">
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-content">
            System Health
          </h1>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-content-muted transition-colors hover:border-content-muted hover:text-content disabled:opacity-50"
            aria-label="Run health checks"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              aria-hidden
            />
            {isFetching ? "Checking…" : "Check now"}
          </button>
        </div>

        {!data && !isFetching && (
          <p className="mt-6 text-sm text-content-muted">
            Click <span className="text-content">Check now</span> to run all
            plumbing checks — Supabase and each LLM provider key.
          </p>
        )}

        {(data || isFetching) && (
          <div className="mt-6 overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-surface-raised px-3 py-2 text-xs font-medium uppercase tracking-wide text-content">
              Services
            </div>

            <div className="divide-y divide-border">
              {/* Supabase */}
              {data ? (
                <CheckRow
                  label="Supabase"
                  ok={data.supabase.ok}
                  configured={true}
                  latencyMs={data.supabase.latencyMs}
                  error={data.supabase.error}
                />
              ) : (
                <PendingRow label="Supabase" />
              )}

              {/* LLM providers */}
              {(
                [
                  ["Anthropic (Claude)", "claude"],
                  ["Google Gemini", "google"],
                  ["DeepSeek", "deepseek"],
                  ["Mistral", "mistral"],
                ] as const
              ).map(([label, key]) =>
                data ? (
                  <CheckRow
                    key={key}
                    label={label}
                    ok={data.providers[key].ok}
                    configured={data.providers[key].configured}
                    latencyMs={data.providers[key].latencyMs}
                    error={data.providers[key].error}
                  />
                ) : (
                  <PendingRow key={key} label={label} />
                )
              )}
            </div>
          </div>
        )}

        {data && dataUpdatedAt > 0 && (
          <p className="mt-3 text-xs text-content-subtle">
            Last checked{" "}
            {new Date(dataUpdatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        )}
      </div>
    </div>
  );
}

function CheckRow({
  label,
  ok,
  configured,
  latencyMs,
  error,
}: {
  label: string;
  ok: boolean;
  configured: boolean;
  latencyMs: number;
  error?: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <StatusDot ok={ok} configured={configured} />
      <div className="min-w-0 flex-1">
        <span className="text-sm text-content">{label}</span>
        {!configured && (
          <span className="ml-2 text-xs text-content-subtle">
            key not configured
          </span>
        )}
        {configured && !ok && error && (
          <p className="mt-0.5 truncate text-xs text-red-400">{error}</p>
        )}
      </div>
      {configured && ok && (
        <span className="shrink-0 text-xs tabular-nums text-content-subtle">
          {latencyMs} ms
        </span>
      )}
    </div>
  );
}

function PendingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="h-2 w-2 shrink-0 rounded-full bg-border" />
      <span className="text-sm text-content-muted">{label}</span>
    </div>
  );
}

function StatusDot({
  ok,
  configured,
}: {
  ok: boolean;
  configured: boolean;
}) {
  if (!configured) {
    return (
      <span
        className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400"
        title="Not configured"
      />
    );
  }
  return (
    <span
      className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-green-400" : "bg-red-400"}`}
      title={ok ? "OK" : "Error"}
    />
  );
}
