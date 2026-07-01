import { describe, expect, it } from "vitest";
import { TOKEN_FAMILIES } from "./parseTokens";

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

  it("documents that accent is an alias of neon-pink", () => {
    const get = (name: string) => all.find((t) => t.name === name);
    expect(get("accent")?.light).toBe(get("neon-pink")?.light);
    expect(get("accent")?.dark).toBe(get("neon-pink")?.dark);
  });
});
