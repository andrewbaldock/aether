// The render_timeline spec — what the backend echoes back over the tool_result SSE
// seam. Mirrors the backend tool's input_schema in tools.ts.

export interface TimelineItem {
  id: string;
  content: string;
  start: string;
  end?: string;
  group?: string;
}

export interface TimelineGroup {
  id: string;
  content: string;
}

export interface TimelineSpec {
  title?: string;
  items: TimelineItem[];
  groups?: TimelineGroup[];
}
