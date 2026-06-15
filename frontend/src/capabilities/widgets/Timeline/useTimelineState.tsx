import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { copyTitle } from "../duplicateTitle";
import { useStreamingEntries } from "../useStreamingEntries";
import type { TimelineSpec } from "./types";

export interface TimelineEntry {
  id: number;
  spec: TimelineSpec;
}

export interface TimelineState {
  entries: TimelineEntry[];
  loadEntries: (entries: TimelineEntry[]) => void;
  clearEntries: () => void;
  // Rebuild = replace-on-arrival: keep the current timeline until the new one lands.
  requestReplace: () => void;
  // Reload ONE timeline by id: the next spec replaces just that entry, in place.
  requestReplaceEntry: (id: number) => void;
  // Duplicate ONE timeline by id: deep-clone its spec, suffix "(copy)" on the title,
  // and insert it directly AFTER the source so the copy lands right beneath the
  // original in both the tool tab and the Bigsail canvas.
  duplicateEntry: (id: number) => void;
  // Replace ONE timeline's spec in place by id (a direct edit — no model call,
  // unlike requestReplaceEntry). Used by the param/prompt editor and the backfill.
  updateEntry: (id: number, spec: TimelineSpec) => void;
}

const TimelineContext = createContext<TimelineState | null>(null);

export function parseTimelineSpec(raw: string): TimelineSpec | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data == null || typeof data !== "object") return null;
  const { title, summary, items, groups } = data as Record<string, unknown>;
  if (!Array.isArray(items)) return null;

  const validItems = items.filter(
    (it): it is TimelineSpec["items"][number] =>
      it != null &&
      typeof it === "object" &&
      typeof (it as Record<string, unknown>).id === "string" &&
      typeof (it as Record<string, unknown>).content === "string" &&
      typeof (it as Record<string, unknown>).start === "string"
  );
  if (validItems.length === 0) return null;

  const validGroups = Array.isArray(groups)
    ? groups.filter(
        (g): g is NonNullable<TimelineSpec["groups"]>[number] =>
          g != null &&
          typeof g === "object" &&
          typeof (g as Record<string, unknown>).id === "string" &&
          typeof (g as Record<string, unknown>).content === "string"
      )
    : undefined;

  return {
    title: typeof title === "string" ? title : undefined,
    summary: typeof summary === "string" ? summary : undefined,
    items: validItems,
    groups: validGroups,
  };
}

export function TimelineProvider({ children }: { children: ReactNode }) {
  // Streamed partials + final tool_result, via the shared streaming-entries hook.
  const { entries, setEntries, nextId, requestReplace, requestReplaceEntry } =
    useStreamingEntries<TimelineSpec>(
      "render_timeline",
      parseTimelineSpec,
      (spec) => spec.title
    );

  const loadEntries = useCallback(
    (loaded: TimelineEntry[]) => {
      const rehydrated = loaded.map((e) => ({ ...e, id: nextId.current++ }));
      setEntries(rehydrated);
    },
    [nextId, setEntries]
  );

  const clearEntries = useCallback(() => setEntries([]), [setEntries]);

  const duplicateEntry = useCallback(
    (id: number) => {
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === id);
        const src = prev[idx];
        if (!src) return prev;
        const clone: TimelineEntry = {
          id: nextId.current++,
          spec: {
            ...structuredClone(src.spec),
            title: copyTitle(src.spec.title),
          },
        };
        const next = prev.slice();
        next.splice(idx + 1, 0, clone);
        return next;
      });
    },
    [nextId, setEntries]
  );

  const updateEntry = useCallback(
    (id: number, spec: TimelineSpec) => {
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === id);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = { id, spec };
        return next;
      });
    },
    [setEntries]
  );

  const value = useMemo<TimelineState>(
    () => ({
      entries,
      loadEntries,
      clearEntries,
      requestReplace,
      requestReplaceEntry,
      duplicateEntry,
      updateEntry,
    }),
    [
      entries,
      loadEntries,
      clearEntries,
      requestReplace,
      requestReplaceEntry,
      duplicateEntry,
      updateEntry,
    ]
  );

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
}

export function useTimelineState(): TimelineState {
  const ctx = useContext(TimelineContext);
  if (!ctx) {
    throw new Error("useTimelineState must be used within a TimelineProvider");
  }
  return ctx;
}
