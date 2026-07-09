import { getState, incrementCounter } from "./appState";
import { getDb } from "./db";
import { MODELS } from "./models";

// Feature-success metrics for the in-app Metrics widget. Two sources:
//  • the data we already store (sessions/messages) — aggregated with cheap
//    head-only COUNT queries + Supabase JSON filters, so NO new SQL migration
//    is needed (ponytail: aggregate in-query, not via a view). Fine at demo
//    scale; if row counts ever explode, swap these for a materialized view.
//  • app_state counters — request/error totals (for error rate) and web-vitals
//    rolling averages, both bumped via the existing atomic increment RPC.

// ── Web vitals ────────────────────────────────────────────────────────────────
// A rolling average kept as two ATOMIC counters (sum + count) so concurrent
// beacons can't lose samples — avg = sum/count. Values are stored as rounded
// integers (LCP/INP in ms; CLS ×1000, since it's a small fraction) to keep the
// counters whole-number.
export type VitalName = "LCP" | "INP" | "CLS";

export async function recordVital(
  name: VitalName,
  value: number
): Promise<void> {
  const scaled = name === "CLS" ? Math.round(value * 1000) : Math.round(value);
  await Promise.all([
    incrementCounter(`vitals:${name}:sum`, scaled),
    incrementCounter(`vitals:${name}:count`, 1),
  ]);
}

async function vitalAverage(name: VitalName): Promise<number | null> {
  const [sum, count] = await Promise.all([
    getState<number>(`vitals:${name}:sum`),
    getState<number>(`vitals:${name}:count`),
  ]);
  if (!count || count <= 0) return null;
  const avg = Number(sum ?? 0) / Number(count);
  return name === "CLS" ? avg / 1000 : Math.round(avg);
}

// ── Aggregate query helpers ─────────────────────────────────────────────────
// A head-only exact count. Returns 0 on error rather than throwing — one metric
// failing shouldn't blank the whole widget.
async function countSessions(
  build?: (q: ReturnType<typeof sessionsQuery>) => ReturnType<typeof sessionsQuery>
): Promise<number> {
  let q = sessionsQuery();
  if (build) q = build(q);
  const { count, error } = await q;
  if (error) {
    console.error("metrics count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

function sessionsQuery() {
  return getDb().from("sessions").select("*", { count: "exact", head: true });
}

async function countMessages(): Promise<number> {
  const { count, error } = await getDb()
    .from("messages")
    .select("*", { count: "exact", head: true });
  if (error) {
    console.error("metrics message count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

// ── The public shape the widget renders ─────────────────────────────────────
export interface MetricsResult {
  sessions: number;
  messages: number;
  avgMessagesPerSession: number;
  graphModeAdoptionPct: number; // % of sessions run with graph mode on
  widgetUsage: { table: number; chart: number; timeline: number; images: number };
  modelDistribution: { id: string; label: string; count: number }[];
  errorRatePct: number; // errors / chat turns, from app_state counters
  chatTurns: number;
  errors: number;
  vitals: { LCP: number | null; INP: number | null; CLS: number | null };
}

export async function getMetrics(): Promise<MetricsResult> {
  const [
    sessions,
    messages,
    graphModeSessions,
    tableU,
    chartU,
    timelineU,
    imagesU,
    chatTurns,
    errors,
    lcp,
    inp,
    cls,
    ...modelCounts
  ] = await Promise.all([
    countSessions(),
    countMessages(),
    countSessions((q) => q.eq("graph_mode", true)),
    countSessions((q) => q.not("widget_data->table", "is", null)),
    countSessions((q) => q.not("widget_data->chart", "is", null)),
    countSessions((q) => q.not("widget_data->timeline", "is", null)),
    countSessions((q) => q.not("widget_data->images", "is", null)),
    getState<number>("chat:turns").then((v) => Number(v ?? 0)),
    getState<number>("errors:total").then((v) => Number(v ?? 0)),
    vitalAverage("LCP"),
    vitalAverage("INP"),
    vitalAverage("CLS"),
    ...MODELS.map((m) => countSessions((q) => q.eq("model", m.id))),
  ]);

  return {
    sessions,
    messages,
    avgMessagesPerSession: sessions > 0 ? messages / sessions : 0,
    graphModeAdoptionPct: sessions > 0 ? (graphModeSessions / sessions) * 100 : 0,
    widgetUsage: {
      table: tableU,
      chart: chartU,
      timeline: timelineU,
      images: imagesU,
    },
    modelDistribution: MODELS.map((m, i) => ({
      id: m.id,
      label: m.label,
      count: modelCounts[i] ?? 0,
    })),
    chatTurns,
    errors,
    errorRatePct: chatTurns > 0 ? (errors / chatTurns) * 100 : 0,
    vitals: { LCP: lcp, INP: inp, CLS: cls },
  };
}
