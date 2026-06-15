import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { AdminPage } from "../../../shell/AdminPage";
import { Tooltip } from "../../../shell/Tooltip";
import type { Widget } from "../../registry";
import { type HealthFullResult, useHealthFull } from "./useHealthFull";

// Static label → key lists, so every row renders (as a PendingRow) before the
// first check too — the page documents what it covers even when idle. Keys are
// typed against the result shape so the data lookups stay sound.
const PROVIDER_ROWS: ReadonlyArray<
  [string, keyof HealthFullResult["providers"]]
> = [
  ["Anthropic (Claude)", "claude"],
  ["Google Gemini", "google"],
  ["DeepSeek", "deepseek"],
  ["Mistral", "mistral"],
];

const DATA_SOURCE_ROWS: ReadonlyArray<
  [string, keyof HealthFullResult["dataSources"]]
> = [
  ["Wikidata", "wikidata"],
  ["Wikidata search", "wikidataSearch"],
  ["World Bank", "worldBank"],
  ["Wikipedia", "wikipedia"],
  ["OpenAlex", "openalex"],
  ["Wikimedia Commons", "wikimedia"],
  ["Unsplash", "unsplash"],
];

export function HealthWidget(_props: { widget: Widget }) {
  const { data, isFetching, dataUpdatedAt, refetch } = useHealthFull();

  return (
    <AdminPage
      title="System Health"
      actions={
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-content-muted transition-colors hover:border-content-muted hover:text-content disabled:opacity-50"
          aria-label="Run health checks"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            aria-hidden
          />
          {isFetching ? "Checking…" : "Check now"}
        </button>
      }
    >
      {!data && !isFetching && (
        <p className="mt-6 text-sm text-content-muted">
          Everything the app depends on is listed below. Click{" "}
          <span className="text-content">Check now</span> to probe each one.
        </p>
      )}

      {/* Services — Supabase + every LLM provider. Rows render even before the
            first check so the page always documents what it covers. */}
      <Section title="Services" className="mt-6">
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
        {PROVIDER_ROWS.map(([label, key]) =>
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
      </Section>

      {/* Data sources — every keyless/keyed source the agent draws on. */}
      <Section title="Data sources" className="mt-4">
        {DATA_SOURCE_ROWS.map(([label, key]) =>
          data ? (
            <CheckRow
              key={key}
              label={label}
              ok={data.dataSources[key].ok}
              configured={data.dataSources[key].configured}
              latencyMs={data.dataSources[key].latencyMs}
              error={data.dataSources[key].error}
            />
          ) : (
            <PendingRow key={key} label={label} />
          )
        )}
      </Section>

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
    </AdminPage>
  );
}

// A bordered, titled group of check rows. Renders its frame unconditionally so
// the section (and its pending rows) is visible before any check has run.
function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-border ${className ?? ""}`}
    >
      <div className="border-b border-border bg-surface-raised px-3 py-2 text-xs font-medium uppercase tracking-wide text-content">
        {title}
      </div>
      <div className="divide-y divide-border">{children}</div>
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

function StatusDot({ ok, configured }: { ok: boolean; configured: boolean }) {
  if (!configured) {
    return (
      <Tooltip label="Not configured" className="mt-0.5 shrink-0">
        <span
          className="h-2 w-2 rounded-full bg-amber-400"
          aria-label="Not configured"
        />
      </Tooltip>
    );
  }
  const label = ok ? "OK" : "Error";
  return (
    <Tooltip label={label} className="mt-0.5 shrink-0">
      <span
        className={`h-2 w-2 rounded-full ${ok ? "bg-green-400" : "bg-red-400"}`}
        aria-label={label}
      />
    </Tooltip>
  );
}
