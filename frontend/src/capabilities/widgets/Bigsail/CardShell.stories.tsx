import type { ChartSpec } from "@contract/widgets";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { fn } from "storybook/test";
import { AgentEventProvider } from "../../../shell/AgentEventContext";
import { ChartProvider } from "../Chart/useChartState";
import { ImagesProvider } from "../Images/useImagesState";
import { TableProvider } from "../Table/useTableState";
import { TimelineProvider } from "../Timeline/useTimelineState";
import type { Card } from "./cards";
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
  decorators: [
    // Cards are sized by GridStack in the app; the story supplies an equivalent
    // fixed box so the shell has a height to fill.
    (Story) => (
      <WidgetStores>
        <div className="h-80 w-md">
          <Story />
        </div>
      </WidgetStores>
    ),
  ],
} satisfies Meta<typeof CardShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A live chart card. Click the gear in the drag strip to flip to the JSON spec. */
export const Default: Story = {};

/** Placeholder state: the capability's silhouette shimmering in its real grid slot. */
export const Skeleton: Story = {
  args: { card: skeletonCard, staggerIndex: 0 },
};
