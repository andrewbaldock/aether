import { describe, expect, it } from "bun:test";
import { isDegenerate } from "./tools";

describe("isDegenerate", () => {
  it("flags empty render results", () => {
    expect(isDegenerate("render_table", JSON.stringify({ rows: [] }))).toBe(
      true
    );
    expect(
      isDegenerate("render_chart", JSON.stringify({ data: [], series: [] }))
    ).toBe(true);
    expect(
      isDegenerate(
        "render_chart",
        JSON.stringify({ data: [{ x: 1 }], series: [] })
      )
    ).toBe(true);
    expect(isDegenerate("render_timeline", JSON.stringify({ items: [] }))).toBe(
      true
    );
    expect(isDegenerate("render_images", JSON.stringify({ images: [] }))).toBe(
      true
    );
  });

  it("flags empty data-tool results", () => {
    expect(isDegenerate("wikidata_query", JSON.stringify({ rows: [] }))).toBe(
      true
    );
    expect(isDegenerate("world_bank", JSON.stringify({ rows: [] }))).toBe(true);
  });

  it("does NOT flag healthy results", () => {
    expect(
      isDegenerate("render_table", JSON.stringify({ rows: [{ a: 1 }] }))
    ).toBe(false);
    expect(
      isDegenerate(
        "render_chart",
        JSON.stringify({ data: [{ x: 1 }], series: [{ key: "y" }] })
      )
    ).toBe(false);
  });

  it("treats explicit tool errors as NOT degenerate (handled elsewhere)", () => {
    expect(
      isDegenerate("wikidata_query", JSON.stringify({ error: "bad query" }))
    ).toBe(false);
  });

  it("never false-positives on unparseable or unknown results", () => {
    expect(isDegenerate("render_table", "not json")).toBe(false);
    expect(isDegenerate("get_current_datetime", '"2020-01-01"')).toBe(false);
    expect(isDegenerate("search_images", JSON.stringify({ results: [] }))).toBe(
      false
    );
  });
});
