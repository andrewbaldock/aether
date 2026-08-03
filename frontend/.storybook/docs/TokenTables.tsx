import {
  KG_PALETTE,
  TOKEN_FAMILIES,
  VIZ_RAMP,
} from "../../src/capabilities/widgets/StyleGuide/parseTokens";
import { FONT_STACK, TEXT_SIZE_PX } from "../../src/theme/useAppearance";

// The docs tables read the SAME parsed source the in-app /style-guide page reads:
// TOKEN_FAMILIES is derived from index.css itself (Vite `?raw` import), and the
// type/font tables come straight from useAppearance's exported records. Nothing
// here is a hand-maintained copy, so the docs cannot drift from the theme.

function Swatch({ value }: { value: string }) {
  return (
    <span
      className="inline-block h-6 w-6 shrink-0 rounded border border-border-strong align-middle"
      style={{ background: value }}
    />
  );
}

export function ColorTokens() {
  return (
    <div className="flex flex-col gap-8">
      {TOKEN_FAMILIES.map((family) => (
        <section key={family.label}>
          <h3 className="mb-2 font-display text-sm font-semibold text-content">
            {family.label}
          </h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-content-subtle">
                <th className="py-1 pr-4 font-medium">Utility</th>
                <th className="py-1 pr-4 font-medium">Light</th>
                <th className="py-1 font-medium">Dark</th>
              </tr>
            </thead>
            <tbody>
              {family.tokens.map((token) => (
                <tr key={token.name} className="border-t border-border">
                  <td className="py-2 pr-4 font-mono text-xs text-content">
                    bg-{token.name}
                    <span className="text-content-faint"> / </span>
                    text-{token.name}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="flex items-center gap-2">
                      <Swatch value={token.light} />
                      <code className="text-xs text-content-muted">
                        {token.light}
                      </code>
                    </span>
                  </td>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <Swatch value={token.dark} />
                      <code className="text-xs text-content-muted">
                        {token.dark}
                      </code>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export function KgPalette() {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-content-subtle">
          <th className="py-1 pr-4 font-medium">Entity</th>
          <th className="py-1 pr-4 font-medium">Value (both themes)</th>
          <th className="py-1 font-medium">Was</th>
        </tr>
      </thead>
      <tbody>
        {KG_PALETTE.map((slot) => (
          <tr key={slot.name} className="border-t border-border">
            <td className="py-2 pr-4 font-mono text-xs text-content">
              var(--{slot.name})
            </td>
            <td className="py-2 pr-4">
              <span className="flex items-center gap-2">
                <Swatch value={slot.light} />
                <code className="text-xs text-content-muted">{slot.light}</code>
              </span>
            </td>
            <td className="py-2">
              <span className="flex items-center gap-2">
                <Swatch value={KG_PREVIOUS[slot.name] ?? slot.light} />
                <code className="text-xs text-content-faint">
                  {KG_PREVIOUS[slot.name] ?? "unchanged"}
                </code>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The pre-2026-08 values, kept only so the docs can show the before/after. Not
// used by anything that renders.
const KG_PREVIOUS: Record<string, string | undefined> = {
  "kg-place": "#16c2ff",
  "kg-org": "#f5a623",
  "kg-event": "#34d399",
};

export function VizRamp() {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-content-subtle">
          <th className="py-1 pr-4 font-medium">Slot</th>
          <th className="py-1 pr-4 font-medium">Light</th>
          <th className="py-1 font-medium">Dark</th>
        </tr>
      </thead>
      <tbody>
        {VIZ_RAMP.map((slot) => (
          <tr key={slot.name} className="border-t border-border">
            <td className="py-2 pr-4 font-mono text-xs text-content">
              var(--{slot.name})
            </td>
            <td className="py-2 pr-4">
              <span className="flex items-center gap-2">
                <Swatch value={slot.light} />
                <code className="text-xs text-content-muted">{slot.light}</code>
              </span>
            </td>
            <td className="py-2">
              <span className="flex items-center gap-2">
                <Swatch value={slot.dark} />
                <code className="text-xs text-content-muted">{slot.dark}</code>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TypeScale() {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-content-subtle">
          <th className="py-1 pr-4 font-medium">Step</th>
          <th className="py-1 pr-4 font-medium">Root size</th>
          <th className="py-1 font-medium">Sample</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(TEXT_SIZE_PX).map(([step, px]) => (
          <tr key={step} className="border-t border-border">
            <td className="py-2 pr-4 font-mono text-xs text-content">{step}</td>
            <td className="py-2 pr-4 font-mono text-xs text-content-muted">
              {px}px
            </td>
            <td className="py-2 text-content" style={{ fontSize: px }}>
              The quick brown fox
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FontFaces() {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-content-subtle">
          <th className="py-1 pr-4 font-medium">Choice</th>
          <th className="py-1 font-medium">Sample</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(FONT_STACK).map(([face, stack]) => (
          <tr key={face} className="border-t border-border">
            <td className="py-2 pr-4 font-mono text-xs text-content">{face}</td>
            <td
              className="py-2 text-content"
              style={{ fontFamily: stack, fontSize: 16 }}
            >
              Aether — ask anything
            </td>
          </tr>
        ))}
        <tr className="border-t border-border">
          <td className="py-2 pr-4 font-mono text-xs text-content">
            font-display
          </td>
          <td className="py-2 font-display text-base font-semibold text-content">
            Aether — ask anything
          </td>
        </tr>
      </tbody>
    </table>
  );
}
