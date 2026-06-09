import { registerRenderer } from "../../registry";
import { ChartWidget } from "./ChartWidget";

// Registers the "chart" renderer on import (same pattern as the other widgets).
// App.tsx imports this module to wire it in.
registerRenderer("chart", ChartWidget);

// The widget descriptor the shell opens. Stable id so a second render_chart call
// reuses the same tab rather than stacking duplicate tabs (the charts stack
// inside the one tab instead).
export const CHART_WIDGET = {
  id: "chart",
  type: "chart",
  title: "Chart",
  state: null,
} as const;
