import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input, Textarea } from "./Input";

const meta = {
  title: "Shell/Input",
  component: Input,
  parameters: {
    docs: {
      description: {
        component: [
          "The shared text-entry controls — `Input` and `Textarea`. Like `Button`, these arrived late: an audit found **six text fields across four files, no two styled alike**.",
          "",
          "### Why there are two variants and not one",
          "The obvious move was to force all six onto a single look. That would have been wrong, because the drift wasn't purely accidental — two of those fields were doing a genuinely different job:",
          "",
          "| Variant | Where | What the styling has to say |",
          "|---|---|---|",
          '| `field` | dialogs, panels (`EditWidgetDialog`, `CardBack`) | "this is a form control" — bordered on the page surface |',
          '| `inline` | renaming a conversation in the sidebar, the chat title | "the text you were just reading is now editable" — filled with a ring |',
          "",
          "An inline rename with a form border reads as a form that appeared out of nowhere; a dialog field with a filled background reads as disabled. So the consolidation kept both treatments and named them, rather than flattening a real distinction to make the count smaller.",
          "",
          "### Two things that aren't these components",
          "- **The chat composer** is a raw `<textarea>`. It's transparent and borderless because the box *around* it owns the border, the loading animation, and the drop-target ring. Wrapping it here would mean a variant with every field style switched off.",
          '- **The hidden file picker** in the composer is a raw `<input type="file">`. It carries no field styling at all and exists only to be clicked programmatically.',
          "",
          'Both are noted in the source, because "why isn\'t this using the shared component" is the first question the next person will ask.',
          "",
          "### Defaults",
          '`Textarea` sets `resize-none` by default: every textarea in this app lives in a sized container (a dialog body, a card back) where a drag handle would break the layout rather than help. Pass `className="resize-y"` for one that shouldn\'t be fixed.',
          "",
          "`inputClass(variant, extra)` is exported for a field that genuinely can't be one of these.",
        ].join("\n"),
      },
    },
  },
  args: { placeholder: "Describe the chart…", variant: "field" },
  argTypes: {
    variant: { control: "inline-radio", options: ["field", "inline"] },
    ref: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default — a form control in a dialog or panel. */
export const Field: Story = {};

/** Editing a value in place. The fill says "this is now editable". */
export const Inline: Story = {
  args: { variant: "inline", defaultValue: "The Apollo program" },
};

/** Both, together — the distinction is the point. */
export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="v-field"
          className="text-xs font-medium text-content-muted"
        >
          field — a form control
        </label>
        <Input
          {...args}
          id="v-field"
          variant="field"
          placeholder="Describe the chart…"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="v-inline"
          className="text-xs font-medium text-content-muted"
        >
          inline — renaming in place
        </label>
        <Input
          {...args}
          id="v-inline"
          variant="inline"
          defaultValue="The Apollo program"
        />
      </div>
    </div>
  ),
};

/** `Textarea` shares the variants and defaults to `resize-none`. */
export const Multiline: Story = {
  render: (args) => (
    <Textarea
      variant={args.variant}
      rows={4}
      placeholder="Describe the chart you want…"
    />
  ),
};

/** The read-only + monospace combination `EditWidgetDialog` uses for a JSON spec. */
export const MonospaceReadOnly: Story = {
  render: () => (
    <Textarea
      readOnly
      rows={6}
      className="font-mono text-xs leading-relaxed"
      defaultValue={JSON.stringify(
        { type: "bar", xKey: "year", series: [{ key: "launches" }] },
        null,
        2
      )}
    />
  ),
};

/** Disabled drops to 50%; read-only to 70% — readable, but clearly not editable. */
export const States: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Input {...args} placeholder="Normal" />
      <Input {...args} defaultValue="Read-only" readOnly />
      <Input {...args} defaultValue="Disabled" disabled />
    </div>
  ),
};
