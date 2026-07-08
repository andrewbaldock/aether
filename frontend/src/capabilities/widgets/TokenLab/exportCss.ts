import type { Overrides } from "./useTokenLab";

// Turn the live Theme Lab overrides into the exact CSS you'd paste into
// index.css's :root / .dark blocks to commit them as the new defaults. Only
// modified tokens are emitted; a mode with no edits is omitted entirely.
export function overridesToCss(all: Overrides): string {
  const block = (selector: string, values: Record<string, string>): string => {
    const lines = Object.entries(values).map(([k, v]) => `  --${k}: ${v};`);
    return lines.length ? `${selector} {\n${lines.join("\n")}\n}` : "";
  };
  return [block(":root", all.light), block(".dark", all.dark)]
    .filter(Boolean)
    .join("\n\n");
}
