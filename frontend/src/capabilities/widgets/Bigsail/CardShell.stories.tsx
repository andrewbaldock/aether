import type {
  ChartSpec,
  ImagesSpec,
  TableSpec,
  TimelineSpec,
} from "@contract/widgets";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { fn } from "storybook/test";
import { AgentEventProvider } from "../../../shell/AgentEventContext";
import { ChartProvider } from "../Chart/useChartState";
import { ImagesProvider } from "../Images/useImagesState";
import { TableProvider } from "../Table/useTableState";
import { TimelineProvider } from "../Timeline/useTimelineState";
import type { Card, GraphCardSpec } from "./cards";
import { baseSizeHint } from "./cards";
import { CardShell } from "./TilesCanvas";

// The shell's real dependency surface, and worth seeing plainly: the back face's
// Regenerate button re-runs this card's render tool, so it reads the four
// entry-based widget stores plus the agent event bus. None of them do any I/O on
// mount, so the story gets the genuine component — not a stubbed-out copy of it.
function WidgetStores({ children }: { children: ReactNode }) {
  return (
    <AgentEventProvider>
      <TableProvider>
        <ChartProvider>
          <TimelineProvider>
            <ImagesProvider>{children}</ImagesProvider>
          </TimelineProvider>
        </ChartProvider>
      </TableProvider>
    </AgentEventProvider>
  );
}

// A real ChartSpec, not a mock shape — CardShell dispatches to the same shared
// Spec* renderer the tab widgets use, so anything less than a valid spec wouldn't
// render at all. That's the point of the story: the chrome is exercised against
// live widget content.
const CHART_SPEC: ChartSpec = {
  title: "Apollo program launches by year",
  summary: "A bar chart of crewed Apollo launches per year, 1968–1972.",
  type: "bar",
  xKey: "year",
  yLabel: "Launches",
  series: [{ key: "launches", label: "Crewed launches" }],
  data: [
    { year: "1968", launches: 2 },
    { year: "1969", launches: 4 },
    { year: "1970", launches: 1 },
    { year: "1971", launches: 2 },
    { year: "1972", launches: 2 },
  ],
};

const chartCard: Card = {
  id: "chart:demo",
  capabilityType: "chart",
  spec: CHART_SPEC,
  sizeHint: baseSizeHint("chart"),
};

// ── The other four capabilities ────────────────────────────────────────────────
// Same shell, different content. Each spec below is a REAL one for its widget, so
// these stories exercise the actual Spec* renderers rather than a placeholder.

const TABLE_SPEC: TableSpec = {
  title: "Apollo missions",
  summary: "Crewed Apollo missions with their crew size and outcome.",
  columns: [
    { key: "mission", label: "Mission" },
    { key: "year", label: "Year", type: "number" },
    { key: "crew", label: "Crew", type: "number" },
    { key: "outcome", label: "Outcome" },
  ],
  rows: [
    { mission: "Apollo 8", year: 1968, crew: 3, outcome: "Lunar orbit" },
    { mission: "Apollo 11", year: 1969, crew: 3, outcome: "First landing" },
    { mission: "Apollo 13", year: 1970, crew: 3, outcome: "Aborted" },
    { mission: "Apollo 15", year: 1971, crew: 3, outcome: "Landing + rover" },
    { mission: "Apollo 17", year: 1972, crew: 3, outcome: "Final landing" },
  ],
};

const TIMELINE_SPEC: TimelineSpec = {
  title: "The Apollo program",
  summary:
    "Key Apollo milestones from first crewed flight to the last landing.",
  items: [
    {
      id: "a7",
      content: "Apollo 7 — first crewed flight",
      start: "1968-10-11",
    },
    { id: "a8", content: "Apollo 8 — first lunar orbit", start: "1968-12-21" },
    { id: "a11", content: "Apollo 11 — first landing", start: "1969-07-16" },
    { id: "a13", content: "Apollo 13 — abort and return", start: "1970-04-11" },
    { id: "a17", content: "Apollo 17 — final landing", start: "1972-12-07" },
  ],
};

