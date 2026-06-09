// The render_chart spec — what the backend echoes back over the tool_result SSE
// seam. A complete, self-contained chart per call. Mirrors the backend tool's
// input_schema in tools.ts.

export type ChartType = "line" | "bar" | "area" | "pie";

export interface ChartSeries {
  key: string;
  label?: string;
  color?: string;
}

export interface ChartSpec {
  title?: string;
  type: ChartType;
  // One object per data point, keyed by xKey and each series key.
  data: Record<string, unknown>[];
  xKey: string;
  series: ChartSeries[];
}
