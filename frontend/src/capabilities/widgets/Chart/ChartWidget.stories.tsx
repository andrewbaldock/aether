import type { ChartSpec } from "@contract/widgets";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ResponsiveContainer } from "recharts";
import { SpecChart } from "./ChartWidget";

const meta = {
  title: "Widgets/Chart palette",
  component: SpecChart,
  parameters: {
    docs: {
      description: {
        component: [
          "`SpecChart` is the canonical single-spec chart renderer — the tab widget and the Bigsail card both render *this*, so there is one chart implementation, not two.",
          "",
          "### The palette is a token ramp",
          "Series colours come from `--viz-1` … `--viz-8` in `index.css`, handed to Recharts as `var(--viz-N)` strings. Recharts writes them straight into SVG `fill`/`stroke`, and the browser resolves the custom property like any other CSS value — so **the chart re-colours itself on a theme flip with no JS and no re-render**, exactly like `bg-surface`. Nothing in this file knows what theme it is in.",
          "",
          "Flip the theme toolbar above and watch the series change without the story remounting.",
          "",
          "### Why these eight, in this order",
          "The order is the colour-blind-safety mechanism, not a preference: adjacent slots are validated for separation under protanopia and deuteranopia (OKLab ΔE ≥ 8; worst adjacent pair is 9.1 light / 8.4 dark), plus a normal-vision floor of ΔE ≥ 15 (19.6 / 19.3). Re-ordering the ramp silently breaks that guarantee, which is why slots are assigned in sequence and never shuffled per chart.",
          "",
          "Both modes are **selected** — the dark column is the same eight hues re-stepped for the near-black surface, not an automatic lightening.",
          "",
          "The ramp deliberately excludes the brand pink: `--accent` means *you can click this*, and a pink series would read as an affordance. Identity and action stay on separate channels.",
          "",
          '**Known ceiling** — past eight series the ramp cycles, so a ninth series repeats the first. Folding the tail into an "Other" series is the right fix, but the series count is decided by the model in the `render_chart` spec, so it belongs in the backend\'s tool prompt.',
        ].join("\n"),
      },
    },
  },
  argTypes: { spec: { control: false } },
  decorators: [
    (Story) => (
      <div className="h-80 w-2xl">
        <ResponsiveContainer width="100%" height="100%">
          <Story />
        </ResponsiveContainer>
      </div>
    ),
  ],
} satisfies Meta<typeof SpecChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const YEARS = ["1968", "1969", "1970", "1971", "1972", "1973"];

/** Six series — six consecutive ramp slots, in fixed assignment order. */
export const MultiSeries: Story = {
  args: {
    spec: {
      title: "Ramp slots 1–6",
      type: "line",
      xKey: "year",
      series: [1, 2, 3, 4, 5, 6].map((n) => ({
        key: `s${n}`,
        label: `Slot ${n}`,
      })),
      data: YEARS.map((year, i) => ({
        year,
        s1: 10 + i * 3,
        s2: 22 - i * 2,
        s3: 14 + ((i * 5) % 9),
        s4: 6 + i * 4,
        s5: 30 - i * 3,
        s6: 18 + ((i * 7) % 6),
      })),
    } satisfies ChartSpec,
  },
};

/**
 * A single-series bar takes slot 1 for every bar. Bar *length* already encodes the
 * value, so colouring each bar differently spends the identity channel re-encoding
 * something the reader can already see.
 */
export const SingleSeriesBar: Story = {
  args: {
    spec: {
      title: "Crewed Apollo launches",
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
    } satisfies ChartSpec,
  },
};

/** A pie is the one form where colour *is* the only identity channel, so slices cycle the ramp. */
export const Pie: Story = {
  args: {
    spec: {
      title: "Share by category",
      type: "pie",
      xKey: "name",
      series: [{ key: "value" }],
      data: [
        { name: "Alpha", value: 34 },
        { name: "Bravo", value: 26 },
        { name: "Charlie", value: 18 },
        { name: "Delta", value: 12 },
        { name: "Echo", value: 10 },
      ],
    } satisfies ChartSpec,
  },
};
