import { registerRenderer } from "../../registry";
import { MetricsWidget } from "./MetricsWidget";

registerRenderer("metrics", MetricsWidget);

export const METRICS_WIDGET = {
  id: "metrics",
  type: "metrics",
  title: "Metrics",
  state: null,
} as const;
