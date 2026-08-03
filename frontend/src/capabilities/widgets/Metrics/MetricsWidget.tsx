import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { AdminPage } from "../../../shell/AdminPage";
import type { Widget } from "../../registry";
import { type MetricsResult, useMetrics } from "./useMetrics";

// Google's Core Web Vitals thresholds (good / needs-improvement boundaries).
// LCP & INP are milliseconds; CLS is a unitless ratio.
const VITAL_THRESHOLDS: Record<
  "LCP" | "INP" | "CLS",
  { good: number; poor: number; unit: string }
> = {
  LCP: { good: 2500, poor: 4000, unit: "ms" },
  INP: { good: 200, poor: 500, unit: "ms" },
  CLS: { good: 0.1, poor: 0.25, unit: "" },
};

// Optional deep-links to the external dashboards — shown only when configured.
const DASHBOARDS: [string, string | undefined][] = [
  ["PostHog", import.meta.env.VITE_POSTHOG_DASHBOARD_URL as string | undefined],
  ["Sentry", import.meta.env.VITE_SENTRY_DASHBOARD_URL as string | undefined],
  [
    "Speed Insights",
    import.meta.env.VITE_SPEED_INSIGHTS_URL as string | undefined,
  ],
];

export function MetricsWidget(_props: { widget: Widget }) {
  const { data, isFetching, refetch } = useMetrics();

  return (
    <AdminPage
      title="Metrics"
      actions={
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-content-muted transition-colors hover:border-content-muted hover:text-content disabled:opacity-50"
          aria-label="Refresh metrics"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            aria-hidden
          />
          {isFetching ? "Loading…" : "Refresh"}
        </button>
      }
    >
      <p className="mt-2 text-sm text-content-muted">
        How each feature is doing, measured from real usage. Deep product
        funnels live in PostHog; full error traces in Sentry; device web-vitals
        in Vercel Speed Insights.
      </p>

      {!data ? (
        <p className="mt-6 text-sm text-content-subtle">
          {isFetching ? "Loading metrics…" : "No data yet."}
        </p>
      ) : (
        <MetricsBody data={data} />
      )}

      {DASHBOARDS.some(([, url]) => url) && (
        <div className="mt-6 flex flex-wrap gap-2">
          {DASHBOARDS.filter(([, url]) => url).map(([label, url]) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs text-content-muted transition-colors hover:border-content-muted hover:text-content"
            >
              {label} ↗
            </a>
          ))}
        </div>
      )}
    </AdminPage>
  );
}

function MetricsBody({ data }: { data: MetricsResult }) {
  const maxWidget = Math.max(1, ...Object.values(data.widgetUsage));
  const maxModel = Math.max(1, ...data.modelDistribution.map((m) => m.count));

  return (
    <>
      {/* Product usage */}
      <Section title="Product" className="mt-6">
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <Stat label="Conversations" value={data.sessions} />
          <Stat label="Messages" value={data.messages} />
          <Stat
            label="Msgs / conversation"
            value={data.avgMessagesPerSession.toFixed(1)}
          />
          <Stat
            label="Graph-mode adoption"
            value={`${data.graphModeAdoptionPct.toFixed(0)}%`}
          />
        </div>
      </Section>

      {/* Feature adoption — how often each render capability actually produced a widget */}
      <Section title="Feature adoption (sessions with output)" className="mt-4">
        <div className="space-y-2 p-4">
          <Bar label="Table" value={data.widgetUsage.table} max={maxWidget} />
          <Bar label="Chart" value={data.widgetUsage.chart} max={maxWidget} />
          <Bar
            label="Timeline"
            value={data.widgetUsage.timeline}
            max={maxWidget}
          />
          <Bar label="Images" value={data.widgetUsage.images} max={maxWidget} />
        </div>
      </Section>

      {/* Model distribution */}
      <Section title="Model distribution" className="mt-4">
        <div className="space-y-2 p-4">
          {data.modelDistribution.map((m) => (
            <Bar key={m.id} label={m.label} value={m.count} max={maxModel} />
          ))}
        </div>
      </Section>

      {/* Web vitals */}
      <Section title="Web vitals (real-device average)" className="mt-4">
        <div className="grid grid-cols-3 gap-3 p-4">
          {(["LCP", "INP", "CLS"] as const).map((name) => (
            <VitalStat key={name} name={name} value={data.vitals[name]} />
          ))}
        </div>
      </Section>

      {/* Reliability */}
      <Section title="Reliability" className="mt-4">
        <div className="grid grid-cols-3 gap-3 p-4">
          <Stat
            label="Error rate"
            value={`${data.errorRatePct.toFixed(1)}%`}
            tone={
              data.errorRatePct > 5
                ? "bad"
                : data.errorRatePct > 1
                  ? "warn"
                  : "good"
            }
          />
          <Stat label="Errors" value={data.errors} />
          <Stat label="Chat turns" value={data.chatTurns} />
        </div>
      </Section>
    </>
  );
}

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
      {children}
    </div>
  );
}

const TONE_CLASS: Record<string, string> = {
  good: "text-green-400",
  warn: "text-amber-400",
  bad: "text-red-400",
  neutral: "text-content",
};

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  return (
    <div>
      <div
        className={`text-2xl font-semibold tabular-nums ${TONE_CLASS[tone]}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-content-muted">{label}</div>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs text-content-muted">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
        <div
          className="h-full rounded-full bg-content-muted"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-content">
        {value}
      </span>
    </div>
  );
}

function VitalStat({
  name,
  value,
}: {
  name: "LCP" | "INP" | "CLS";
  value: number | null;
}) {
  const t = VITAL_THRESHOLDS[name];
  const tone =
    value == null
      ? "neutral"
      : value <= t.good
        ? "good"
        : value <= t.poor
          ? "warn"
          : "bad";
  const display =
    value == null
      ? "—"
      : name === "CLS"
        ? value.toFixed(2)
        : `${Math.round(value)}${t.unit}`;
  return <Stat label={name} value={display} tone={tone} />;
}
