import { describe, expect, it } from "vitest";
import { normalizeDirectiveFences } from "./ProseMarkdown";

describe("normalizeDirectiveFences", () => {
  it("hoists attributes off a dangling close fence and closes the block", () => {
    const out = normalizeDirectiveFences(
      ':::pullquote\n"Dave lured in consumers." :::{cite="FTC"}\n\nThe effective cost is brutal.'
    );
    expect(out).toBe(
      ':::pullquote{cite="FTC"}\n"Dave lured in consumers."\n:::\n\nThe effective cost is brutal.'
    );
  });

  it("leaves well-formed directives alone", () => {
    const md = ':::callout{title="Key"}\nA boxed takeaway.\n:::\n\nAfter.';
    expect(normalizeDirectiveFences(md)).toBe(md);
  });
});
