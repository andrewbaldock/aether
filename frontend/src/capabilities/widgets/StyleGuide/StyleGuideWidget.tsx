import { ChevronDown, Settings } from "lucide-react";
import { useState } from "react";
import { ThinkingGlyph } from "../../../brand/ThinkingGlyph";
import { Wordmark } from "../../../brand/Wordmark";
import { AdminPage } from "../../../shell/AdminPage";
import { ConfirmDialog } from "../../../shell/ConfirmDialog";
import { IconButton } from "../../../shell/IconButton";
import { ModelPicker } from "../../../shell/ModelPicker";
import { ProseMarkdown } from "../../../shell/ProseMarkdown";
import { Tooltip } from "../../../shell/Tooltip";
import { ThemeToggle } from "../../../theme/ThemeToggle";
import { FONT_STACK, TEXT_SIZE_PX } from "../../../theme/useAppearance";
import { useTheme } from "../../../theme/useTheme";
import type { Widget } from "../../registry";
import { BigsailLoading } from "../Bigsail/BigsailLoading";
import type { CardCapability } from "../Bigsail/cards";
import { SkeletonCard } from "../Bigsail/SkeletonCard";
import {
  resolveVocabularyIcon,
  VOCABULARY_ICON_NAMES,
} from "../vocabularyIcon";
import { TOKEN_FAMILIES, type TokenEntry } from "./parseTokens";

// Alphabetized once at module load for the icon-vocabulary grid.
const ICON_NAMES = [...VOCABULARY_ICON_NAMES].sort();

