// The render_timeline spec — what the backend echoes back over the tool_result SSE
// seam. Mirrors the backend tool's input_schema in tools.ts.

export interface TimelineItem {
  id: string;
  content: string;
  start: string;
  end?: string;
  group?: string;
  // Optional lucide-react icon name (PascalCase) the model picked as the best
  // match for this event, from the backend's ICON_VOCABULARY. Rendered in the
  // marker on the spine; falls back to a plain dot when absent or invalid.
  icon?: string;
}

export interface TimelineGroup {
  id: string;
  content: string;
}

export interface TimelineSpec {
  title?: string;
  // A one-sentence, reproduce-it description of what this timeline shows, emitted
  // by the model. Seeds the editable "regenerate" prompt on the card's back face.
  summary?: string;
  items: TimelineItem[];
  groups?: TimelineGroup[];
}
