import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { fn } from "storybook/test";
import { type ModelOption, ModelPicker } from "./ModelPicker";

// ModelPicker reads its options from a TanStack query (`/api/models`). Rather
// than mock fetch, the story SEEDS THE CACHE with the exact shape the endpoint
// returns — so the component runs its real code path (health filtering, provider
// grouping, default resolution) against known data, with no network at all.
const MODELS: ModelOption[] = [
  {
    id: "claude-sonnet-4-6",
    provider: "claude",
    label: "Sonnet 4.6",
    blurb: "Balanced speed and depth. The default.",
  },
  {
    id: "claude-opus-4-6",
    provider: "claude",
    label: "Opus 4.6",
    blurb: "Deepest reasoning, slowest.",
  },
  {
    id: "gemini-2-5-pro",
    provider: "google",
    label: "Gemini 2.5 Pro",
    blurb: "Long context, fast.",
  },
  {
    id: "deepseek-chat",
    provider: "deepseek",
    label: "DeepSeek V3",
    blurb: "Inexpensive, capable.",
  },
  {
    id: "mistral-large",
    provider: "mistral",
    label: "Mistral Large",
    blurb: "European provider.",
    // Health probe currently failing — filtered out of the list.
    available: false,
  },
];

function withModels(models: ModelOption[]) {
  return (Story: () => React.ReactElement) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["models"], { models });
    return (
      <QueryClientProvider client={client}>
        <div className="flex justify-center p-8">
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

const meta = {
  title: "Shell/ModelPicker",
  component: ModelPicker,
  parameters: {
    docs: {
      description: {
        component: [
          "The chat-footer model switcher, built on Radix Select. Replaced a native `<select>` plus a cross-browser width-hugging hack — the custom trigger hugs its content, themes with app tokens, and can show each model's one-line blurb, which is impossible inside a native `<option>`.",
          "",
          "### It is not a static list",
          "Options are the server allowlist **filtered to providers currently passing a live health probe** (`GET /api/models`, ~60s TTL). So the list can change *within* a session as a provider fails or recovers. Two rules follow from that, and both are easy to get wrong:",
          "",
          "- **A model that's down is still selectable if the session already uses it.** Otherwise the control would silently misreport which model the conversation would actually run on. See the `mistral-large` entry in these stories — `available: false`, filtered out of the list, but kept if it's the current value.",
          "- **An empty list renders nothing, not an empty select.** Until the query resolves (or if it failed), the conversation still works on the server default, so a disabled empty dropdown would be a lie.",
          "",
          "### Accessibility",
          "Radix owns the listbox semantics, type-ahead, arrow-key navigation, focus return on close, and collision-aware positioning. The trigger is a real button with the selected label as its accessible name.",
          "",
          "> These stories seed the TanStack cache directly rather than mocking `fetch`, so the component exercises its real filtering and grouping logic with no network.",
        ].join("\n"),
      },
    },
  },
  args: { onChange: fn(), disabled: false },
  argTypes: { value: { control: false } },
  decorators: [withModels(MODELS)],
} satisfies Meta<typeof ModelPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No explicit choice — the trigger shows the first option, i.e. the server default. */
export const Default: Story = { args: { value: undefined } };

// A real component, not a hook call inside `render`. Storybook invokes `render`
// as a plain function, so hooks used directly in it are only incidentally valid —
// React can and does throw "Invalid hook call" there. Extracting the component
// gives it a proper render boundary.
function StatefulPicker({
  value: initial,
  ...rest
}: React.ComponentProps<typeof ModelPicker>) {
  const [value, setValue] = useState<string | undefined>(initial);
  return <ModelPicker {...rest} value={value} onChange={setValue} />;
}

/** Interactive: open it, pick a model, watch the trigger hug its new label. */
export const Interactive: Story = {
  args: { value: "claude-sonnet-4-6" },
  render: (args) => <StatefulPicker {...args} />,
};

/**
 * The session is pinned to a model whose provider just failed its health probe.
 * `mistral-large` is absent from every other story's list, but stays selectable
 * here — the control must reflect reality, not tidiness.
 */
export const CurrentModelUnavailable: Story = {
  args: { value: "mistral-large" },
};

/** While a turn is streaming the picker is inert — you can't switch mid-answer. */
export const Disabled: Story = {
  args: { value: "claude-sonnet-4-6", disabled: true },
};

/** Allowlist not loaded yet (or the fetch failed): renders nothing at all. */
export const NoModelsYet: Story = {
  args: { value: undefined },
  decorators: [withModels([])],
};
