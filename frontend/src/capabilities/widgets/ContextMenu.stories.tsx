import type { Meta, StoryObj } from "@storybook/react-vite";
import { Compass, Copy, Trash2 } from "lucide-react";
import { fn } from "storybook/test";
import {
  type ContextMenuItem,
  ExploreMenu,
  WithContextMenu,
} from "./ContextMenu";

const ITEMS: ContextMenuItem[] = [
  {
    label: "Explore further",
    icon: <Compass className="h-4 w-4" aria-hidden />,
    onClick: fn(),
  },
  {
    label: "Duplicate",
    icon: <Copy className="h-4 w-4" aria-hidden />,
    onClick: fn(),
  },
  {
    label: "Remove from graph",
    icon: <Trash2 className="h-4 w-4" aria-hidden />,
    onClick: fn(),
  },
];

const meta = {
  title: "Shell/ExploreMenu",
  component: ExploreMenu,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: [
          "The kebab (⋮) dropdown attached to anything explorable — a table row, a chart series, an image tile, a graph node, a sidebar conversation. Built on Radix DropdownMenu.",
          "",
          "### Why it exists at all",
          "It replaced a **right-click-only** context menu, which was completely unreachable on touch: there is no right click on a phone. That's the lesson worth keeping — an interaction with no touch equivalent isn't a power-user feature, it's a broken feature for half the users. The visible ⋮ trigger is the fix; Radix supplies outside-click, `Escape`, focus trapping, type-ahead, and collision-aware flipping for free.",
          "",
          "### Two details that look like mistakes and aren't",
          "- **The trigger is a raw `<button>`, not `<IconButton>`.** Radix's `asChild` clones the child element and needs a real DOM ref; `IconButton` returns a `<Tooltip>` wrapper and can't forward one. So it reads its styling from the shared `ICON_BUTTON_CLASS` constant instead — same treatment, no duplicated CSS. This is exactly what that exported constant is for.",
          '- **`data-[state=open]` stays in bracket form.** Radix writes `data-state="open"` on the trigger, and the Tailwind arbitrary-variant syntax is what matches it. "Tidying" this to a non-bracket form silently stops matching and the open state loses its highlight.',
          "",
          "### Touch",
          "`-m-2` on the trigger keeps the ≥44px hit area from bloating tight layouts — the target stays large while the visual box stays small. In `WithContextMenu`, the kebab is **always visible on touch** and only fades in on hover for pointer devices, since `:hover` never fires on a phone.",
        ].join("\n"),
      },
    },
  },
  args: { items: ITEMS, label: "Actions" },
  argTypes: {
    align: { control: "inline-radio", options: ["start", "center", "end"] },
    side: {
      control: "inline-radio",
      options: ["top", "right", "bottom", "left"],
    },
    items: { control: false },
  },
} satisfies Meta<typeof ExploreMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The bare trigger. Click it — or Tab to it and press Enter. */
export const Default: Story = {};

/**
 * `WithContextMenu` overlays the kebab on a target's top-right corner. On a
 * pointer device it fades in on hover; on touch it is always visible, because
 * there is no hover to reveal it.
 */
export const OverAContentTile: Story = {
  render: (args) => (
    <WithContextMenu items={args.items} label="Explore this image">
      <div className="flex h-40 w-64 items-center justify-center rounded-lg border border-border bg-surface-raised text-sm text-content-muted">
        Hover me (or just look, on touch)
      </div>
    </WithContextMenu>
  ),
};

/** Placement is collision-aware — Radix flips `side`/`align` to stay on screen. */
export const Placement: Story = {
  render: (args) => (
    <div className="flex items-center gap-10">
      {(["start", "center", "end"] as const).map((align) => (
        <div key={align} className="flex flex-col items-center gap-2">
          <ExploreMenu {...args} align={align} label={`Actions (${align})`} />
          <span className="text-xs text-content-muted">align={align}</span>
        </div>
      ))}
    </div>
  ),
};
