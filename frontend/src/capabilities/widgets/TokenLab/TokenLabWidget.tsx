import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AdminPage } from "../../../shell/AdminPage";
import { Button } from "../../../shell/Button";
import { ProseMarkdown } from "../../../shell/ProseMarkdown";
import { ThemeToggle } from "../../../theme/ThemeToggle";
import {
  FONT_STACK,
  type FontFace,
  TEXT_SIZE_PX,
  type TextSize,
  useAppearance,
} from "../../../theme/useAppearance";
import type { Widget } from "../../registry";
import { TOKEN_FAMILIES, type TokenEntry } from "../StyleGuide/parseTokens";
import { overridesToCss } from "./exportCss";
import { useTokenLab } from "./useTokenLab";

// "Theme Lab" — the Style Guide's editable twin. Every color token from
// index.css gets a live control; edits write the intermediate custom property
// onto <html> (see useTokenLab) so the whole running app re-themes instantly.
// Changes are per-mode and saved to localStorage only, so a visitor can retheme
// Aether for themselves — and the author can tune defaults here, hit "Copy CSS",
// and paste the result straight into index.css to commit them.
export function TokenLabWidget(_props: { widget: Widget }) {
  const { theme, overrides, setToken, clearToken, resetAll, all } =
    useTokenLab();
  const { textSize, setTextSize, fontFace, setFontFace } = useAppearance();

  const dirtyCount =
    Object.keys(all.light).length + Object.keys(all.dark).length;

  const copyCss = async () => {
    const css = overridesToCss(all);
    if (!css) {
      toast("Nothing to copy yet — tweak a token first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(css);
      toast("Copied — paste into index.css's :root / .dark blocks.");
    } catch {
      toast("Couldn't access the clipboard.");
    }
  };

  return (
    <AdminPage
      title="Theme Lab"
      width="max-w-4xl"
      actions={<ThemeToggle className="" />}
    >
      <p className="mt-1 text-sm text-content-muted">
        The Style Guide, made editable. Every control below rewrites one design
        token live — you're editing the{" "}
        <strong className="font-semibold text-content">{theme}</strong> palette
        right now (flip the toggle for the other). Changes are yours only, saved
        in this browser. Tune your defaults here, then{" "}
        <strong className="font-semibold text-content">Copy CSS</strong> to
        commit them.
      </p>

      {/* Action bar: copy the current overrides as CSS, or wipe them. */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={copyCss}>
          Copy CSS
        </Button>
        <Button
          variant="secondary"
          onClick={resetAll}
          disabled={dirtyCount === 0}
        >
          Reset all
        </Button>
        <span className="text-xs text-content-subtle">
          {dirtyCount === 0
            ? "No changes"
            : `${dirtyCount} token${dirtyCount === 1 ? "" : "s"} changed`}
        </span>
      </div>

      <Section title="Color tokens">
        <div className="flex flex-col gap-5">
          {TOKEN_FAMILIES.map((family) => (
            <div key={family.label}>
              <h3 className="mb-2 text-xs text-content-subtle">
                {family.label}
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {family.tokens.map((token) => (
                  <TokenControl
                    key={token.name}
                    token={token}
                    theme={theme}
                    override={overrides[token.name]}
                    onChange={(v) => setToken(token.name, v)}
                    onReset={() => clearToken(token.name)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-xs text-content-muted">
              Text size
            </span>
            <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
              {TEXT_SIZES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTextSize(key)}
                  aria-pressed={textSize === key}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    textSize === key
                      ? "bg-accent text-on-accent"
                      : "text-content-muted hover:text-content"
                  }`}
                >
                  {label} · {TEXT_SIZE_PX[key]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-xs text-content-muted">
              Body font
            </span>
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-border bg-surface p-0.5">
              {FONT_FACES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFontFace(key)}
                  aria-pressed={fontFace === key}
                  style={{ fontFamily: FONT_STACK[key] }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    fontFace === key
                      ? "bg-accent text-on-accent"
                      : "text-content-muted hover:text-content"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Live preview">
        <p className="mb-3 text-xs text-content-muted">
          Reads the same tokens — every edit above lands here (and everywhere
          else in the app) instantly.
        </p>
        <div className="rounded-lg border border-border bg-surface p-4 text-content">
          <ProseMarkdown text={PREVIEW_PROSE} />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="primary">Primary action</Button>
            <button
              type="button"
              className="rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-content-muted transition-colors hover:bg-elevated hover:text-content"
            >
              Secondary
            </button>
            <span className="inline-flex items-center rounded-md bg-danger-surface px-2 py-1 text-xs font-medium text-danger-content">
              Danger
            </span>
          </div>
        </div>
      </Section>
    </AdminPage>
  );
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;

// One token's controls: a live swatch, a native color picker (hex-only — the
// text field is authoritative and covers non-hex values like rgba), the text
// field, and a reset button shown only when the token is overridden.
function TokenControl({
  token,
  theme,
  override,
  onChange,
  onReset,
}: {
  token: TokenEntry;
  theme: "light" | "dark";
  override: string | undefined;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const base = theme === "dark" ? token.dark : token.light;
  const current = override ?? base;
  const colorValue = HEX6.test(current) ? current : "#000000";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised p-2">
      {/* The swatch reads the resolved token, so it reflects an override the
          instant it's applied to <html>. */}
      <div
        className="h-9 w-9 shrink-0 rounded-md border border-border-strong"
        style={{ background: `var(--color-${token.name})` }}
      />
      <label className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border-strong">
        <input
          type="color"
          value={colorValue}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${token.name} color picker`}
          className="absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer border-0 bg-transparent p-0"
        />
      </label>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs text-content-muted">
          {token.name}
        </span>
        <input
          type="text"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${token.name} value`}
          spellCheck={false}
          className="w-full bg-transparent font-mono text-[11px] text-content outline-none"
        />
      </div>
      <button
        type="button"
        onClick={onReset}
        disabled={override === undefined}
        aria-label={`Reset ${token.name}`}
        title="Reset to default"
        className="shrink-0 rounded-md p-1 text-content-subtle transition-colors hover:bg-elevated hover:text-content disabled:pointer-events-none disabled:opacity-0"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
      </button>
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

const TEXT_SIZES: { key: TextSize; label: string }[] = [
  { key: "xs", label: "XS" },
  { key: "sm", label: "S" },
  { key: "md", label: "M" },
  { key: "lg", label: "L" },
];

const FONT_FACES: { key: FontFace; label: string }[] = [
  { key: "system", label: "System" },
  { key: "geist", label: "Geist" },
  { key: "georgia", label: "Georgia" },
  { key: "lora", label: "Lora" },
];

const PREVIEW_PROSE = `## A living palette

Change a token and watch it ripple — the accent, the surfaces, the text all
resolve through the same variables the rest of Aether uses.

> Nothing here is bespoke: it's the real theme, editable.`;
