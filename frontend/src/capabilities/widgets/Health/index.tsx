import { registerRenderer } from "../../registry";
import { HealthWidget } from "./HealthWidget";

registerRenderer("health", HealthWidget);

export const HEALTH_WIDGET = {
  id: "health",
  type: "health",
  title: "System Health",
  state: null,
} as const;
