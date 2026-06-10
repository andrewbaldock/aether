import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AgentEvent,
  useAgentEvents,
} from "../../../shell/AgentEventContext";
import type { TimelineSpec } from "./types";

export interface TimelineEntry {
  id: number;
  spec: TimelineSpec;
}

export interface TimelineState {
  entries: TimelineEntry[];
  loadEntries: (entries: TimelineEntry[]) => void;
  clearEntries: () => void;
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
  const { title, items, groups } = data as Record<string, unknown>;
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
        (g): g is TimelineSpec["groups"][number] =>
          g != null &&
          typeof g === "object" &&
          typeof (g as Record<string, unknown>).id === "string" &&
          typeof (g as Record<string, unknown>).content === "string"
      )
    : undefined;

  return {
    title: typeof title === "string" ? title : undefined,
    items: validItems,
    groups: validGroups,
  };
}

export function TimelineProvider({ children }: { children: ReactNode }) {
  const bus = useAgentEvents();
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    function handle(event: AgentEvent) {
      if (event.type !== "tool_result") return;
      if (event.tool !== "render_timeline") return;
      const parsed = parseTimelineSpec(event.result);
      if (parsed)
        setEntries((prev) => [...prev, { id: nextId.current++, spec: parsed }]);
    }
    return bus.subscribe(handle);
  }, [bus]);

  const loadEntries = useCallback((loaded: TimelineEntry[]) => {
    const rehydrated = loaded.map((e) => ({ ...e, id: nextId.current++ }));
    setEntries(rehydrated);
  }, []);

  const clearEntries = useCallback(() => setEntries([]), []);

  const value = useMemo<TimelineState>(
    () => ({ entries, loadEntries, clearEntries }),
    [entries, loadEntries, clearEntries]
  );

  return (
    <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>
  );
}

export function useTimelineState(): TimelineState {
  const ctx = useContext(TimelineContext);
  if (!ctx) {
    throw new Error("useTimelineState must be used within a TimelineProvider");
  }
  return ctx;
}
