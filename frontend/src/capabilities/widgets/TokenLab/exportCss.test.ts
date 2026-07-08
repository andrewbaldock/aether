import { describe, expect, it } from "vitest";
import { overridesToCss } from "./exportCss";

describe("overridesToCss", () => {
  it("emits :root and .dark blocks for modified tokens", () => {
    const css = overridesToCss({
      light: { accent: "#ff0000", surface: "#ffffff" },
      dark: { accent: "#00ff00" },
    });
    expect(css).toBe(
      ":root {\n  --accent: #ff0000;\n  --surface: #ffffff;\n}\n\n" +
        ".dark {\n  --accent: #00ff00;\n}"
    );
  });

  it("omits an empty mode entirely", () => {
    expect(overridesToCss({ light: { accent: "#ff0000" }, dark: {} })).toBe(
      ":root {\n  --accent: #ff0000;\n}"
    );
  });

  it("returns an empty string when nothing is overridden", () => {
    expect(overridesToCss({ light: {}, dark: {} })).toBe("");
  });
});
