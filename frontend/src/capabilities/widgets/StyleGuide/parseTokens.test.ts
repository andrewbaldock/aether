import { describe, expect, it } from "vitest";
import { TOKEN_FAMILIES, VIZ_RAMP } from "./parseTokens";

// Runs against the real index.css (?raw import) — if the parser or the CSS
// structure drifts, this is what catches it.
describe("parseTokens", () => {
  const all = TOKEN_FAMILIES.flatMap((f) => f.tokens);

  it("finds every color token registered in @theme", () => {
    expect(all).toHaveLength(18);
  });

  it("resolves a light and dark value for every token", () => {
    for (const token of all) {
      expect(token.light, `${token.name} light`).toBeTruthy();
      expect(token.dark, `${token.name} dark`).toBeTruthy();
    }
  });

  it("classifies every token into a named family", () => {
    expect(TOKEN_FAMILIES.map((f) => f.label)).not.toContain("Other");
  });

  // The ramp's LENGTH is the contract: ChartWidget cycles modulo 8, so losing a
  // slot silently shifts every series colour. Its ORDER is the colourblind-safety
  // guarantee (adjacent-pair separation was validated against this sequence), so a
  // reorder must be a deliberate, re-validated change — not a drive-by tidy.
  it("parses all eight data-viz ramp slots, in order, for both themes", () => {
    expect(VIZ_RAMP.map((t) => t.name)).toEqual([
      "viz-1",
      "viz-2",
      "viz-3",
      "viz-4",
      "viz-5",
      "viz-6",
      "viz-7",
      "viz-8",
    ]);
    for (const slot of VIZ_RAMP) {
      expect(slot.light, `${slot.name} light`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(slot.dark, `${slot.name} dark`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("keeps the viz ramp out of @theme (Tailwind v4 tree-shakes unused entries)", () => {
    const names = TOKEN_FAMILIES.flatMap((f) => f.tokens).map((t) => t.name);
    expect(names.filter((n) => n.startsWith("viz"))).toEqual([]);
  });

  it("documents that accent is an alias of neon-pink", () => {
    const get = (name: string) => all.find((t) => t.name === name);
    expect(get("accent")?.light).toBe(get("neon-pink")?.light);
    expect(get("accent")?.dark).toBe(get("neon-pink")?.dark);
  });
});
