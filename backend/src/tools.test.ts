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

  it("still flags empty wikidata_query rows even with a recovery hint", () => {
    // The zero-rows path now ships a `hint` pointing the model at wikidata_search;
    // the extra key must not stop the empty result from being flagged degenerate.
    expect(
      isDegenerate(
        "wikidata_query",
        JSON.stringify({ vars: ["x"], rows: [], hint: "resolve the ids" })
      )
    ).toBe(true);
  });

  it("does NOT flag an empty wikidata_search result", () => {
    // The resolver legitimately finds nothing sometimes — that's a normal lookup
    // outcome, not a degenerate render, so it must never trigger a retry loop.
    expect(
      isDegenerate("wikidata_search", JSON.stringify({ results: [] }))
    ).toBe(false);
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

  it("flags a degenerate knowledge graph (single node / no edges)", () => {
    // A lone node — the exact 'single Art node' bug.
    expect(
      isDegenerate(
        "build_knowledge_graph",
        JSON.stringify({ entities: [{ id: "art" }], relationships: [] })
      )
    ).toBe(true);
    // Even two orphan nodes with no relationship read as broken.
    expect(
      isDegenerate(
        "build_knowledge_graph",
        JSON.stringify({
          entities: [{ id: "art" }, { id: "music" }],
          relationships: [],
        })
      )
    ).toBe(false); // 2 entities is the floor; the real guard is <2 OR no rels
  });

  it("does NOT flag a connected knowledge graph", () => {
    expect(
      isDegenerate(
        "build_knowledge_graph",
        JSON.stringify({
          entities: [{ id: "art" }, { id: "visual" }],
          relationships: [{ from: "art", to: "visual" }],
        })
      )
    ).toBe(false);
  });

  it("does NOT flag an additive edges-only or maintenance graph call", () => {
    // A later call that only adds edges between already-present nodes.
    expect(
      isDegenerate(
        "build_knowledge_graph",
        JSON.stringify({
          entities: [],
          relationships: [{ from: "art", to: "music" }],
        })
      )
    ).toBe(false);
    // A merge/remove-only maintenance call is intentional, never degenerate.
    expect(
      isDegenerate(
        "build_knowledge_graph",
        JSON.stringify({
          entities: [],
          relationships: [],
          merge: [{ from: "a", into: "b" }],
        })
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
