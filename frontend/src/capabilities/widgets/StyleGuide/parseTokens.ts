import indexCss from "../../../index.css?raw";

// The style guide's token list, parsed from index.css itself (via Vite's ?raw
// import) so the guide can never drift from the real theme. The @theme block
// names the tokens; :root and .dark hold the per-theme values. Within a family,
// display order = declaration order in the CSS — keep the ramps ordered there.

export interface TokenEntry {
  name: string;
  light: string;
  dark: string;
}

export interface TokenFamily {
  label: string;
  tokens: TokenEntry[];
}

// Grab the body of a top-level block. Anchored to line start so mentions of
// ":root"/".dark" inside comments don't match. These blocks have no nested
// braces, so the first "}" ends the block.
function blockBody(opener: RegExp): string {
  const match = opener.exec(indexCss);
  if (!match) return "";
  const open = indexCss.indexOf("{", match.index);
  return indexCss.slice(open + 1, indexCss.indexOf("}", open));
}

function readValues(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (name && value) out.set(name, value.trim());
  }
  return out;
}

const FAMILY_ORDER = [
  "Surfaces",
  "Content",
  "Borders",
  "Accent",
  "Neon",
  "Danger",
  "Other",
];

function familyOf(name: string): string {
  // elevated/selected are surface fills; on-accent rides with accent.
  if (name === "elevated" || name === "selected") return "Surfaces";
  if (name === "on-accent") return "Accent";
  if (name.startsWith("surface")) return "Surfaces";
  if (name.startsWith("content")) return "Content";
  if (name.startsWith("border")) return "Borders";
  if (name.startsWith("accent")) return "Accent";
  if (name.startsWith("neon")) return "Neon";
  if (name.startsWith("danger")) return "Danger";
  return "Other";
}

function parse(): TokenFamily[] {
  const themeBody = blockBody(/^@theme \{/m);
  const light = readValues(blockBody(/^:root \{/m));
  const dark = readValues(blockBody(/^\.dark \{/m));

  const byFamily = new Map<string, TokenEntry[]>();
  for (const m of themeBody.matchAll(/--color-([\w-]+):\s*var\(/g)) {
    const name = m[1];
    if (!name) continue;
    const entry: TokenEntry = {
      name,
      light: light.get(name) ?? "",
      dark: dark.get(name) ?? "",
    };
    const family = familyOf(name);
    byFamily.set(family, [...(byFamily.get(family) ?? []), entry]);
  }

  return FAMILY_ORDER.filter((label) => byFamily.has(label)).map((label) => ({
    label,
    tokens: byFamily.get(label)!,
  }));
}

export const TOKEN_FAMILIES: TokenFamily[] = parse();
