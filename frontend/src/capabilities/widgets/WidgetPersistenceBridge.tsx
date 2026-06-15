import { useEffect, useRef } from "react";
import { apiFetch, logApiError } from "../../lib/queryClient";
import { stamp, validate } from "../../lib/schemaVersion";
import { useSessionContext } from "../../shell/SessionContext";
import { notifyStateReset } from "../../shell/toast";
import { useChartState } from "./Chart/useChartState";
import { useImagesState } from "./Images/useImagesState";
import { useTableState } from "./Table/useTableState";
import { useTimelineState } from "./Timeline/useTimelineState";
import {
  hasSavedWidgets,
  isEntryArrayOrNull,
  isWidgetSnapshot,
} from "./widgetGuard";
import {
  computeSavePayload,
  EMPTY_GOOD,
  type FieldSnapshot,
} from "./widgetSavePayload";

const SAVE_DEBOUNCE_MS = 900;

// Whether a serialised entry array has any spec missing its recreation prompt
// (summary, or blurb for images) — the seed for the back-face/edit re-prompt box.
// Conversations made before summary was required have these blank; we ask the
// backend to backfill them once on load. Defensive: any non-array is "nothing missing".
function hasMissingPrompts(value: unknown, field: "summary" | "blurb"): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    const spec = (entry as { spec?: Record<string, unknown> })?.spec;
    const v = spec?.[field];
    return typeof v !== "string" || v.trim().length === 0;
  });
}
// A failed GET means "we don't know yet" — never the same as "empty". We keep the
// tiles on screen and retry once after a short delay so a backend cold-start (Fly
// scale-to-zero, see the 502 history) self-corrects without the user reloading.
const LOAD_RETRY_MS = 1500;

