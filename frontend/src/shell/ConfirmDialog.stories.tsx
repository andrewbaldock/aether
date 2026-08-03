import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ConfirmDialog } from "./ConfirmDialog";

const meta = {
  title: "Shell/ConfirmDialog",
  component: ConfirmDialog,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: [
          "The app-styled confirm modal, built on Radix AlertDialog. The caller supplies its own `trigger`, so the dialog *wraps* whatever button it guards rather than being wired up beside it — one component, no per-site modal state.",
          "",
          '**Accessibility** — Radix owns the focus trap, `Escape`-to-cancel, outside-click, and `role="alertdialog"` (which, unlike `dialog`, makes a screen reader announce the description immediately). We add nothing on top of that and take nothing away.',
          "",
          '**`affirmative`** is the whole variant API: `"primary"` for a reversible action (the default — hide-from-canvas can be undone), `"danger"` for a genuinely destructive one. Two values, because a third would only invite guessing.',
          "",
          "**Don't** — nest a `<Tooltip>` inside `trigger`. AlertDialog's `asChild` clones a single DOM element, and a Tooltip is its own Radix tree; use a `title` attribute for the hover hint instead (see `CardShell`'s hide button).",
        ].join("\n"),
      },
    },
  },
  args: {
    title: "Hide from canvas?",
    description:
      "This removes the widget from the Bigsail canvas. You can add it back from its tool tab.",
    confirmLabel: "Hide",
    cancelLabel: "Cancel",
    affirmative: "primary",
    trigger: null,
    onConfirm: fn(),
  },
  argTypes: {
    affirmative: { control: "inline-radio", options: ["primary", "danger"] },
    trigger: { control: false },
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const trigger = (
  <button
    type="button"
    className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-content"
  >
    Hide from canvas
  </button>
);

/** Reversible action — the confirm button takes the brand accent. */
export const Primary: Story = { args: { trigger } };

/** Genuinely destructive — the confirm button takes the danger tokens. */
export const Danger: Story = {
  args: {
    trigger: (
      <button
        type="button"
        className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-content"
      >
        Delete conversation
      </button>
    ),
    title: "Delete this conversation?",
    description: "This can't be undone.",
    confirmLabel: "Delete",
    affirmative: "danger",
  },
};

/** `description` is optional — a bare title still reads as a complete dialog. */
export const TitleOnly: Story = {
  args: { trigger, description: undefined },
};
