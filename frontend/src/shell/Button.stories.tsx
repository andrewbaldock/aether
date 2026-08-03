import type { Meta, StoryObj } from "@storybook/react-vite";
import { Copy, Download, RefreshCw, Trash2 } from "lucide-react";
import { fn } from "storybook/test";
import { Button } from "./Button";

const meta = {
  title: "Shell/Button",
  component: Button,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: [
          "The shared text button — and the newest piece of the system, because until recently there wasn't one.",
          "",
          "### Why it exists",
          "An audit found **21 files hand-rolling their own** `rounded-lg … px-3 py-1.5 …` string, and the drift was already visible: the neutral treatment appeared with four slightly different hover rules, and two files disagreed about whether `disabled` meant 40% or 50% opacity. Nobody had done anything wrong — there was simply nothing to reuse.",
          "",
          "So the three variants here are **taken from what the app already used**, not invented: `primary` (3 hand-rolled copies), `secondary` (7, with the drift), `danger` (1, in `ConfirmDialog`). No `tertiary`, no `size` prop, no `loading` state — none of those had a single real call site, and a variant nobody needs is just a decision the next person has to make.",
          "",
          "### It forwards a ref, and that matters",
          "`IconButton` can't be used as a Radix `asChild` trigger: it returns a `<Tooltip>` wrapper and can't forward a ref, which is why `ExploreMenu` hand-rolls a raw `<button>` reading `ICON_BUTTON_CLASS`. `Button` takes `ref` as an ordinary prop (React 19), so Radix can clone it — `ConfirmDialog`'s Cancel and Confirm are now `<Button>` inside `AlertDialog.Cancel asChild` directly.",
          "",
          "**The one exception:** setting `tooltip` wraps the button in a Radix Tooltip tree, so a `Button` with a tooltip *cannot also* be an `asChild` trigger. Leave `tooltip` off there.",
          "",
          "### Tooltips are opt-in, deliberately",
          "Unlike `IconButton` — where the tooltip is the only thing naming an icon — a text button already has an accessible name. A tooltip repeating the label is noise for pointer users and a duplicate announcement for screen readers. Use `tooltip` for what the label *can't* say: a keyboard shortcut, or a consequence.",
          "",
          "**Touch** — `max-md:min-h-11` guarantees the 44px minimum height under `md` without inflating the desktop button.",
        ].join("\n"),
      },
    },
  },
  args: { children: "Button", variant: "secondary", onClick: fn() },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["primary", "secondary", "danger"],
    },
    tooltipSide: {
      control: "inline-radio",
      options: ["top", "right", "bottom", "left"],
    },
    icon: { control: false },
    ref: { control: false },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The affirmative action. Accent fill, semibold. */
export const Primary: Story = {
  args: { variant: "primary", children: "Save" },
};

/** The default. Neutral outline — most buttons in the app are this. */
export const Secondary: Story = { args: { children: "Cancel" } };

/** Destructive confirmation only. Reuses the `danger` tokens, not a red hex. */
export const Danger: Story = {
  args: { variant: "danger", children: "Delete" },
};

/** All three together — the whole API surface. */
export const Variants: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} variant="primary">
        Primary
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="danger">
        Danger
      </Button>
    </div>
  ),
};

/** A leading icon. Size it yourself — `h-4 w-4` is the convention. */
export const WithIcon: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button
        {...args}
        variant="primary"
        icon={<Download className="h-4 w-4" aria-hidden />}
      >
        Export
      </Button>
      <Button {...args} icon={<Copy className="h-4 w-4" aria-hidden />}>
        Duplicate
      </Button>
      <Button
        {...args}
        variant="danger"
        icon={<Trash2 className="h-4 w-4" aria-hidden />}
      >
        Delete
      </Button>
    </div>
  ),
};

/** A tooltip should add information the label doesn't already carry. */
export const WithTooltip: Story = {
  args: {
    icon: <RefreshCw className="h-4 w-4" aria-hidden />,
    children: "Regenerate",
    tooltip: "Re-runs this widget's tool against the conversation",
  },
};

/** Disabled is `pointer-events-none` + 50% — one rule, instead of the two the app had. */
export const Disabled: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} variant="primary" disabled>
        Primary
      </Button>
      <Button {...args} variant="secondary" disabled>
        Secondary
      </Button>
      <Button {...args} variant="danger" disabled>
        Danger
      </Button>
    </div>
  ),
};
