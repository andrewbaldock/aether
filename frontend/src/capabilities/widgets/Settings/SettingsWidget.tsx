import { useTheme } from "../../../theme/useTheme";
import type { Widget } from "../../registry";

// "Settings" — a home for every settable value and control. Controls here are
// DUPLICATED, not moved: the theme toggle still lives in the sidebar header; this
// is a second, fuller surface for the same setting (and more to come). The
// `widget` prop is unused; state is live from the relevant providers.
export function SettingsWidget(_props: { widget: Widget }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col gap-6 overflow-y-auto p-5 max-md:p-4">
      <header>
        <h1 className="font-display text-base font-semibold text-content">
          Settings
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          Preferences for this device. More controls will land here over time.
        </p>
      </header>

      <SettingRow
        title="Appearance"
        description="Light or dark theme. Saved on this device."
      >
        <ThemeChoice />
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

// Segmented light/dark control — a clearer settings-page form of the sidebar's
// sun/moon toggle. Both write the same theme via useTheme.
function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const options: { value: "light" | "dark"; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5 max-md:flex max-md:w-full">
      {options.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-pressed={active}
            className={`flex-1 rounded-md px-4 py-2 text-xs font-medium transition-colors max-md:py-2.5 ${
              active
                ? "bg-elevated text-content"
                : "text-content-muted hover:text-content"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
