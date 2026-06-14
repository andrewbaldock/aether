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
import { useSessionContext } from "../../../shell/SessionContext";
import { useAgentBusy } from "../../../shell/useAgentBusy";
import type { Widget } from "../../registry";
import { ExploreMenu } from "../ContextMenu";
import { useFillFromConversation } from "../useFillFromConversation";
import { useQueuedExplore } from "../useQueuedExplore";
import { WidgetEmptyState } from "../WidgetEmptyState";
import { WidgetLoading } from "../WidgetLoading";
import { WidgetReloadHeader } from "../WidgetReloadHeader";
import type { TableSpec } from "./types";
import { useTableState } from "./useTableState";

// Shared by the empty-panel fill and the populated-widget reload so they stay aligned.
const TABLE_BUILD_PROMPT =
  "Build the best table you can about what we've been discussing. Capture the key items, options, or entities and their attributes as rows and columns — and broaden from what was literally said: structure the real comparison the subject invites, not only facts someone typed. This is about the conversation so far, not future messages. Don't ask whether to do it or offer to do it later — call render_table now. Only skip if the subject genuinely can't be organized into rows and columns at all.";

// "Table" — renders every render_table spec from the conversation, stacked in one
// scrollable tab (newest at the bottom). Headless TanStack Table for sorting; a
// plain styled <table> for the markup so it themes with the app's Tailwind tokens.
// The `widget` prop is unused; state is live.
export function TableWidget(_props: { widget: Widget }) {
  const { entries, requestReplace } = useTableState();
  const busy = useAgentBusy();
  const { messages } = useSessionContext();
  const fill = useFillFromConversation({
    hasContent: entries.length > 0,
    gentlePrompt: TABLE_BUILD_PROMPT,
    forcedPrompt:
      "Call the render_table tool right now to capture the most table-worthy information from our conversation so far.",
    displayText: "Update the Table from our conversation.",
  });

  // Reload = rebuild fresh; queues if a turn's in flight (latest-wins). Replace-on-
  // arrival: the current table stays visible until the new spec lands (then it
  // supersedes the old), so the canvas tile never blinks out and an empty/failed
  // rebuild can't wipe it. See useStreamingEntries.requestReplace.
  const reload = useQueuedExplore();
  function onReload() {
    reload.enqueue({
      prompt: TABLE_BUILD_PROMPT,
      displayText: "Rebuild the Table from our conversation.",
      onFire: requestReplace,
    });
  }

  if (entries.length === 0) {
    // Working a turn → show the loading spinner even if no table ends up landing
    // this turn. Idle and empty → the invitation (plus an Update button once a
    // conversation exists to fill from).
    if (busy) return <WidgetLoading label="Building a table…" />;
    return (
      <WidgetEmptyState
        invitation="Ask for something tabular — a comparison or a structured list — and it'll appear here."
        hasConversation={messages.length > 0}
        canUpdate={fill.canUpdate}
        onUpdate={fill.onUpdate}
        onReset={fill.reset}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <WidgetReloadHeader
        onReload={onReload}
        queued={reload.queued}
        label="Rebuild the table from the conversation"
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
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

// Self-contained single-spec table (sortable, with per-row explore menu). Used by
// the Table tab and by BigsailCard. Pure spec → JSX; the canonical renderer.
export function SpecTable({
  spec,
  title,
}: {
  spec: TableSpec;
  title?: string;
}) {
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
            {/* Actions column header — empty; the per-row explore kebab lives
                below it. Keeps the column count aligned with the body. */}
            <th className="w-10 px-3 py-2" aria-label="Actions" />
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row, i) => {
          // Build a readable summary of this row to ground the explore prompt.
          const rowSummary = spec.columns
            .map((col) => `${col.label}: ${cellText(row.getValue(col.key))}`)
            .join(", ");
          const contextLabel = title
            ? `in the "${title}" table`
            : "in this table";
          const exploreItems = [
            {
              label: "Explore further",
              onClick: () =>
                bus.emit({
                  type: "explore_request",
                  prompt: `Tell me more about this row ${contextLabel}: ${rowSummary}`,
                }),
            },
          ];
          return (
            // Cascade rows in on first paint (capped delay — see drip-row-in).
            <tr
              key={row.id}
              className="drip-row-in border-b border-border/60 hover:bg-elevated"
              style={{ "--i": Math.min(i, 24) } as React.CSSProperties}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
              <td className="w-10 px-3 py-2 align-top text-right">
                <ExploreMenu items={exploreItems} label="Explore this row" />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
