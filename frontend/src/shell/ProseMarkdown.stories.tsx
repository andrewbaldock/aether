import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProseMarkdown } from "./ProseMarkdown";

const meta = {
  title: "Foundations/Typeset engine",
  component: ProseMarkdown,
  parameters: {
    docs: {
      description: {
        component: [
          "Every assistant answer is *set*, not merely rendered. `ProseMarkdown` wraps `react-markdown` with a small remark-directive plugin and a `.prose-editorial` stylesheet, giving the model an art-direction palette it can reach for mid-answer.",
          "",
          "### Two variants, chosen automatically",
          "`isArticle()` picks the treatment from the text itself — no flag from the backend, no prop from the caller. A body qualifies as an **article** if it has a markdown heading, uses any block directive, or simply runs past 320 characters. Otherwise it's **compact**.",
          "",
          "That heuristic is doing real work: a one-line reply that got a drop cap and a standfirst would look ridiculous, and a 900-word essay set as a chat bubble would be unreadable. The threshold is deliberately crude — three cheap tests, no model call.",
          "",
          "### The directive palette",
          "",
          "| Syntax | Renders |",
          "|---|---|",
          "| `:::lead` | standfirst — larger opening paragraph |",
          '| `:::pullquote{cite="…"}` | offset display quote, optional attribution |',
          '| `:::callout{title="…"}` | titled box |',
          "| `:::aside` | marginal note |",
          '| `::stat[value]{label="…"}` | a single number with a label (leaf, not a container) |',
          "| `:accent` | inline emphasis — the only inline directive |",
          "",
          "### Graceful degradation is the point",
          "The model is a text generator, so it *will* eventually emit a directive that doesn't exist, or a stray `word:word` that looks like one. Both cases are handled: an unknown `:::directive` drops its wrapper and keeps its children, and a bare `namespace:function` keeps its text. **Nothing is ever swallowed.** See the last story.",
          "",
          "### Preamble stripping",
          'Claude narrates its own process — "Let me pull the figures…" — before and between tool calls. That scaffolding is demoted to muted `.prose-preamble` lines *above* the body, so it can never pick up the drop cap or standfirst. New turns are classified by the backend\'s SSE `segment` markers; the regex pass stays as a second line of defence for legacy transcripts.',
        ].join("\n"),
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProseMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Short answer → compact variant. No drop cap, no standfirst. */
export const Compact: Story = {
  args: {
    text: "The Apollo program ran eleven crewed missions between 1968 and 1972, six of which landed on the Moon.",
  },
};

/**
 * Passes the 320-character threshold, so it's set as an article: larger measure,
 * standfirst, and a drop cap on the first letter of the body.
 */
export const Article: Story = {
  args: {
    text: [
      "## The Apollo program",
      "",
      ":::lead",
      "Between 1968 and 1972, NASA flew eleven crewed Apollo missions. Six of them landed on the Moon, and the program ended not in failure but in budget cuts.",
      ":::",
      "",
      "The engineering problem was never really the rocket. Saturn V worked, and worked repeatedly. The problem was everything that had to happen *after* the rocket: rendezvous in lunar orbit, a landing on a surface nobody had touched, and a return with no possibility of rescue.",
      "",
      "Apollo 8 is the mission that gets least credit and deserves the most. It flew to the Moon without a lunar module — meaning that if the service propulsion engine had failed in lunar orbit, the crew would have stayed there.",
    ].join("\n"),
  },
};

/** The full art-direction palette in one answer. */
export const DirectivePalette: Story = {
  args: {
    text: [
      "## Every directive",
      "",
      ":::lead",
      "A standfirst opens the piece, set larger than the body.",
      ":::",
      "",
      "Body copy runs at the article measure. Inline emphasis uses :accent[the accent directive], which is the only inline one.",
      "",
      ':::pullquote{cite="Gene Kranz"}',
      "A pull quote breaks the column and sets the argument apart.",
      ":::",
      "",
      ':::callout{title="Worth knowing"}',
      "A callout carries a title and a body — used for caveats and asides that shouldn't interrupt the flow.",
      ":::",
      "",
      '::stat[400,000]{label="people employed at peak"}',
      "",
      ":::aside",
      "An aside is quieter than a callout — marginal, not important.",
      ":::",
      "",
      "And the piece continues after all of it.",
    ].join("\n"),
  },
};

/** Process narration is demoted above the body — it never gets the article treatment. */
export const WithPreamble: Story = {
  args: {
    preamble: [
      "Let me pull the mission figures.",
      "I have the data. Let me render the answer.",
    ],
    text: [
      "## Apollo, by the numbers",
      "",
      ":::lead",
      "Eleven crewed missions, six landings, and roughly four hundred thousand people at peak employment.",
      ":::",
      "",
      "The drop cap belongs to this body paragraph — not to the muted narration above it. That separation is the whole reason preamble is a distinct concept rather than just more markdown.",
    ].join("\n"),
  },
};

/**
 * **The robustness story.** An invented directive and a stray colon-word are both
 * things a language model will eventually emit. Neither may destroy content: the
 * unknown container drops its wrapper and keeps its children, and the bare
 * `namespace:function` renders as text.
 */
export const GracefulDegradation: Story = {
  args: {
    text: [
      "Known directives render. Unknown ones must degrade without eating their contents:",
      "",
      ":::sparkle",
      "This paragraph is inside a directive that does not exist. It still appears — only the wrapper is dropped.",
      ":::",
      "",
      "And a stray colon-word like namespace:function keeps its text instead of vanishing into a parsed directive.",
    ].join("\n"),
  },
};
