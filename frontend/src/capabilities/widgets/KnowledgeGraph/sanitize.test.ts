import { describe, expect, it } from "vitest";
import { dedupeNodes, endpointId, filterDanglingLinks } from "./sanitize";
import type { EntityType, GraphLink, GraphNode } from "./types";

function node(id: string, type: EntityType = "concept"): GraphNode {
  return { id, label: id, type };
}

describe("endpointId", () => {
  it("returns a string endpoint as-is", () => {
    expect(endpointId("a")).toBe("a");
  });

  it("normalises a node-ref endpoint to its id", () => {
    expect(endpointId(node("a"))).toBe("a");
  });
});

describe("dedupeNodes", () => {
  it("collapses nodes sharing an id, keeping the first", () => {
    const first = { ...node("gain-medium"), x: 1 };
    const dup = { ...node("gain-medium"), x: 999 };
    const out = dedupeNodes([first, dup, node("optical-cavity")]);
    expect(out.map((n) => n.id)).toEqual(["gain-medium", "optical-cavity"]);
    expect(out[0]).toBe(first); // first occurrence wins (position preserved)
  });

  it("leaves an already-unique list untouched", () => {
    const input = [node("a"), node("b"), node("c")];
    expect(dedupeNodes(input).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("filterDanglingLinks", () => {
  const live = new Set(["a", "b"]);

  it("keeps links whose endpoints are both live", () => {
    const links: GraphLink[] = [{ source: "a", target: "b" }];
    expect(filterDanglingLinks(links, live)).toHaveLength(1);
  });

  it("drops a link with a missing source or target", () => {
    const links: GraphLink[] = [
      { source: "a", target: "missing" },
      { source: "missing", target: "b" },
    ];
    expect(filterDanglingLinks(links, live)).toHaveLength(0);
  });

  it("resolves node-ref endpoints before checking liveness", () => {
    const links: GraphLink[] = [{ source: node("a"), target: node("b") }];
    expect(filterDanglingLinks(links, live)).toHaveLength(1);
  });

  it("drops a node-ref endpoint that isn't live", () => {
    const links: GraphLink[] = [{ source: node("a"), target: node("gone") }];
    expect(filterDanglingLinks(links, live)).toHaveLength(0);
  });
});