// Inline SVG data URIs rather than remote photos. A docs site that depends on
// Wikimedia being reachable is a docs site that is sometimes broken, and the
// story is about the CARD CHROME around a gallery, not about the photos.
const swatch = (label: string, from: string, to: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs><rect width="320" height="240" fill="url(#g)"/><text x="160" y="128" font-family="sans-serif" font-size="20" fill="#fff" text-anchor="middle">${label}</text></svg>`
  )}`;

const IMAGES_SPEC: ImagesSpec = {
  title: "Mission patches",
  blurb:
    "Placeholder artwork — the story documents the card chrome, not the photos.",
  images: [
    {
      url: swatch("Apollo 8", "#2a78d6", "#0e8d63"),
      alt: "Apollo 8 patch",
      caption: "Apollo 8",
    },
    {
      url: swatch("Apollo 11", "#eb6834", "#eda100"),
      alt: "Apollo 11 patch",
      caption: "Apollo 11",
    },
    {
      url: swatch("Apollo 13", "#b54bd0", "#429ec6"),
      alt: "Apollo 13 patch",
      caption: "Apollo 13",
    },
    {
      url: swatch("Apollo 17", "#c0852c", "#e34948"),
      alt: "Apollo 17 patch",
      caption: "Apollo 17",
    },
  ],
};

// GraphCardSpec is frontend-only (d3-force mutates x/y in place), so it is NOT
// part of the wire contract — see cards.ts. One node per entity type, which also
// makes this story a live check of the --kg-* palette.
const GRAPH_SPEC: GraphCardSpec = {
  title: "Apollo program",
  nodes: [
    { id: "armstrong", label: "Neil Armstrong", type: "person", icon: "User" },
    { id: "nasa", label: "NASA", type: "org", icon: "Building2" },
    { id: "moon", label: "The Moon", type: "place", icon: "Moon" },
    { id: "apollo11", label: "Apollo 11", type: "event", icon: "Rocket" },
    { id: "orbit", label: "Orbital mechanics", type: "concept", icon: "Orbit" },
  ],
  links: [
    { source: "armstrong", target: "apollo11", label: "commanded" },
    { source: "nasa", target: "apollo11", label: "ran" },
    { source: "apollo11", target: "moon", label: "landed on" },
    { source: "apollo11", target: "orbit", label: "relied on" },
    { source: "nasa", target: "armstrong", label: "employed" },
  ],
};

const cardOf = (
  capabilityType: Card["capabilityType"],
  spec: Card["spec"],
  id: string
): Card => ({
  id,
  capabilityType,
  spec,
  sizeHint: baseSizeHint(capabilityType),
});

const skeletonCard: Card = {
  id: "chart:pending",
  capabilityType: "chart",
  spec: { type: "bar", xKey: "", series: [], data: [] } satisfies ChartSpec,
  sizeHint: baseSizeHint("chart"),
  placeholder: true,
};

const meta = {
  title: "Widgets/CardShell",
  component: CardShell,
  parameters: {
    docs: {
      description: {
        component: [
          "**The centre of the design system.** Every card on the Bigsail canvas — all five widget types — renders through this one shell. It owns the drag strip, the title, the action cluster, the skeleton entrance, and the 3D flip. `BigsailCard`, the thing inside it, is a dumb dispatcher that only renders type-specific *content*.",
          "",
          "That split is the actual system claim: **a new widget type implements its content and inherits its entire chrome.** Nothing about a chart, a table, or a force graph is special-cased here.",
          "",
          "### The flip",
          "The 3D flip (`perspective` + `rotateY(180deg)` + `backface-visibility: hidden`) is implemented exactly once, here. The back face carries the widget's JSON spec, an editable regenerate prompt, duplicate, and hide-from-canvas.",
          "",
          "Two details worth knowing:",
          "- **Flip state is deliberately ephemeral** — local state, never persisted. A reload or a URL change always returns you to the front.",
          "- **`pointer-events` is gated on flip state.** `backface-visibility` hides the away-facing side visually but does *not* stop it capturing wheel/pointer events — in a `preserve-3d` scene the rotated face still projects onto the card's screen box. That was the \"top half of the card won't scroll\" bug.",
          "",
          "### Skeletons",
          "A placeholder card renders the plain (non-3D) shell — no back side exists until real data does — plus the staggered entrance class. `staggerIndex` feeds a per-card `--i` custom property that the CSS reads as an animation delay, so a planned answer *cascades* into the canvas instead of popping in all at once. Same `--i` mechanism as `StarterPrompts`.",
          "",
          "**Accessibility** — the drag strip is a pointer affordance; every action inside it is a real `<button>` with an `aria-label` (via `IconButton`), so the card is fully operable from the keyboard without touching the handle.",
        ].join("\n"),
      },
    },
  },
  args: { card: chartCard, onHide: fn(), onDuplicate: fn() },
  argTypes: { card: { control: false } },
  // Only the stores go on meta. Sizing is per-story via `boxed` below, because
  // story decorators STACK with meta decorators rather than replacing them — a
  // fixed h-80/w-md here would squeeze the multi-card story too.
  decorators: [
    (Story) => (
      <WidgetStores>
        <Story />
      </WidgetStores>
    ),
  ],
} satisfies Meta<typeof CardShell>;

export default meta;
type Story = StoryObj<typeof meta>;

// Cards are sized by GridStack in the app; single-card stories supply an
// equivalent fixed box so the shell has a height to fill.
const boxed: Story["decorators"] = [
  (Story) => (
    <div className="h-80 w-md">
      <Story />
    </div>
  ),
];

/** A live chart card. Click the gear in the drag strip to flip to the JSON spec. */
export const Default: Story = { decorators: boxed };

/** Tabular data. Same drag strip, same gear, same flip — only the body differs. */
export const Table: Story = {
  args: { card: cardOf("table", TABLE_SPEC, "table:1") },
  decorators: boxed,
};

/** Dated events. Note the title still lives in the shell's top bar, not the widget. */
export const Timeline: Story = {
  args: { card: cardOf("timeline", TIMELINE_SPEC, "timeline:1") },
  decorators: boxed,
};

/** A masonry gallery. Images are inline SVG data URIs so the story never depends on the network. */
export const Images: Story = {
  args: { card: cardOf("images", IMAGES_SPEC, "images:1") },
  decorators: boxed,
};

/**
 * The live d3-force graph, in the same card as everything else — and the hardest
 * case for the "one shell" claim, since it runs its own simulation and its own
 * d3-zoom inside the card. One node per entity type, so this doubles as a live
 * check of the `--kg-*` palette.
 *
 * Its card id is `knowledge-graph:graph`, not an entry number: the graph is a
 * whole-conversation singleton, so it has no per-entry regenerate and its back
 * face is JSON-only.
 */
export const KnowledgeGraph: Story = {
  args: {
    card: cardOf("knowledge-graph", GRAPH_SPEC, "knowledge-graph:graph"),
  },
  decorators: boxed,
};

/** Placeholder state: the capability's silhouette shimmering in its real grid slot. */
export const Skeleton: Story = {
  args: { card: skeletonCard, staggerIndex: 0 },
  decorators: boxed,
};

/**
 * All five capabilities side by side — the system claim, made visible. Every card
 * here is the same `CardShell`; only the spec handed to it differs.
 */
export const AllCapabilities: Story = {
  render: (args) => (
    <div className="grid grid-cols-2 gap-4">
      {[
        cardOf("chart", CHART_SPEC, "chart:demo"),
        cardOf("table", TABLE_SPEC, "table:1"),
        cardOf("timeline", TIMELINE_SPEC, "timeline:1"),
        cardOf("images", IMAGES_SPEC, "images:1"),
        cardOf("knowledge-graph", GRAPH_SPEC, "knowledge-graph:graph"),
      ].map((card) => (
        <div key={card.id} className="h-72">
          <CardShell {...args} card={card} />
        </div>
      ))}
    </div>
  ),
  decorators: [
    (Story) => (
      <div className="w-4xl">
        <Story />
      </div>
    ),
  ],
};