// lastGoodRef holds the last snapshot we know is GOOD for the active session —
// seeded on a successful load, refreshed on every successful save. The save path
// uses it as the floor (see computeSavePayload) so an empty in-memory state can
// never overwrite real saved widgets. Self-healing: if a conversation's data
// exists, it stays persisted.

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
    updateEntry: updateTable,
  } = useTableState();
  const {
    entries: chartEntries,
    loadEntries: loadChart,
    clearEntries: clearChart,
    updateEntry: updateChart,
  } = useChartState();
  const {
    entries: timelineEntries,
    loadEntries: loadTimeline,
    clearEntries: clearTimeline,
    updateEntry: updateTimeline,
  } = useTimelineState();
  const {
    entries: imageEntries,
    loadEntries: loadImages,
    clearEntries: clearImages,
    updateEntry: updateImages,
  } = useImagesState();

  const loadedSessionRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGoodRef = useRef<FieldSnapshot>(EMPTY_GOOD);

  // Load (or clear) when the active session changes.
  useEffect(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    if (!sessionId) {
      loadedSessionRef.current = null;
      lastGoodRef.current = EMPTY_GOOD;
      clearTable();
      clearChart();
      clearTimeline();
      clearImages();
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    loadedSessionRef.current = null;
    lastGoodRef.current = EMPTY_GOOD;

    // Load one field defensively: a valid array/null loads (or clears) and becomes
    // the new last-good; a corrupt field is LEFT ALONE (we never wipe the tile over
    // one bad field) and flagged so the caller can dev-toast. Returns the value we
    // consider good for that field.
    function applyField<T>(
      value: unknown,
      load: (entries: T) => void,
      clear: () => void
    ): { good: unknown[] | null; corrupt: boolean } {
      if (!isEntryArrayOrNull(value)) return { good: null, corrupt: true };
      if (Array.isArray(value) && value.length > 0) {
        load(value as T);
        return { good: value, corrupt: false };
      }
      clear();
      return { good: null, corrupt: false };
    }

    async function run(isRetry: boolean) {
      try {
        const raw = await apiFetch<unknown>(
          `/api/sessions/${sessionId}/widgets`
        );
        if (cancelled) return;
        // Render saved widgets whenever the SHAPE is usable — a stale/missing
        // version stamp never discards them (we heal the stamp instead). The guard
        // is now per-field: a single corrupt field heals on its own without taking
        // the other three tiles down with it.
        const { stale } = validate("widgets", raw, isWidgetSnapshot);
        const s = (raw && typeof raw === "object" ? raw : {}) as Record<
          string,
          unknown
        >;
        // The stored entries have specs but stale ids — loadEntries reassigns ids.
        const t = applyField(s.table, loadTable, clearTable);
        const c = applyField(s.chart, loadChart, clearChart);
        const tl = applyField(s.timeline, loadTimeline, clearTimeline);
        const im = applyField(s.images, loadImages, clearImages);
        lastGoodRef.current = {
          table: t.good,
          chart: c.good,
          timeline: tl.good,
          images: im.good,
        };
        const anyCorrupt = t.corrupt || c.corrupt || tl.corrupt || im.corrupt;
        if (anyCorrupt && hasSavedWidgets(raw)) notifyStateReset();
        // Heal in the DB now — a stale stamp OR a dropped corrupt field — rather
        // than waiting for the next turn's save, so the mismatch resolves itself.
        if (stale || anyCorrupt)
          apiFetch<void>(`/api/sessions/${sessionId}/widgets`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              stamp("widgets", { ...lastGoodRef.current, reset: true })
            ),
          }).catch((err) => logApiError(`widget heal ${sessionId}`, err));
        loadedSessionRef.current = sessionId;

        // Backfill missing recreation prompts for pre-feature conversations: if any
        // restored widget lacks its summary/blurb, ask the backend to fill them
        // (cheap Haiku, capped, no-op when none missing), then re-apply the patched
        // specs so the back-face/edit re-prompt box seeds correctly. Fire-and-forget
        // and one-shot per load — runs only when there's an actual gap.
        const needsRepair =
          hasMissingPrompts(s.table, "summary") ||
          hasMissingPrompts(s.chart, "summary") ||
          hasMissingPrompts(s.timeline, "summary") ||
          hasMissingPrompts(s.images, "blurb");
        if (needsRepair) {
          const repairFor = sessionId;
          apiFetch<{
            filled: number;
            widgets: Record<string, unknown> | null;
          }>(`/api/sessions/${repairFor}/repair-prompts`, { method: "POST" })
            .then((res) => {
              // Ignore if the session changed under us or nothing was filled.
              if (
                cancelled ||
                loadedSessionRef.current !== repairFor ||
                !res?.widgets ||
                res.filled === 0
              )
                return;
              const w = res.widgets;
              applyField(w.table, loadTable, clearTable);
              applyField(w.chart, loadChart, clearChart);
              applyField(w.timeline, loadTimeline, clearTimeline);
              applyField(w.images, loadImages, clearImages);
            })
            .catch((err) =>
              logApiError(`widget repair-prompts ${repairFor}`, err)
            );
        }
      } catch (err) {
        logApiError(`widget load ${sessionId}`, err);
        if (cancelled) return;
        // A failed GET is "unknown", not "empty" — never clear the tiles. Retry
        // once (cold start), then give up gracefully leaving the screen as-is.
        if (!isRetry) {
          retryTimer = setTimeout(() => run(true), LOAD_RETRY_MS);
        }
      }
    }

    run(false);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    sessionId,
    loadTable,
    clearTable,
    loadChart,
    clearChart,
    loadTimeline,
    clearTimeline,
    loadImages,
    clearImages,
  ]);

  // Debounce-save when any widget's entries change — but only once the active
  // session's data has been loaded (loadedSessionRef matches).
  //
  // SELF-HEALING SAVE: a field is persisted as its live value when non-empty, but
  // when it momentarily goes empty (rebuild mid-flight, a transient blip) we persist
  // its LAST-GOOD value instead of null — an empty in-memory state can never
  // overwrite real saved data. The only legitimate emptying is a session switch,
  // which the load effect handles (it never runs this save for the new session
  // until its own load completes). The backend PUT also merges defensively as a
  // backstop. Each non-empty live field refreshes last-good.
  useEffect(() => {
    if (!sessionId || loadedSessionRef.current !== sessionId) return;

    const payload = computeSavePayload(
      {
        table: tableEntries,
        chart: chartEntries,
        timeline: timelineEntries,
        images: imageEntries,
      },
      lastGoodRef.current
    );
    // Nothing to persist (a fresh session that's still empty) and nothing good to
    // protect — skip the PUT entirely.
    if (!payload) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      lastGoodRef.current = payload;
      apiFetch<void>(`/api/sessions/${sessionId}/widgets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stamp("widgets", payload)),
      }).catch((err) => logApiError(`widget save ${sessionId}`, err));
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [tableEntries, chartEntries, timelineEntries, imageEntries, sessionId]);

  return null;
}
