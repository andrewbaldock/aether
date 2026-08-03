import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tooltip } from "./Tooltip";

const meta = {
  title: "Shell/Tooltip",
  component: Tooltip,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: [
          "The app's only tooltip. Built on Radix, so the bubble renders in a portal at `<body>` and can never be clipped by an ancestor's `overflow: hidden` — the bug the previous CSS-only version kept hitting (fullscreen toggle, help icon, theme switch).",
          "",
          "**Accessibility** — Radix owns hover, keyboard focus, touch, and close-on-blur. The tooltip is *supplementary*: always keep a real `aria-label` on the trigger itself, because a tooltip is not an accessible name on touch devices. `<IconButton>` does this for you.",
          "",
          '**Do** — pass `contentClassName` (e.g. `"w-64 whitespace-normal leading-snug"`) for a wrapping bubble.',
          "**Don't** — append `whitespace-normal` expecting it to beat the default `whitespace-nowrap`. Conflicting Tailwind utilities resolve by stylesheet source order, not string order, so the component omits the default entirely once you pass `contentClassName`.",
        ].join("\n"),
      },
    },
  },
  args: {
    label: "Rearrange this widget",
    side: "top",
  },
  argTypes: {
    side: {
      control: "inline-radio",
      options: ["top", "right", "bottom", "left"],
    },
    children: { control: false },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

const Trigger = (
  <button
    type="button"
    aria-label="Rearrange this widget"
    className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-content"
  >
    Hover or focus me
  </button>
);

export const Default: Story = { args: { children: Trigger } };

/** A long hint needs an explicit width + wrapping, supplied via `contentClassName`. */
export const Wrapping: Story = {
  args: {
    children: Trigger,
    label: "Reload this widget from the conversation it came from",
    contentClassName: "w-56 whitespace-normal leading-snug",
  },
};

/** `side` is a *preference* — Radix flips it on collision with the viewport edge. */
export const Sides: Story = {
  args: { children: Trigger },
  render: (args) => (
    <div className="flex gap-4">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Tooltip key={side} {...args} side={side} label={`side="${side}"`}>
          <button
            type="button"
            aria-label={`Tooltip on ${side}`}
            className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-content"
          >
            {side}
          </button>
        </Tooltip>
      ))}
    </div>
  ),
};
