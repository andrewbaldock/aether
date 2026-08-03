import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThinkingGlyph } from "../../brand/ThinkingGlyph";
import { BigsailLoading } from "./Bigsail/BigsailLoading";
import { SkeletonCard } from "./Bigsail/SkeletonCard";
import { GraphLoading } from "./KnowledgeGraph/GraphLoading";
import { WidgetLoading } from "./WidgetLoading";

// Five loading states, deliberately different — the point of this page is that
// "which spinner" is a decision, not a default.
const meta = {
  title: "Foundations/Loading states",
  component: WidgetLoading,
  parameters: {
    docs: {
      description: {
        component: [
          "Aether has **five** loading states, and which one appears is a deliberate choice about *how much is already known*. A single generic spinner everywhere would throw that information away.",
          "",
          "| State | Shown when | What it tells you |",
          "|---|---|---|",
          "| `ThinkingGlyph` | a turn is streaming | the agent is working — brand-level, not tied to any widget |",
          "| `BigsailLoading` | a new canvas is being planned | a *set* of answers is being gathered |",
          "| `SkeletonCard` | the plan is known, this card's tool hasn't returned | the answer's **shape** — chart vs table vs graph |",
          '| `WidgetLoading` | a single capability is filling, shape unknown | just "this panel is being prepared" |',
          "| `GraphLoading` | the knowledge graph is building | nodes settling into a force layout, in the entity colours |",
          "",
          "The ordering matters: the further along the turn, the more specific the loader gets. A skeleton silhouette can only be drawn once the planner has said *what kind* of widget is coming — which is exactly why the generic spinner still exists for the cases where it hasn't.",
          "",
          "**Accessibility** — `WidgetLoading`'s spinner carries `role=\"status\"` and an `aria-label`, so assistive tech announces it. The purely decorative ones (`SkeletonCard`, the glyph's animation) are `aria-hidden`; a screen reader should not have to sit through shimmering rectangles.",
          "",
          "**Reduced motion**, and a trap worth knowing: the CSS-driven loaders (`SkeletonCard`, `BigsailLoading`, `GraphLoading`) are switched off by `@media (prefers-reduced-motion: reduce)` blocks in `index.css`. `ThinkingGlyph` **can't** be — it animates with SVG SMIL (`<animate>`), which the CSS media query does not affect at all. So it reads the preference in JS instead (`matchMedia`, `ThinkingGlyph.tsx:65-70`) and renders its static state. A SMIL animation that only respects reduced motion in CSS is silently non-compliant.",
        ].join("\n"),
      },
    },
  },
  args: { label: "Drawing a chart…" },
} satisfies Meta<typeof WidgetLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

const Frame = ({
  title,
  note,
  className = "h-56 w-80",
  children,
}: {
  title: string;
  note: string;
  className?: string;
  children: React.ReactNode;
}) => (
  <figure className="flex flex-col gap-2">
    <div
      className={`${className} overflow-hidden rounded-xl border border-border bg-surface`}
    >
      {children}
    </div>
    <figcaption className="max-w-80 text-xs text-content-muted">
      <span className="font-medium text-content">{title}</span> — {note}
    </figcaption>
  </figure>
);

/** The generic per-capability spinner. `label` is required — an unlabelled spinner is a bug. */
export const Widget: Story = {
  decorators: [
    (Story) => (
      <div className="h-56 w-80 overflow-hidden rounded-xl border border-border">
        <Story />
      </div>
    ),
  ],
};

/** All five, side by side, in the order a turn actually moves through them. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      <Frame
        title="ThinkingGlyph"
        note="A turn is streaming. Brand-level — the three coloured copies of the Aether A drift apart, converge, and hold. Ties to the knowledge graph via the pulsing nodes."
      >
        <div className="flex h-full items-center justify-center">
          <ThinkingGlyph height={72} animate />
        </div>
      </Frame>

      <Frame
        title="BigsailLoading"
        note="A new canvas is being planned — cards gathering before any tool has returned."
      >
        <div className="flex h-full items-center justify-center [&_svg]:h-40 [&_svg]:w-auto">
          <BigsailLoading />
        </div>
      </Frame>

      <Frame
        title="SkeletonCard"
        note="The plan is known: this slot will be a chart. The silhouette shows the answer's shape before any data exists."
      >
        <SkeletonCard type="chart" />
      </Frame>

      <Frame
        title="WidgetLoading"
        note="A capability is filling but its shape isn't known yet. The fallback — and the only one that is announced to screen readers."
      >
        <WidgetLoading label="Drawing a chart…" />
      </Frame>

      <Frame
        title="GraphLoading"
        note="The knowledge graph's own placeholder: nodes settling into a force layout, in the --kg-* entity colours."
      >
        <GraphLoading />
      </Frame>
    </div>
  ),
};

/**
 * The five skeleton silhouettes again, in context: this is the *only* loader that
 * varies by capability, and that's the whole idea — the loading state already
 * tells you whether a chart, a table, or a graph is on its way.
 */
export const SkeletonsByCapability: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      {(
        ["chart", "table", "timeline", "images", "knowledge-graph"] as const
      ).map((type) => (
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
