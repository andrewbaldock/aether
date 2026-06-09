// The render_table spec — what the backend echoes back over the tool_result SSE
// seam. A complete, self-contained table per call (no additive merge, unlike the
// graph). Mirrors the backend tool's input_schema in tools.ts.

export type ColumnType = "text" | "number" | "date";

export interface TableColumn {
  key: string;
  label: string;
  type?: ColumnType;
}

export interface TableSpec {
  title?: string;
  columns: TableColumn[];
  // One object per row, keyed by column key. Values are unknown — rendered as text.
  rows: Record<string, unknown>[];
}
