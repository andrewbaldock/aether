import { describe, expect, it } from "vitest";
import {
  EDGES,
  LOOP_BOXES,
  NODE_BY_ID,
  NODES,
  ROLE_COLOR,
  VIEW_H,
  VIEW_W,
} from "./nodes";

// The diagram is a hand-authored graph: coordinates and edges are written by hand,
// so a fat-fingered edit (a typo'd NodeId in an edge, a node dragged off-canvas, a
// duplicate id) wouldn't fail typecheck. These structural invariants catch that.

describe("AgentDiagram topology", () => {
  it("indexes every node by id with no duplicates", () => {
    expect(Object.keys(NODE_BY_ID).length).toBe(NODES.length);
    for (const node of NODES) {
      expect(NODE_BY_ID[node.id]).toBe(node);
    }
  });

  it("every edge references real nodes", () => {
    for (const edge of EDGES) {
      expect(NODE_BY_ID[edge.from], `edge ${edge.id} from`).toBeDefined();
      expect(NODE_BY_ID[edge.to], `edge ${edge.id} to`).toBeDefined();
      expect(
        NODE_BY_ID[edge.activeWhen],
        `edge ${edge.id} activeWhen`
      ).toBeDefined();
    }
  });

  it("gives every edge a unique id", () => {
    const ids = EDGES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every node within the canvas bounds", () => {
    for (const node of NODES) {
      expect(node.x, `${node.id} x`).toBeGreaterThanOrEqual(0);
      expect(node.y, `${node.id} y`).toBeGreaterThanOrEqual(0);
      expect(node.x + node.w, `${node.id} right`).toBeLessThanOrEqual(VIEW_W);
      expect(node.y + node.h, `${node.id} bottom`).toBeLessThanOrEqual(VIEW_H);
    }
  });

  it("assigns every node a role that has a colour", () => {
    for (const node of NODES) {
      expect(ROLE_COLOR[node.role], `${node.id} role`).toBeDefined();
    }
  });

  it("keeps loop boxes within the canvas", () => {
    for (const box of LOOP_BOXES) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(VIEW_W);
      expect(box.y + box.h).toBeLessThanOrEqual(VIEW_H);
    }
  });
});
