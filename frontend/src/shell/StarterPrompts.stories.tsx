import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { StarterPrompts } from "./StarterPrompts";

const meta = {
  title: "Shell/StarterPrompts",
  component: StarterPrompts,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: [
          "The pill row on the blank conversation page. Five prompts are sampled at random from a ~50-item pool **once per mount** (a `useMemo` with an empty dep list), so the page feels different on every visit but the pills never reshuffle mid-render.",
          "",
          "The pool is curated to span Aether's render modes — graph, timeline, diagram, comparison, map, prose — so whatever surfaces is also an implicit demo of what the canvas can do.",
          "",
          "**Motion** — each pill carries a `--i` index custom property; the `.starter-pill` keyframes read it to stagger the entrance. Same `--i` mechanism as the skeleton cascade in `CardShell`, which is what makes the two read as one motion language rather than two animations that happen to coexist.",
          "",
          "**Note** — the hover gradient still uses raw hex stops (`from-brand-pink`). That's the one place in the app that hasn't been promoted to a token; it's tracked, not defended.",
        ].join("\n"),
      },
    },
  },
  args: { onPick: fn() },
} satisfies Meta<typeof StarterPrompts>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Reload the story to resample the pool. */
export const Default: Story = {};

/** While a turn is streaming, the pills go inert (`pointer-events-none` + 50% opacity). */
export const Disabled: Story = { args: { disabled: true } };
