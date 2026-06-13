import { describe, expect, it } from "vitest";
import { hasSavedContent, isGraphSnapshot } from "./graphGuard";

describe("isGraphSnapshot", () => {
  it("accepts an empty graph", () => {
    expect(isGraphSnapshot({ nodes: [], links: [] })).toBe(true);
  });

  it("accepts a graph whose first node has id + type", () => {
    expect(
      isGraphSnapshot({
        nodes: [{ id: "a", label: "A", type: "person" }],
        links: [],
      })
    ).toBe(true);
  });

  it("rejects when nodes or links is not an array", () => {
    expect(isGraphSnapshot({ nodes: {}, links: [] })).toBe(false);
    expect(isGraphSnapshot({ nodes: [], links: null })).toBe(false);
  });

  it("rejects a node missing the identifying fields (drifted shape)", () => {
    expect(isGraphSnapshot({ nodes: [{ name: "A" }], links: [] })).toBe(false);
    expect(isGraphSnapshot({ nodes: [{ id: "a" }], links: [] })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isGraphSnapshot(null)).toBe(false);
    expect(isGraphSnapshot("graph")).toBe(false);
  });
});

describe("hasSavedContent", () => {
  it("is true only when there are persisted nodes", () => {
    expect(hasSavedContent({ nodes: [{ id: "a" }], links: [] })).toBe(true);
  });

  it("is false for an empty / null / missing graph", () => {
    expect(hasSavedContent({ nodes: [], links: [] })).toBe(false);
    expect(hasSavedContent(null)).toBe(false);
    expect(hasSavedContent({})).toBe(false);
  });
});
