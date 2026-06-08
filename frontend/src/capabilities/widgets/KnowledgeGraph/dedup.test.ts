import { describe, expect, it } from "vitest";
import {
  canonicalKey,
  findDuplicateId,
  isFuzzyDuplicate,
  normalizeTokens,
  remapLinkEndpoints,
} from "./dedup";
import type { EntityType, GraphLink, GraphNode } from "./types";

function node(id: string, label: string, type: EntityType): GraphNode {
  return { id, label, type };
}

describe("normalizeTokens", () => {
  it("lowercases, splits on non-alphanumerics, drops stop words", () => {
    expect(normalizeTokens("The Louvre")).toEqual(["louvre"]);
    expect(normalizeTokens("United States of America")).toEqual([
      "united",
      "states",
      "america",
    ]);
  });

  it("strips accents and the Polish ł", () => {
    expect(normalizeTokens("Skłodowska")).toEqual(["sklodowska"]);
    expect(normalizeTokens("Café")).toEqual(["cafe"]);
  });
});

describe("canonicalKey", () => {
  it("is stable across slug drift via the label", () => {
    expect(
      canonicalKey({ id: "marie-curie", label: "Marie Curie", type: "person" })
    ).toBe(
      canonicalKey({
        id: "marie-sklodowska-curie",
        label: "Marie Curie",
        type: "person",
      })
    );
  });

  it("collapses article/casing/punctuation drift", () => {
    expect(canonicalKey(node("the-louvre", "The Louvre", "place"))).toBe(
      canonicalKey(node("louvre", "Louvre", "place"))
    );
  });

  it("namespaces by type so same name, different type doesn't collide", () => {
    expect(canonicalKey(node("mercury-person", "Mercury", "person"))).not.toBe(
      canonicalKey(node("mercury-planet", "Mercury", "place"))
    );
  });

  it("falls back to the id when label is empty", () => {
    expect(canonicalKey({ id: "some-id", label: "", type: "concept" })).toBe(
      "concept:some-id"
    );
  });
});

describe("isFuzzyDuplicate — should fold", () => {
  it("acronym expansion", () => {
    expect(isFuzzyDuplicate("US Army", "United States Army")).toBe(true);
    expect(isFuzzyDuplicate("USA", "United States of America")).toBe(true);
  });

  it("shorter name is a subset of the longer (extra content word folds)", () => {
    // Chosen behaviour: a subset folds even when the longer name adds a content
    // word. Cross-type collisions are prevented by findDuplicateId's type gate,
    // not here.
    expect(isFuzzyDuplicate("Louvre", "The Louvre Museum")).toBe(true);
    expect(isFuzzyDuplicate("Marie Curie", "Marie Skłodowska Curie")).toBe(true);
  });

  it("minor spelling drift", () => {
    expect(isFuzzyDuplicate("Tchaikovsky", "Tchaikovski")).toBe(true);
  });
});

describe("isFuzzyDuplicate — should NOT fold", () => {
  it("conflicting token (not a subset)", () => {
    expect(isFuzzyDuplicate("Marie Curie", "Pierre Curie")).toBe(false);
  });

  it("unrelated names", () => {
    expect(isFuzzyDuplicate("Paris", "London")).toBe(false);
  });

  it("empty token sets", () => {
    expect(isFuzzyDuplicate("", "anything")).toBe(false);
  });
});

describe("findDuplicateId", () => {
  const nodes: GraphNode[] = [
    node("marie-curie", "Marie Curie", "person"),
    node("us-army", "US Army", "org"),
    node("mercury-planet", "Mercury", "place"),
  ];
  const byCanonical = new Map(nodes.map((n) => [canonicalKey(n), n.id]));

  it("finds an exact canonical match (slug drift)", () => {
    expect(
      findDuplicateId(
        node("marie-sklodowska-curie", "Marie Skłodowska Curie", "person"),
        byCanonical,
        nodes
      )
    ).toBe("marie-curie");
  });

  it("finds a fuzzy match within the same type", () => {
    expect(
      findDuplicateId(
        node("united-states-army", "United States Army", "org"),
        byCanonical,
        nodes
      )
    ).toBe("us-army");
  });

  it("does not fold across types", () => {
    expect(
      findDuplicateId(
        node("mercury-god", "Mercury", "person"),
        byCanonical,
        nodes
      )
    ).toBeUndefined();
  });

  it("returns undefined for a genuinely new entity", () => {
    expect(
      findDuplicateId(
        node("isaac-newton", "Isaac Newton", "person"),
        byCanonical,
        nodes
      )
    ).toBeUndefined();
  });
});

describe("remapLinkEndpoints", () => {
  const remap = new Map([["old-id", "survivor"]]);

  it("rewrites string endpoints through the remap", () => {
    const link: GraphLink = { source: "old-id", target: "other" };
    expect(remapLinkEndpoints(link, remap)).toEqual({
      source: "survivor",
      target: "other",
    });
  });

  it("normalises node-ref endpoints to ids before remapping", () => {
    const a = node("old-id", "A", "person");
    const b = node("keep", "B", "person");
    expect(remapLinkEndpoints({ source: a, target: b }, remap)).toEqual({
      source: "survivor",
      target: "keep",
    });
  });

  it("leaves endpoints not in the remap untouched", () => {
    expect(remapLinkEndpoints({ source: "x", target: "y" }, remap)).toEqual({
      source: "x",
      target: "y",
    });
  });
});
