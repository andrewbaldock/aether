import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { useStreamingEntries } from "../useStreamingEntries";
import type { TableSpec } from "./types";

// One rendered table: a parsed spec plus a stable id assigned on arrival, so the
// widget can key the stack without leaning on array index.
export interface TableEntry {
  id: number;
  spec: TableSpec;
}

// State for the Table widget: an accumulating list of table entries. Each
// render_table call carries a complete, self-contained table (no per-cell merge
// like the graph) — but instead of replacing, we APPEND, so several tables from a
// conversation stack in the one Table tab. Mounted at the app root so it never
// misses a tool_result: the widget tab can be activated (and mount) only AFTER the
// first spec arrives.

export interface TableState {
  entries: TableEntry[];
  loadEntries: (entries: TableEntry[]) => void;
  clearEntries: () => void;
}

const TableContext = createContext<TableState | null>(null);

// Parse + validate a render_table tool_result string. Returns null on any
// malformed payload so a bad call can't crash the widget. Exported for tests.
export function parseTableSpec(raw: string): TableSpec | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data == null || typeof data !== "object") return null;
  const { title, columns, rows } = data as Record<string, unknown>;
  if (!Array.isArray(columns) || !Array.isArray(rows)) return null;

  const validColumns = columns.filter(
    (c): c is TableSpec["columns"][number] =>
      c != null &&
      typeof c === "object" &&
      typeof (c as Record<string, unknown>).key === "string" &&
      typeof (c as Record<string, unknown>).label === "string"
  );
  if (validColumns.length === 0) return null;

  const validRows = rows.filter(
    (r): r is Record<string, unknown> => r != null && typeof r === "object"
  );

  return {
    title: typeof title === "string" ? title : undefined,
    columns: validColumns,
    rows: validRows,
  };
}

export function TableProvider({ children }: { children: ReactNode }) {
  // Accumulating table list, fed by both streamed partials and the final
  // tool_result via the shared streaming-entries hook (see useStreamingEntries).
  const { entries, setEntries, nextId } = useStreamingEntries<TableSpec>(
    "render_table",
    parseTableSpec
  );

  const loadEntries = useCallback(
    (loaded: TableEntry[]) => {
      // Assign fresh ids so they don't collide with any ids already in nextId.
      const rehydrated = loaded.map((e) => ({ ...e, id: nextId.current++ }));
      setEntries(rehydrated);
    },
    [nextId, setEntries]
  );

  const clearEntries = useCallback(() => setEntries([]), [setEntries]);

  const value = useMemo<TableState>(
    () => ({ entries, loadEntries, clearEntries }),
    [entries, loadEntries, clearEntries]
  );

  return (
    <TableContext.Provider value={value}>{children}</TableContext.Provider>
  );
}

export function useTableState(): TableState {
  const ctx = useContext(TableContext);
  if (!ctx) {
    throw new Error("useTableState must be used within a TableProvider");
  }
  return ctx;
}
