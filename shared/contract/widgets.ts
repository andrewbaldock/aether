// Render-tool spec types — the wire contract for what the backend echoes back over
// the tool_result / tool_partial SSE seam and the frontend parses into widgets.
//
// SINGLE SOURCE OF TRUTH (plan 001). These used to be declared once in the backend's
// tool input_schema and AGAIN in each frontend widget's types.ts ("Mirrors the backend
// tool's input_schema" — a hand-maintained mirror). Now both sides import from here, so
// a field rename is a compile error, not a silent runtime drop. Do not re-declare these
// in either package.
//
// NOTE: only the shapes that CROSS THE WIRE live here. The frontend's d3-force render
// types (GraphNode/GraphLink, with mutable x/y/vx/vy the simulation writes in place)
// are NOT part of the contract and stay in the frontend's KnowledgeGraph/types.ts.

// ── render_chart ─────────────────────────────────────────────────────────────
export type ChartType = "line" | "bar" | "area" | "pie";
export type ChartOrientation = "vertical" | "horizontal";

export interface ChartSeries {
  key: string;
  label?: string;
  color?: string;
}

export interface ChartSpec {
  title?: string;
  // A one-sentence, reproduce-it description, emitted by the model. Seeds the
  // editable "regenerate" prompt on the card's back face.
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
  // Axis captions.
  yLabel?: string;
  xLabel?: string;
}

// ── render_table ─────────────────────────────────────────────────────────────
export type ColumnType = "text" | "number" | "date";

export interface TableColumn {
  key: string;
  label: string;
  type?: ColumnType;
}

export interface TableSpec {
  title?: string;
  summary?: string;
  columns: TableColumn[];
  // One object per row, keyed by column key. Values are unknown — rendered as text.
  rows: Record<string, unknown>[];
}

// ── render_timeline ──────────────────────────────────────────────────────────
export interface TimelineItem {
  id: string;
  content: string;
  start: string;
  end?: string;
  group?: string;
  // Optional lucide-react icon name (PascalCase) from the backend's ICON_VOCABULARY.
  icon?: string;
}

export interface TimelineGroup {
  id: string;
  content: string;
}

export interface TimelineSpec {
  title?: string;
  summary?: string;
  items: TimelineItem[];
  groups?: TimelineGroup[];
}

// ── render_images ────────────────────────────────────────────────────────────
export interface ImageItem {
  url: string;
  alt?: string;
  caption?: string;
  href?: string;
  credit?: string;
  source?: "wikimedia" | "unsplash";
}

export interface ImagesSpec {
  title?: string;
  blurb?: string;
  images: ImageItem[];
}

// ── build_knowledge_graph (WIRE PAYLOAD ONLY) ────────────────────────────────
// What Claude emits and the widget merges. The live-simulation node/link types
// (GraphNode/GraphLink) are frontend-only and intentionally NOT here.
export type EntityType = "person" | "place" | "concept" | "org" | "event";

// One entity as it arrives in a tool_result payload.
export interface RawEntity {
  id: string;
  label: string;
  type: EntityType;
  wikipediaTitle?: string;
  // Optional lucide-react icon name (PascalCase) the model picked.
  icon?: string;
}

// One relationship as it arrives in a tool_result payload.
export interface RawRelationship {
  from: string;
  to: string;
  label?: string;
}

// The full payload of one build_knowledge_graph call.
export interface GraphPayload {
  entities: RawEntity[];
  relationships: RawRelationship[];
  remove?: string[];
  merge?: Array<{ from: string; into: string }>;
}
