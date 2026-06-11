import { describe, expect, it } from "vitest";
import type { Card } from "./cards";
import { layout } from "./layout";
import type { CompositionPlan } from "./plan";

const card = (id: string, w = 360, h = 300): Card => ({
  id,
  capabilityType: "chart",
  spec: { type: "line", data: [], xKey: "x", series: [{ key: "y" }] },
  sizeHint: { w, h },
});

const tableCard = (id: string): Card => ({
  ...card(id),
  capabilityType: "table",
  spec: { columns: [], rows: [] },
});

const vp = { width: 1200, height: 800 };

describe("layout — masonry", () => {
  it("returns no cards/edges for empty input", () => {
    expect(layout([], "masonry", vp)).toEqual({ cards: [], edges: [] });
  });

  it("positions every card and emits no edges", () => {
    const cards = [card("a"), card("b"), card("c")];
    const res = layout(cards, "masonry", vp);
    expect(res.cards).toHaveLength(3);
    expect(res.edges).toEqual([]);
    for (const c of res.cards) {
      expect(typeof c.x).toBe("number");
      expect(typeof c.y).toBe("number");
    }
  });

  it("is deterministic — identical input yields identical positions", () => {
    const cards = [card("a"), card("b"), card("c"), card("d")];
    expect(layout(cards, "masonry", vp)).toEqual(layout(cards, "masonry", vp));
  });

  it("packs into the shortest column (no overlap within a column)", () => {
    // Narrow viewport → 1 column → cards must stack with increasing y.
    const narrow = { width: 420, height: 800 };
    const res = layout([card("a"), card("b")], "masonry", narrow);
    const [a, b] = res.cards;
    expect(b!.y).toBeGreaterThan(a!.y);
    expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.sizeHint.h);
  });
});

describe("layout — flowchart", () => {
  it("v1 (no plan) lays cards out with no edges", () => {
    const res = layout([card("a"), card("b")], "flowchart", vp);
    expect(res.cards).toHaveLength(2);
    expect(res.edges).toEqual([]);
  });

  it("orders cards by the plan's intents", () => {
    const cards = [tableCard("t"), card("c")];
    const plan: CompositionPlan = {
      intents: [{ capability: "chart" }, { capability: "table" }],
      relationships: [],
    };
    const res = layout(cards, "flowchart", vp, plan);
    // Chart intent comes first → chart card placed at the first slot (x === PAD).
    expect(res.cards[0]?.capabilityType).toBe("chart");
  });

  it("turns plan relationships into card-id edges", () => {
    const cards = [card("c"), tableCard("t")];
    const plan: CompositionPlan = {
      intents: [{ capability: "chart" }, { capability: "table" }],
      relationships: [{ from: 0, to: 1, label: "drives" }],
    };
    const res = layout(cards, "flowchart", vp, plan);
    expect(res.edges).toEqual([{ from: "c", to: "t", label: "drives" }]);
  });

  it("skips relationships whose intent produced no card", () => {
    const cards = [card("c")];
    const plan: CompositionPlan = {
      intents: [{ capability: "chart" }, { capability: "table" }],
      relationships: [{ from: 0, to: 1 }],
    };
    const res = layout(cards, "flowchart", vp, plan);
    expect(res.edges).toEqual([]);
  });
});
