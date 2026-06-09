import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useAgentEvents } from "../../../shell/AgentEventContext";
import type { Widget } from "../../registry";
import { WithContextMenu } from "../ContextMenu";
import type { TableSpec } from "./types";
import { useTableState } from "./useTableState";

// "Table" — renders every render_table spec from the conversation, stacked in one
// scrollable tab (newest at the bottom). Headless TanStack Table for sorting; a
// plain styled <table> for the markup so it themes with the app's Tailwind tokens.
// The `widget` prop is unused; state is live.
export function TableWidget(_props: { widget: Widget }) {
  const { entries } = useTableState();

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-8 text-center text-sm text-content-subtle">
        Ask for something tabular — a comparison or a structured list — and
        it'll appear here.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-surface">
      {entries.map(({ id, spec }) => (
        <section key={id} className="border-b border-border last:border-b-0">
          {spec.title && (
            <h2 className="px-4 pt-3 pb-1 font-display text-sm font-semibold text-content">
              {spec.title}
            </h2>
          )}
          <SpecTable spec={spec} title={spec.title} />
        </section>
      ))}
    </div>
  );
}

// Cell value → display string. Objects are JSON-stringified; null/undefined render
// empty. Keeps the table tolerant of whatever the model emits.
function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function SpecTable({ spec, title }: { spec: TableSpec; title?: string }) {
  const bus = useAgentEvents();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      spec.columns.map((col) => ({
        accessorKey: col.key,
        header: col.label,
        // Numeric columns sort numerically; everything else as text. accessorFn
        // keeps the raw value for sorting while the cell renders the display form.
        sortingFn: col.type === "number" ? "alphanumeric" : "auto",
        cell: (info) => cellText(info.getValue()),
      })),
    [spec.columns]
  );

  const table = useReactTable({
    data: spec.rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table className="w-full border-collapse text-sm text-content">
      <thead className="sticky top-0 bg-surface">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className="border-b border-border">
            {headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              return (
                <th
                  key={header.id}
                  className="px-3 py-2 text-left font-semibold text-content-muted"
                >
                  <button
                    type="button"
                    onClick={header.column.getToggleSortingHandler()}
                    className="flex items-center gap-1 hover:text-content"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {sorted === "asc" ? (
                      <ArrowUp className="h-3 w-3" aria-hidden />
                    ) : sorted === "desc" ? (
                      <ArrowDown className="h-3 w-3" aria-hidden />
                    ) : (
                      <ChevronsUpDown
                        className="h-3 w-3 opacity-40"
                        aria-hidden
                      />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => {
          // Build a readable summary of this row to ground the explore prompt.
          const rowSummary = spec.columns
            .map((col) => `${col.label}: ${cellText(row.getValue(col.key))}`)
            .join(", ");
          const contextLabel = title
            ? `in the "${title}" table`
            : "in this table";
          return (
            <WithContextMenu
              key={row.id}
              items={[
                {
                  label: "Explore further",
                  onClick: () =>
                    bus.emit({
                      type: "explore_request",
                      prompt: `Tell me more about this row ${contextLabel}: ${rowSummary}`,
                    }),
                },
              ]}
            >
              <tr className="border-b border-border/60 hover:bg-elevated">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            </WithContextMenu>
          );
        })}
      </tbody>
    </table>
  );
}
