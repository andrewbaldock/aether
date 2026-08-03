import type { Meta, StoryObj } from "@storybook/react-vite";
import { Copy, EyeOff, Maximize2, Settings, Trash2 } from "lucide-react";
import { IconButton } from "./IconButton";

const meta = {
  title: "Shell/IconButton",
  component: IconButton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: [
          "The single icon-button treatment used across the app: it recedes until hovered/focused/pressed, then picks up a border, a background wash, and a brand-pink icon. There is exactly one source of truth for those classes — the exported `ICON_BUTTON_CLASS` string — so a raw `<button>` that *can't* be wrapped in this component (a Radix `asChild` trigger, for instance) still reads its styling from here instead of hand-copying it.",
          "",
          "**Accessibility** — `label` does double duty: it's the `aria-label` on the button *and* the tooltip text. That coupling is deliberate — you cannot ship this button without naming it.",
          "",
          "**Touch** — `max-md:h-11 max-md:w-11` forces the 44px minimum target under `md`, regardless of the icon's own size; desktop keeps the tighter padding-driven box.",
          "",
          "**Do** — set `tooltip={false}` for mobile-only chrome (there's no hover on touch) and pass `stopPointerDown` inside a drag handle so a click doesn't also start a GridStack drag.",
        ].join("\n"),
      },
    },
  },
  args: {
    label: "Show this widget's parameters",
    side: "top",
    tooltip: true,
    stopPointerDown: false,
  },
  argTypes: {
    side: {
      control: "inline-radio",
      options: ["top", "right", "bottom", "left"],
    },
    children: { control: false },
    onClick: { action: "clicked" },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: <Settings className="h-4 w-4" aria-hidden /> },
};

/** No tooltip — for mobile-only chrome, where there is no hover to trigger one. */
export const WithoutTooltip: Story = {
  args: {
    tooltip: false,
    children: <Maximize2 className="h-4 w-4" aria-hidden />,
  },
};

/** The action cluster as it appears on a Bigsail card's drag strip. */
export const ActionCluster: Story = {
  args: { children: null },
  render: () => (
    <div className="flex items-center gap-1 rounded-lg bg-elevated/60 px-3 py-1">
      <IconButton label="Duplicate this widget">
        <Copy className="h-3.5 w-3.5" aria-hidden />
      </IconButton>
      <IconButton label="Hide from canvas">
        <EyeOff className="h-3.5 w-3.5" aria-hidden />
      </IconButton>
      <IconButton label="Delete this widget">
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </IconButton>
    </div>
  ),
};