// "Style Guide" — a live index of the tokens, primitives, and motion the rest
// of the app is built from. Nothing here is bespoke: the color tokens and
// their values are parsed straight out of index.css (see parseTokens.ts) so
// the guide can't drift from the source, every skeleton is the actual Bigsail
// SkeletonCard, and the entrance stagger reuses the same --i /
// tiles-skeleton-in convention as everywhere else (see index.css). This page
// exists to SHOW the design system rather than describe it — flip the sidebar
// theme toggle while it's open and every swatch updates live.
export function StyleGuideWidget(_props: { widget: Widget }) {
  const { theme } = useTheme();
  // Local selection for the dropdown demo — starts on the server default and
  // switches freely; nothing is persisted, it's just the live control.
  const [demoModel, setDemoModel] = useState<string | undefined>(undefined);
  // Icon-vocabulary panel: collapsed shows the first row with the next fading
  // out under a gradient; open shows the whole set.
  const [iconsOpen, setIconsOpen] = useState(false);
  return (
    <AdminPage
      title="Style Guide"
      width="max-w-4xl"
      // The sidebar toggle works too, but the guide is exactly where you want
      // to flip themes back and forth — so it gets its own switcher.
      actions={<ThemeToggle className="" />}
    >
      <Section title="Branding">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4">
          {/* Each cell centers glyph over caption: the Wordmark SVG's viewBox
              carries transparent side margins (text centered in a 600-wide
              box), so left-aligning it against its caption reads as a weird
              indent. items-center hides that. */}
          <div className="flex flex-wrap items-stretch gap-3">
            <BrandPill caption="Wordmark — Grenze Gotisch 600, pink→cyan gradient">
              <Wordmark height={48} />
            </BrandPill>
            <BrandPill caption="compact — favicon / collapsed rail">
              <Wordmark height={48} compact />
            </BrandPill>
            <BrandPill caption="Brahmi lotus U+1110D — the Send button glyph">
              <span className="text-4xl leading-none text-neon-pink">𑁍</span>
            </BrandPill>
            <BrandPill caption="ThinkingGlyph — spins while a turn streams">
              <ThinkingGlyph height={36} animate />
            </BrandPill>
            {/* Double-height pill: the new-canvas gathering animation, scaled
                down (its natural SVG is 360×240) and its built-in caption +
                padding tightened to fit the pill. */}
            <BrandPill caption="BigsailLoading — new-canvas gathering animation">
              <div className="[&_svg]:h-36 [&_svg]:w-auto [&>div]:gap-1 [&>div]:p-0">
                <BigsailLoading />
              </div>
            </BrandPill>
          </div>
        </div>
      </Section>

      <Section title="Color tokens">
        <div className="flex flex-col gap-4">
          {TOKEN_FAMILIES.map((family, fi) => (
            <div key={family.label}>
              <h3 className="mb-1.5 text-xs text-content-subtle">
                {family.label}
              </h3>
              <div className="flex flex-wrap gap-3">
                {family.tokens.map((token, ti) => (
                  <Swatch
                    key={token.name}
                    token={token}
                    index={swatchIndex(fi, ti)}
                    theme={theme}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4">
          <p className="font-display text-2xl font-semibold text-content">
            Space Grotesk — font-display
          </p>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            {TEXT_SIZES.map(({ key, label }) => (
              <span
                key={key}
                style={{ fontSize: TEXT_SIZE_PX[key] }}
                className="text-content"
              >
                {label} · {TEXT_SIZE_PX[key]}px
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {FONT_FACES.map(({ key, label }) => (
              <span
                key={key}
                style={{ fontFamily: FONT_STACK[key] }}
                className="text-base text-content"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Editorial prose">
        <p className="mb-3 text-xs text-content-muted">
          How an assistant answer is set — the same ProseMarkdown the chat uses.
          A substantial answer gets the <code>article</code> variant (larger
          measure, standfirst + drop cap); the full directive palette
          (pull-quote, callout, aside, stat, accent) renders live below. The
          last two lines prove graceful degradation: an unknown{" "}
          <code>:::directive</code> drops its wrapper and a stray{" "}
          <code>namespace:function</code> keeps its text.
        </p>
        <div className="rounded-lg border border-border bg-surface p-4 text-content">
          <ProseMarkdown text={PROSE_SAMPLE} />
        </div>
        <p className="mt-4 mb-2 text-xs text-content-muted">
          A short reply stays in the <code>compact</code> variant — no drop cap,
          no oversized type:
        </p>
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-content">
          <ProseMarkdown text={PROSE_SAMPLE_COMPACT} />
        </div>
      </Section>

      <Section title="Widget skeletons">
        <p className="mb-3 text-xs text-content-muted">
          The actual Bigsail skeleton silhouettes — one shared shimmer
          animation, five distinct shapes hinting at each widget's final form.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SKELETON_TYPES.map((type) => (
            <div key={type} className="flex flex-col gap-1.5">
              <div className="h-28 overflow-hidden rounded-lg border border-border bg-surface">
                <SkeletonCard type={type} />
              </div>
              <span className="text-center text-xs text-content-muted">
                {type}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Spacing rhythm">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-4">
          {SPACING_STEPS.map((px) => (
            <div key={px} className="flex items-center gap-3">
              <span className="w-10 shrink-0 text-xs text-content-muted">
                {px}px
              </span>
              <div className="h-3 rounded bg-accent" style={{ width: px }} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Primitives">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised p-4">
          <Tooltip label="Built on Radix — focus, Escape, and portal handled for free">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-content-muted transition-colors hover:bg-elevated hover:text-content"
            >
              Hover for tooltip
            </button>
          </Tooltip>

          <ConfirmDialog
            trigger={
              <button
                type="button"
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
              >
                Open confirm dialog
              </button>
            }
            title="Just a demo"
            description="The same ConfirmDialog every destructive action in the app reuses."
            confirmLabel="Got it"
            onConfirm={() => {}}
          />

          {/* The live model picker — the app's dropdown pattern (Radix Select:
              grouped options, blurbs, check on the active row). Selection here
              is local to the demo; it doesn't touch any conversation. */}
          <div className="flex items-center gap-2 rounded-lg border border-border-strong px-1">
            <ModelPicker value={demoModel} onChange={setDemoModel} />
          </div>
        </div>
      </Section>

      <Section title="Summarized titles">
        <p className="mb-3 text-xs text-content-muted">
          Conversations name themselves: after the first exchange the backend
          summarizes the topic into a short title — and picks a matching icon
          from the vocabulary below. The title bar renders both in the display
          font: click-to-rename, chevron revealed on hover.
        </p>
        <div className="flex flex-col gap-3">
          <TitleDemo
            question="How do design systems evolve over time?"
            icon="palette"
            title="Design Systems History"
          />
          <TitleDemo
            question="Walk me through the Apollo program, mission by mission."
            icon="rocket"
            title="Apollo Program Timeline"
          />
        </div>
      </Section>

      <Section title="Icon buttons">
        <p className="mb-3 text-xs text-content-muted">
          The one icon-only treatment from{" "}
          <code className="text-content-subtle">shell/IconButton.tsx</code> —
          recedes until hovered/focused/pressed, then shows a border +
          background wash and the icon goes brand pink. Every icon-only button
          in the app uses this same component.
        </p>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised p-4">
          <IconButton label="Icon button">
            <Settings className="h-4 w-4" aria-hidden />
          </IconButton>
          <span className="text-xs text-content-muted">
            hover, focus, or tap to see the border/background/pink treatment
          </span>
        </div>
      </Section>

      <Section title="Lucide icon vocabulary">
        <p className="mb-3 text-xs text-content-muted">
          The closed set of Lucide icons the model may pick for topics,
          entities, and events — statically imported (no per-icon chunks) and
          mirrored 1:1 with the backend's ICON_VOCABULARY. {ICON_NAMES.length}{" "}
          icons.
        </p>
        {/* Collapsed: the first row shows in full, the second fades out under
            a gradient (same token as the panel bg, so it melts into it). The
            whole faded area is the expand target. */}
        <div className="overflow-hidden rounded-lg border border-border bg-surface-raised">
          <div
            className={`relative ${iconsOpen ? "" : "max-h-26 overflow-hidden"}`}
          >
            <div className="grid grid-cols-4 gap-x-2 gap-y-3 p-4 sm:grid-cols-6 md:grid-cols-8">
              {ICON_NAMES.map((name) => {
                const Icon = resolveVocabularyIcon(name);
                return (
                  Icon && (
                    <div
                      key={name}
                      className="flex flex-col items-center gap-1"
                      title={name}
                    >
                      <Icon className="h-4 w-4 text-content" aria-hidden />
                      <span className="max-w-full truncate text-[10px] text-content-muted">
                        {name}
                      </span>
                    </div>
                  )
                );
              })}
            </div>
            {!iconsOpen && (
              <button
                type="button"
                onClick={() => setIconsOpen(true)}
                className="absolute inset-x-0 bottom-0 flex h-16 items-end justify-center bg-linear-to-t from-surface-raised via-surface-raised/80 to-transparent pb-1 text-xs text-content-muted transition-colors hover:text-content"
              >
                Show all {ICON_NAMES.length} icons
              </button>
            )}
          </div>
          {iconsOpen && (
            <button
              type="button"
              onClick={() => setIconsOpen(false)}
              className="w-full border-t border-border py-1.5 text-xs text-content-muted transition-colors hover:bg-elevated hover:text-content"
            >
              Collapse
            </button>
          )}
        </div>
      </Section>
    </AdminPage>
  );
}

// One branding specimen: glyph centered over its caption inside a faintly
// bordered pill. Centering matters — the Wordmark SVG's viewBox carries
// transparent side margins (text centered in a 600-wide box), so left-aligning
// it against a caption reads as a weird indent.
function BrandPill({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-1.5 rounded-md border border-border p-3">
      <div className="flex flex-1 items-center">{children}</div>
      <span className="max-w-52 text-center text-xs text-content-muted">
        {caption}
      </span>
    </div>
  );
}

// One summarized-title example: the first question the user asked, and the
// title + icon the summarizer produced from it. The bar is a static replica of
// ChatPanel's conversation title bar (same classes, no rename wiring) so the
// guide shows the exact resting + hover treatment.
function TitleDemo({
  question,
  icon,
  title,
}: {
  question: string;
  icon: string;
  title: string;
}) {
  const TopicIcon = resolveVocabularyIcon(icon);
  return (
    <div>
      <p className="mb-1 text-xs text-content-subtle">“{question}” →</p>
      <div className="aether-titlebar-texture relative flex h-11.25 items-center overflow-hidden rounded-lg border border-border">
        <button
          type="button"
          className="group flex h-full w-full items-center justify-center gap-1.5 px-4 text-[0.9375rem] text-content-muted hover:text-content transition-colors"
        >
          {TopicIcon && (
            <TopicIcon
              className="h-4 w-4 shrink-0 text-pink-400/80 group-hover:text-pink-400 transition-colors"
              aria-hidden
            />
          )}
          <span className="max-w-sm truncate font-display">{title}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity md:opacity-0 md:group-hover:opacity-100"
            aria-hidden
          />
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-content-subtle">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Flat entrance-stagger index for a swatch, counting across all families.
function swatchIndex(familyIdx: number, tokenIdx: number): number {
  return (
    TOKEN_FAMILIES.slice(0, familyIdx).reduce(
      (n, f) => n + f.tokens.length,
      0
    ) + tokenIdx
  );
}

function Swatch({
  token,
  index,
  theme,
}: {
  token: TokenEntry;
  index: number;
  theme: "light" | "dark";
}) {
  return (
    <div
      className="tiles-skeleton-in flex w-28 flex-col gap-1"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div
        className="h-12 rounded-lg border border-border-strong"
        style={{ background: `var(--color-${token.name})` }}
      />
      <span className="text-xs text-content-muted">{token.name}</span>
      <span className="font-mono text-[10px] text-content-faint">
        {theme === "dark" ? token.dark : token.light}
      </span>
    </div>
  );
}

const TEXT_SIZES: { key: keyof typeof TEXT_SIZE_PX; label: string }[] = [
  { key: "xs", label: "XS" },
  { key: "sm", label: "S" },
  { key: "md", label: "M" },
  { key: "lg", label: "L" },
];

const FONT_FACES: { key: keyof typeof FONT_STACK; label: string }[] = [
  { key: "system", label: "System" },
  { key: "geist", label: "Geist" },
  { key: "georgia", label: "Georgia" },
  { key: "lora", label: "Lora" },
];

// Exercises every editorial element + the full directive palette, so the whole
// prose system can be eyeballed here without spending an LLM turn. The final two
// constructs are deliberately malformed to verify graceful degradation.
const PROSE_SAMPLE = `Let me pull this together and lay out the panels.

Micronauts began not in America but in Japan, where Takara's Microman line turned interchangeable 3¾-inch figures into a modular engineering kit for children — an idea that would ripple across the whole toy industry.

## Homeworld and the Body Banks

The line's design language felt genuinely alien: partly translucent bodies, standardized peg-and-socket joints, every vehicle connecting to every figure. It read less like a toy and more like a coherent little universe.

:::pullquote{cite="Mego catalog, 1977"}
Every accessory in the line connected to every figure.
:::

Mego licensed it in 1976 and the timing was serendipitous — :accent[Star Wars hit the next year] and supercharged demand for science-fiction toys.

- Standardized joints across the whole system
- Translucent, biomechanical sculpts
- Vehicles and playsets that all interconnect

::stat[3¾-inch]{label="figure scale"}

:::callout{title="Why it mattered"}
The interchangeability wasn't a gimmick — it was a system, and systems invite play the way a single toy never can.
:::

:::aside
Takara later reused several molds for the Microman revival, which is why some Micronauts sculpts look eerily familiar.
:::

Compare a translucent \`Time Traveler\` figure to see the aesthetic in one glance.

---

:::bogus{foo="bar"}
This unknown directive should render as plain text with no leaked colons.
:::

And a stray namespace:function reference must keep its text intact.`;

const PROSE_SAMPLE_COMPACT = "Yes — Takara's Microman launched in 1974.";

const SPACING_STEPS = [4, 8, 12, 16, 20, 24, 32];

const SKELETON_TYPES: CardCapability[] = [
  "table",
  "chart",
  "timeline",
  "knowledge-graph",
  "images",
];
