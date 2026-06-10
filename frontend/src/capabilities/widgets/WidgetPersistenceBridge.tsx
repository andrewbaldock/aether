import { useEffect, useRef } from "react";
import { apiFetch, logApiError } from "../../lib/queryClient";
import { useSessionContext } from "../../shell/SessionContext";
import { useChartState } from "./Chart/useChartState";
import { useTableState } from "./Table/useTableState";
import { useTimelineState } from "./Timeline/useTimelineState";

const SAVE_DEBOUNCE_MS = 900;

// Bridges the root-level Table and Chart state to per-session persistence,
// mirroring GraphPersistenceBridge. Lives inside SessionProvider so it can
// read sessionId — the widget providers sit above SessionProvider so they
// never miss a bus payload.
//
// - On session change: load that session's saved widget snapshot (or clear).
// - On entries change: debounce-save both providers together so one PUT
//   covers the full widget_data column rather than one call per provider.
export function WidgetPersistenceBridge() {
  const { sessionId } = useSessionContext();
  const {
    entries: tableEntries,
    loadEntries: loadTable,
    clearEntries: clearTable,
  } = useTableState();
  const {
    entries: chartEntries,
    loadEntries: loadChart,
    clearEntries: clearChart,
  } = useChartState();
  const {
    entries: timelineEntries,
    loadEntries: loadTimeline,
    clearEntries: clearTimeline,
  } = useTimelineState();

  const loadedSessionRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load (or clear) when the active session changes.
  useEffect(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    if (!sessionId) {
      loadedSessionRef.current = null;
      clearTable();
      clearChart();
      clearTimeline();
      return;
    }

    let cancelled = false;
    loadedSessionRef.current = null;
    (async () => {
      try {
        const snapshot = await apiFetch<{
          table: unknown[] | null;
          chart: unknown[] | null;
          timeline: unknown[] | null;
        }>(`/api/sessions/${sessionId}/widgets`);
        if (cancelled) return;
        // The stored entries have specs but stale ids — loadEntries reassigns ids.
        if (snapshot.table)
          loadTable(snapshot.table as Parameters<typeof loadTable>[0]);
        else clearTable();
        if (snapshot.chart)
          loadChart(snapshot.chart as Parameters<typeof loadChart>[0]);
        else clearChart();
        if (snapshot.timeline)
          loadTimeline(snapshot.timeline as Parameters<typeof loadTimeline>[0]);
        else clearTimeline();
      } catch (err) {
        logApiError(`widget load ${sessionId}`, err);
        if (!cancelled) {
          clearTable();
          clearChart();
          clearTimeline();
        }
      } finally {
        if (!cancelled) loadedSessionRef.current = sessionId;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, loadTable, clearTable, loadChart, clearChart, loadTimeline, clearTimeline]);

  // Debounce-save when either widget's entries change — but only once the
  // active session's data has been loaded (loadedSessionRef matches).
  useEffect(() => {
    if (!sessionId || loadedSessionRef.current !== sessionId) return;
    if (tableEntries.length === 0 && chartEntries.length === 0 && timelineEntries.length === 0) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiFetch<void>(`/api/sessions/${sessionId}/widgets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: tableEntries.length > 0 ? tableEntries : null,
          chart: chartEntries.length > 0 ? chartEntries : null,
          timeline: timelineEntries.length > 0 ? timelineEntries : null,
        }),
      }).catch((err) => logApiError(`widget save ${sessionId}`, err));
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [tableEntries, chartEntries, timelineEntries, sessionId]);

  return null;
}
