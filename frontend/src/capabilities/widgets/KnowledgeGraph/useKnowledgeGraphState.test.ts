import { describe, expect, it } from "vitest";
import type { GraphNode } from "./types";
import { linkKey, parsePayload } from "./useKnowledgeGraphState";

describe("parsePayload", () => {
  it("parses a well-formed payload", () => {
    const raw = JSON.stringify({
      entities: [
        { id: "marie-curie", label: "Marie Curie", type: "person" },
        { id: "radioactivity", label: "Radioactivity", type: "concept" },
      ],
      relationships: [
        { from: "marie-curie", to: "radioactivity", label: "studied" },
      ],
    });
    const result = parsePayload(raw);
    expect(result).not.toBeNull();
    expect(result?.entities).toHaveLength(2);
    expect(result?.relationships).toHaveLength(1);
  });

  it("returns null for non-JSON", () => {
    expect(parsePayload("not json")).toBeNull();
  });

  it("returns null when entities/relationships aren't arrays", () => {
    expect(
      parsePayload(JSON.stringify({ entities: {}, relationships: [] }))
    ).toBeNull();
    expect(parsePayload(JSON.stringify({ entities: [] }))).toBeNull();
    expect(parsePayload(JSON.stringify(null))).toBeNull();
    expect(parsePayload(JSON.stringify("string"))).toBeNull();
  });

  it("filters out entities missing required fields or with a bad type", () => {
    const raw = JSON.stringify({
      entities: [
        { id: "ok", label: "Good", type: "person" },
        { id: "no-label", type: "person" }, // missing label
        { label: "no-id", type: "place" }, // missing id
        { id: "bad-type", label: "X", type: "alien" }, // invalid type
      ],
      relationships: [],
    });
    const result = parsePayload(raw);
    expect(result?.entities.map((e) => e.id)).toEqual(["ok"]);
  });

  it("filters out relationships missing from/to", () => {
    const raw = JSON.stringify({
      entities: [],
      relationships: [
        { from: "a", to: "b", label: "x" },
        { from: "a" }, // missing to
        { to: "b" }, // missing from
      ],
    });
    const result = parsePayload(raw);
    expect(result?.relationships).toHaveLength(1);
  });

  it("preserves an optional icon field on entities", () => {
    const raw = JSON.stringify({
      entities: [{ id: "x", label: "X", type: "concept", icon: "Atom" }],
      relationships: [],
    });
    const result = parsePayload(raw);
    expect(result?.entities[0]?.icon).toBe("Atom");
  });
});

describe("linkKey", () => {
  it("keys by string endpoints", () => {
    expect(linkKey({ source: "a", target: "b" })).toBe("a→b");
  });

  it("normalises node-ref endpoints to their ids", () => {
    const a: GraphNode = { id: "a", label: "A", type: "person" };
    const b: GraphNode = { id: "b", label: "B", type: "person" };
    expect(linkKey({ source: a, target: b })).toBe("a→b");
  });

  it("treats reversed direction as a distinct key", () => {
    expect(linkKey({ source: "a", target: "b" })).not.toBe(
      linkKey({ source: "b", target: "a" })
    );
  });
});
