import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { WidgetEmptyState } from "./WidgetEmptyState";

const meta = {
  title: "Foundations/Empty states",
  component: WidgetEmptyState,
  parameters: {
    docs: {
      description: {
        component: [
          'The empty state every capability shares — and it is **four** states, not one, because "there\'s nothing here" has four different meanings in this app and they need four different answers.',
          "",
          "| State | What actually happened | What the user should do |",
          "|---|---|---|",
          "| **Fresh** | No conversation yet | Ask something — the invitation says what *this* panel is for |",
          "| **Fillable** | A conversation exists, this panel is empty | Press Update to build it from what's already been said |",
          "| **Nothing fit** | We tried; the conversation has no content for this view | Nothing — but offer a retry |",
          "| **Awaiting clarification** | The planner asked a question first | Answer it in the chat |",
          "",
          'The distinction that earns its keep is **Fillable vs Nothing fit**. Both are visually empty panels, but one is an opportunity and the other is a dead end. Collapsing them into one "No data" message would tell the user nothing about which situation they\'re in — and "Got nothin\'!" is doing real work: it says *we looked*, rather than leaving someone pressing Update forever.',
          "",
          "**Awaiting clarification** is the subtlest. When the planner decides a question is too thin to answer well, it asks a clarifier instead of guessing — and every empty panel needs to explain *that*, not show an Update button that would just re-trigger the same question.",
          "",
          "### The invitation is per-capability",
          "Each widget passes its own `invitation` string. It names what the panel is *for*, so an empty Chart and an empty Timeline don't read as the same generic void.",
          "",
          '**Accessibility** — the Update control is a real button with an explicit `aria-label` ("Fill this panel from the conversation"), because "Update" alone doesn\'t say update *what*.',
        ].join("\n"),
      },
    },
  },
  args: {
    invitation:
      "Ask for something quantitative — a trend or a comparison — and it'll be charted here.",
    hasConversation: false,
    canUpdate: false,
    onUpdate: fn(),
    onReset: fn(),
  },
} satisfies Meta<typeof WidgetEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

// Per-story, not on meta: story decorators STACK with meta decorators, so a box
// here would also squeeze the AllStates grid below.
const boxed: Story["decorators"] = [
  (Story) => (
    <div className="h-72 w-[30rem] overflow-hidden rounded-xl border border-border">
      <Story />
    </div>
  ),
];

/** No conversation yet — just the invitation naming what this panel is for. */
export const Fresh: Story = { decorators: boxed };

/** A conversation exists and this panel could be built from it. */
export const Fillable: Story = {
  args: { hasConversation: true, canUpdate: true },
  decorators: boxed,
};

/** We looked, and nothing in the conversation suited this view. Note the retry. */
export const NothingFit: Story = {
  args: { hasConversation: true, canUpdate: false },
  decorators: boxed,
};

/** The planner asked a clarifying question — no Update button, because it would re-ask. */
export const AwaitingClarification: Story = {
  args: { hasConversation: true, canUpdate: true, awaitingClarification: true },
  decorators: boxed,
};

/** All four side by side. The middle two are the pair worth telling apart. */
export const AllStates: Story = {
  render: (args) => (
    <div className="grid grid-cols-2 gap-4">
      {(
        [
          ["Fresh", { hasConversation: false, canUpdate: false }],
          ["Fillable", { hasConversation: true, canUpdate: true }],
          ["Nothing fit", { hasConversation: true, canUpdate: false }],
          [
            "Awaiting clarification",
            {
              hasConversation: true,
              canUpdate: true,
              awaitingClarification: true,
            },
          ],
        ] as const
      ).map(([name, props]) => (
        <figure key={name} className="flex flex-col gap-2">
          <div className="h-56 w-full overflow-hidden rounded-xl border border-border">
            <WidgetEmptyState {...args} {...props} />
          </div>
          <figcaption className="text-xs text-content-muted">{name}</figcaption>
        </figure>
      ))}
    </div>
  ),
};
