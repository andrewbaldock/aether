import type { ReactNode } from "react";
import { BIGSAIL_WIDGET } from "./widgets/Bigsail";
import { CHART_WIDGET } from "./widgets/Chart";
import { IMAGES_WIDGET } from "./widgets/Images";
import { KNOWLEDGE_GRAPH_WIDGET } from "./widgets/KnowledgeGraph";
import { TABLE_WIDGET } from "./widgets/Table";
import { TIMELINE_WIDGET } from "./widgets/Timeline";

// The fixed set of capabilities. Unlike the old open/close tab lifecycle, every
// capability is ALWAYS available: the toolbar renders one chip per entry, in this
// order, in every conversation. Bigsail — the zoom/pan canvas that mirrors every
// other capability as live cards — is "home base": it is always first and is the
// default active view. (The Knowledge Graph used to hold that role; it's now 2nd.)
//
// A descriptor is pure presentation (id/title/icon/blurb). Whether a capability
// "has content", is "active", or has "unseen" updates is computed live in the
// toolbar from the per-widget state hooks + the capability store — never stored
// here.
export interface Capability {
  id: string;
  title: string;
  icon: ReactNode;
  // Short blurb shown in the desktop hover tooltip and the mobile info sheet.
  blurb: ReactNode;
}

export const KNOWLEDGE_GRAPH_ID = KNOWLEDGE_GRAPH_WIDGET.id;

// The default landing view: Bigsail is "home base" (first chip, default active).
export const HOME_BASE_ID = BIGSAIL_WIDGET.id;

export const CAPABILITIES: Capability[] = [
  {
    // Internal id stays "bigsail"; the user-facing label is "Tiles" (placeholder
    // name — pending a final brand name).
    id: BIGSAIL_WIDGET.id,
    title: "Tiles",
    icon: <BigsailIcon />,
    blurb: (
      <>
        A living canvas: every table, chart, timeline, gallery, and the
        knowledge graph this conversation produces appears here together as
        interactive cards you can drag, resize, and rearrange. This is home base
        — it's always first.
      </>
    ),
  },
  {
    id: KNOWLEDGE_GRAPH_WIDGET.id,
    title: "Knowledge Graph",
    icon: <GraphIcon />,
    blurb: (
      <>
        As we talk I extract the people, places, and ideas and map them as a
        live force-directed graph beside the chat. Click a node to get its
        Wikipedia summary; drag to rearrange.
      </>
    ),
  },
  {
    id: TABLE_WIDGET.id,
    title: "Table",
    icon: <TableIcon />,
    blurb: (
      <>
        Ask for a comparison, a ranked list, or any structured data and I'll
        render it as a sortable table beside the chat. Multiple tables stack as
        the conversation grows.
      </>
    ),
  },
  {
    id: CHART_WIDGET.id,
    title: "Chart",
    icon: <ChartIcon />,
    blurb: (
      <>
        Ask for trends, distributions, or comparisons over a dimension and I'll
        render a line, bar, area, or pie chart beside the chat.
      </>
    ),
  },
  {
    id: TIMELINE_WIDGET.id,
    title: "Timeline",
    icon: <TimelineIcon />,
    blurb: (
      <>
        Ask about anything chronological — a history, sequence, or schedule —
        and I'll lay it out as a sortable timeline beside the chat.
      </>
    ),
  },
  {
    id: IMAGES_WIDGET.id,
    title: "Images",
    icon: <ImagesIcon />,
    blurb: (
      <>
        Ask to see photos or pictures of something — I'll search the web
        (Wikimedia Commons & Unsplash) and lay the results out as a gallery
        beside the chat.
      </>
    ),
  },
];

// A canvas-of-cards glyph: overlapping framed rectangles. Marks Bigsail.
function BigsailIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="10" height="8" rx="1.5" />
      <rect x="11" y="11" width="10" height="8" rx="1.5" />
    </svg>
  );
}

// A node-link glyph: connected circles. Marks the Knowledge Graph.
function GraphIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="9" r="2.5" />
      <circle cx="9" cy="18" r="2.5" />
      <path d="M8.1 7.3 15.6 8.1" />
      <path d="M7 8.2 8.4 15.7" />
      <path d="M10.9 16.6 16.4 10.7" />
    </svg>
  );
}

// A simple table grid glyph.
function TableIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 9v12" />
    </svg>
  );
}

// A vertical timeline spine + dots glyph.
function TimelineIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6" y1="3" x2="6" y2="21" />
      <circle cx="6" cy="7" r="2" fill="currentColor" stroke="none" />
      <circle cx="6" cy="14" r="2" fill="currentColor" stroke="none" />
      <line x1="10" y1="7" x2="20" y2="7" />
      <line x1="10" y1="14" x2="18" y2="14" />
    </svg>
  );
}

// A stacked-frames glyph (lucide "images").
function ImagesIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <circle cx="7.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
      <path d="M3 13l3.5-3.5a1.5 1.5 0 0 1 2 0L17 18" />
      <path d="M14 7h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9" />
    </svg>
  );
}

// A bar-chart glyph.
function ChartIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <path d="M7 16V10" />
      <path d="M12 16V6" />
      <path d="M17 16v-4" />
    </svg>
  );
}
