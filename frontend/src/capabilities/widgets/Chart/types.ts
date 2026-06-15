// The render_chart spec — what the backend echoes back over the tool_result SSE
// seam. A complete, self-contained chart per call. Mirrors the backend tool's
// input_schema in tools.ts.

export type ChartType = "line" | "bar" | "area" | "pie";

export type ChartOrientation = "vertical" | "horizontal";

export interface ChartSeries {
  key: string;
  label?: string;
  color?: string;
}

export interface ChartSpec {
  title?: string;
  // A one-sentence, reproduce-it description of what this chart shows, emitted by
  // the model. Seeds the editable "regenerate" prompt on the card's back face.
  summary?: string;
  type: ChartType;
  // One object per data point, keyed by xKey and each series key.
  data: Record<string, unknown>[];
  xKey: string;
  series: ChartSeries[];
  // Bar only; horizontal suits ranked lists / long labels. Default vertical.
  orientation?: ChartOrientation;
  // Bar/area with 2+ series: stack instead of grouping side-by-side.
  stacked?: boolean;
  // Axis captions — yLabel lets the value axis read a rate/share/index instead
  // of an implied raw count.
  yLabel?: string;
  xLabel?: string;
}
