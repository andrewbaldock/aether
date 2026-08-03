import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CardCapability } from "./cards";
import { SkeletonCard } from "./SkeletonCard";

const TYPES: CardCapability[] = [
  "table",
  "chart",
  "timeline",
  "images",
  "knowledge-graph",
];

const meta = {
  title: "Widgets/SkeletonCard",
  component: SkeletonCard,
  parameters: {
    docs: {
      description: {
        component: [
          "The shimmer body of a placeholder card — and a deliberate rejection of the generic grey rectangle.",
          "",
          "Each capability gets its **own silhouette**: header-plus-rows for a table, bars rising from a baseline for a chart, dots-on-a-line for a timeline, a scatter of blobs for the graph, a 2×2 grid for images. Before any data has landed, the loading state already tells you the *shape* of the answer that's coming.",
          "",
          "Every block shares one sweep — the `.tiles-skeleton-shimmer` keyframe in `index.css`. Five silhouettes, one animation: change the easing there and all five change together. Zero dependencies, zero data.",
          "",
          '**Accessibility** — the whole thing is `aria-hidden`. It\'s decoration; the live region that announces "still working" lives elsewhere, and a screen reader should never have to sit through five shimmering rectangles.',
        ].join("\n"),
      },
    },
  },
  args: { type: "chart" },
  argTypes: {
    type: { control: "inline-radio", options: TYPES },
  },
} satisfies Meta<typeof SkeletonCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One silhouette in a card-sized box. Switch `type` in the controls panel. */
export const Chart: Story = {
  // Sized on the story, not on meta: the AllSilhouettes story below brings its
  // own boxes, and story decorators stack with meta decorators rather than
  // replacing them.
  decorators: [
    (Story) => (
      <div className="h-56 w-72 overflow-hidden rounded-xl border border-border bg-surface">
        <Story />
      </div>
    ),
  ],
};

/** All five silhouettes side by side — the point is that they're distinguishable. */
export const AllSilhouettes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      {TYPES.map((type) => (
        <figure key={type} className="flex flex-col gap-2">
          <div className="h-40 w-56 overflow-hidden rounded-xl border border-border bg-surface">
            <SkeletonCard type={type} />
          </div>
          <figcaption className="text-xs text-content-muted">{type}</figcaption>
        </figure>
      ))}
    </div>
  ),
};
