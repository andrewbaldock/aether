import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { copyTitle } from "../duplicateTitle";
import { useStreamingEntries } from "../useStreamingEntries";
import type { ChartOrientation, ChartSpec, ChartType } from "./types";

// One rendered chart: a parsed spec plus a stable id assigned on arrival, so the
// widget can key the stack without leaning on array index.
export interface ChartEntry {
  id: number;
  spec: ChartSpec;
}

// State for the Chart widget: an accumulating list of chart entries. Each
// render_chart call carries a complete, self-contained chart; new calls APPEND so
// several charts from a conversation stack in the one Chart tab. Mounted at the app
// root so it never misses a tool_result (the widget tab mounts only after the first
// spec arrives). Mirrors the Table provider.

export interface ChartState {
  entries: ChartEntry[];
  loadEntries: (entries: ChartEntry[]) => void;
  clearEntries: () => void;
  // Rebuild = replace-on-arrival: keep the current chart until the new one lands.
  requestReplace: () => void;
  // Reload ONE chart by id: the next spec replaces just that entry, in place.
  requestReplaceEntry: (id: number) => void;
  // Duplicate ONE chart by id: deep-clone its spec, suffix "(copy)" on the title,
  // and insert it directly AFTER the source so the copy lands right beneath the
  // original in both the tool tab and the Bigsail canvas.
  duplicateEntry: (id: number) => void;
}

const ChartContext = createContext<ChartState | null>(null);

const VALID_TYPES: ReadonlySet<ChartType> = new Set([
  "line",
  "bar",
  "area",
  "pie",
]);

// Parse + validate a render_chart tool_result string. Returns null on any
// malformed payload so a bad call can't crash the widget. Exported for tests.
export function parseChartSpec(raw: string): ChartSpec | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data == null || typeof data !== "object") return null;
  const {
    title,
    summary,
    type,
    data: points,
    xKey,
    series,
    orientation,
    stacked,
    yLabel,
    xLabel,
  } = data as Record<string, unknown>;

  if (!VALID_TYPES.has(type as ChartType)) return null;
  if (typeof xKey !== "string") return null;
  if (!Array.isArray(points) || !Array.isArray(series)) return null;

  const validSeries = series.filter(
    (s): s is ChartSpec["series"][number] =>
      s != null &&
      typeof s === "object" &&
      typeof (s as Record<string, unknown>).key === "string"
  );
  if (validSeries.length === 0) return null;

  const validData = points.filter(
    (p): p is Record<string, unknown> => p != null && typeof p === "object"
  );

  return {
    title: typeof title === "string" ? title : undefined,
    summary: typeof summary === "string" ? summary : undefined,
    type: type as ChartType,
    data: validData,
    xKey,
    series: validSeries,
    orientation:
      orientation === "horizontal" || orientation === "vertical"
        ? (orientation as ChartOrientation)
        : undefined,
    stacked: typeof stacked === "boolean" ? stacked : undefined,
    yLabel: typeof yLabel === "string" ? yLabel : undefined,
    xLabel: typeof xLabel === "string" ? xLabel : undefined,
  };
}

export function ChartProvider({ children }: { children: ReactNode }) {
  // Streamed partials + final tool_result, via the shared streaming-entries hook.
  const { entries, setEntries, nextId, requestReplace, requestReplaceEntry } =
    useStreamingEntries<ChartSpec>(
      "render_chart",
      parseChartSpec,
      (spec) => spec.title
    );

  const loadEntries = useCallback(
    (loaded: ChartEntry[]) => {
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
        if (idx === -1) return prev;
        const clone: ChartEntry = {
          id: nextId.current++,
          spec: {
            ...structuredClone(prev[idx].spec),
            title: copyTitle(prev[idx].spec.title),
          },
        };
        const next = prev.slice();
        next.splice(idx + 1, 0, clone);
        return next;
      });
    },
    [nextId, setEntries]
  );

  const value = useMemo<ChartState>(
    () => ({
      entries,
      loadEntries,
      clearEntries,
      requestReplace,
      requestReplaceEntry,
      duplicateEntry,
    }),
    [
      entries,
      loadEntries,
      clearEntries,
      requestReplace,
      requestReplaceEntry,
      duplicateEntry,
    ]
  );

  return (
    <ChartContext.Provider value={value}>{children}</ChartContext.Provider>
  );
}

export function useChartState(): ChartState {
  const ctx = useContext(ChartContext);
  if (!ctx) {
    throw new Error("useChartState must be used within a ChartProvider");
  }
  return ctx;
}
