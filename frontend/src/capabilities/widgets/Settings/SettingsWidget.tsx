import {
  type FontFace,
  type TextSize,
  useAppearance,
} from "../../../theme/useAppearance";
import { useTheme } from "../../../theme/useTheme";
import { AdminTabs } from "../../../shell/AdminTabs";
import type { Widget } from "../../registry";

// "Settings" — a home for every settable value and control. Controls here are
// DUPLICATED, not moved: the theme toggle still lives in the sidebar header; this
// is a second, fuller surface for the same setting (and more to come). The
// `widget` prop is unused; state is live from the relevant providers.
export function SettingsWidget(_props: { widget: Widget }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col gap-6 overflow-y-auto p-5 max-md:p-4">
      <header className="flex flex-col gap-4">
        <AdminTabs />
        <h1 className="font-display text-base font-semibold text-content">
          Settings
        </h1>
      </header>

      <SettingRow
        title="Appearance"
        description="Light or dark theme. Saved on this device."
      >
        <ThemeChoice />
      </SettingRow>

      <SettingRow
        title="Text size"
        description="Scales text throughout the app."
      >
        <TextSizeChoice />
      </SettingRow>

      <SettingRow title="Font" description="Body typeface. Sans or serif.">
        <FontChoice />
      </SettingRow>
    </div>
  );
}

// One labelled settings row: title + description on the left, control on the
// right, stacking on mobile.
function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-raised p-4 max-md:flex-col max-md:gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-content">{title}</h2>
        <p className="mt-0.5 text-xs text-content-muted">{description}</p>
      </div>
      <div className="shrink-0 max-md:w-full">{children}</div>
    </section>
  );
}

// Generic segmented control — the shared form for every choice on this page.
// The active segment uses bg-surface (white in light, near-black in dark) which
// reads clearly on the row's bg-surface-raised card; the old bg-elevated was too
// close to the card colour to be visible. `style` lets a segment preview its own
// font (the Font picker uses it).
function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; style?: React.CSSProperties }[];
  ariaLabel: string;
}) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className="m-0 inline-flex min-w-0 border-0 p-0"
    >
      <div className="inline-flex rounded-lg border border-border p-0.5 max-md:flex max-md:w-full">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              style={opt.style}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors max-md:py-2.5 ${
                active
                  ? "bg-surface text-content shadow-sm"
                  : "text-content-muted hover:text-content"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// Segmented light/dark control — a clearer settings-page form of the sidebar's
// sun/moon toggle. Both write the same theme via useTheme.
function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  return (
    <Segmented
      ariaLabel="Theme"
      value={theme}
      onChange={setTheme}
      options={[
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ]}
    />
  );
}

// Four text-size steps; md is the browser default, so the unset experience is
// unchanged. Scales every rem-based size via the <html> font-size.
function TextSizeChoice() {
  const { textSize, setTextSize } = useAppearance();
  const options: { value: TextSize; label: string }[] = [
    { value: "xs", label: "XS" },
    { value: "sm", label: "S" },
    { value: "md", label: "M" },
    { value: "lg", label: "L" },
  ];
  return (
    <Segmented
      ariaLabel="Text size"
      value={textSize}
      onChange={setTextSize}
      options={options}
    />
  );
}

// Body font: a sans pair (System / Inter) and a serif pair (Georgia / Lora).
// Each segment previews its own typeface. The brand font is untouched.
function FontChoice() {
  const { fontFace, setFontFace } = useAppearance();
  const options: {
    value: FontFace;
    label: string;
    style: React.CSSProperties;
  }[] = [
    {
      value: "system",
      label: "System",
      style: { fontFamily: "ui-sans-serif, system-ui, sans-serif" },
    },
    {
      value: "inter",
      label: "Inter",
      style: { fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif' },
    },
    {
      value: "georgia",
      label: "Georgia",
      style: { fontFamily: "Georgia, serif" },
    },
    {
      value: "lora",
      label: "Lora",
      style: { fontFamily: '"Lora", Georgia, serif' },
    },
  ];
  return (
    <Segmented
      ariaLabel="Font"
      value={fontFace}
      onChange={setFontFace}
      options={options}
    />
  );
}
