import { registerRenderer } from "../../registry";
import { TimelineWidget } from "./TimelineWidget";

registerRenderer("timeline", TimelineWidget);

export const TIMELINE_WIDGET = {
  id: "timeline",
  type: "timeline",
  title: "Timeline",
  state: null,
} as const;
