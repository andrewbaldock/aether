import { AdminPage } from "../../../shell/AdminPage";
import { ConfirmDialog } from "../../../shell/ConfirmDialog";
import { Tooltip } from "../../../shell/Tooltip";
import { FONT_STACK, TEXT_SIZE_PX } from "../../../theme/useAppearance";
import type { Widget } from "../../registry";
import type { CardCapability } from "../Bigsail/cards";
import { SkeletonCard } from "../Bigsail/SkeletonCard";

// "Style Guide" — a live index of the tokens, primitives, and motion the rest
// of the app is built from. Nothing here is bespoke: every swatch below is a
// real bg-{token} utility, every skeleton is the actual Bigsail SkeletonCard,
// and the entrance stagger reuses the same --i / tiles-skeleton-in convention
// as everywhere else (see index.css). This page exists to SHOW the design
// system rather than describe it — flip the sidebar theme toggle while it's
// open and every swatch updates live.
export function StyleGuideWidget(_props: { widget: Widget }) {
  return (
    <AdminPage title="Style Guide" width="max-w-4xl">
      <p className="mt-1 text-sm text-content-muted">
        Every token, primitive, and motion pattern below is pulled straight from
        the running app — not a mockup. Flip the theme in the sidebar to see it
        update live.
      </p>

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {COLOR_TOKENS.map((token, i) => (
            <Swatch key={token.className} token={token} index={i} />
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
    </AdminPage>
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

interface ColorToken {
  className: string;
  label: string;
}

// Mirrors the @theme block in index.css 1:1 — add a token there, add it here.
const COLOR_TOKENS: ColorToken[] = [
  { className: "bg-surface", label: "surface" },
  { className: "bg-surface-raised", label: "surface-raised" },
  { className: "bg-surface-overlay", label: "surface-overlay" },
  { className: "bg-elevated", label: "elevated" },
  { className: "bg-selected", label: "selected" },
  { className: "bg-content", label: "content" },
  { className: "bg-content-muted", label: "content-muted" },
  { className: "bg-content-subtle", label: "content-subtle" },
  { className: "bg-content-faint", label: "content-faint" },
  { className: "bg-border", label: "border" },
  { className: "bg-border-strong", label: "border-strong" },
  { className: "bg-accent", label: "accent" },
  { className: "bg-on-accent", label: "on-accent" },
  { className: "bg-accent-hover", label: "accent-hover" },
  { className: "bg-neon-pink", label: "neon-pink" },
  { className: "bg-neon-cyan", label: "neon-cyan" },
  { className: "bg-danger-surface", label: "danger-surface" },
  { className: "bg-danger-content", label: "danger-content" },
];

function Swatch({ token, index }: { token: ColorToken; index: number }) {
  return (
    <div
      className="tiles-skeleton-in flex flex-col gap-1.5"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div
        className={`h-12 rounded-lg border border-border-strong ${token.className}`}
      />
      <span className="text-xs text-content-muted">{token.label}</span>
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

const SPACING_STEPS = [4, 8, 12, 16, 20, 24, 32];

const SKELETON_TYPES: CardCapability[] = [
  "table",
  "chart",
  "timeline",
  "knowledge-graph",
  "images",
];
