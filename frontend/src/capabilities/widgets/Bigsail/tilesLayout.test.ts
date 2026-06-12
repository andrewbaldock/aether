import { describe, expect, it } from "vitest";
import type { Card, CardCapability } from "./cards";
import { autoLayout, GRID_COLUMNS, placeCards } from "./tilesLayout";

// A card of a given capability type. The template places by capabilityType, so the
// spec/sizeHint don't affect geometry — they're just filled to satisfy the type.
const card = (id: string, type: CardCapability = "chart"): Card => ({
  id,
  capabilityType: type,
  spec: { type: "line", data: [], xKey: "x", series: [{ key: "y" }] },
  sizeHint: { w: 360, h: 320 },
});

const HALF = GRID_COLUMNS / 2;
const find = (placed: ReturnType<typeof autoLayout>, id: string) =>
  placed.find((p) => p.card.id === id)!;

describe("autoLayout — fixed role-based template", () => {
  it("returns nothing for no cards", () => {
    expect(autoLayout([], false)).toEqual([]);
  });

  it("places KG half-width in the top-left", () => {
    const placed = autoLayout([card("kg", "knowledge-graph")], false);
    const kg = find(placed, "kg");
    expect(kg.x).toBe(0);
    expect(kg.w).toBe(HALF);
    expect(kg.y).toBe(0);
  });

  it("puts KG and Timeline side by side in the top row", () => {
    const placed = autoLayout(
      [card("kg", "knowledge-graph"), card("t", "timeline")],
      false
    );
    const kg = find(placed, "kg");
    const t = find(placed, "t");
    // KG left half, Timeline right half, same row.
    expect(kg.x).toBe(0);
    expect(kg.w).toBe(HALF);
    expect(t.x).toBe(HALF);
    expect(t.w).toBe(HALF);
    expect(t.y).toBe(kg.y);
  });

  it("gives charts the FULL width (never squeezed into a half)", () => {
    const placed = autoLayout(
      [card("t", "timeline"), card("c1", "chart"), card("c2", "chart")],
      false
    );
    expect(find(placed, "c1").w).toBe(GRID_COLUMNS);
    expect(find(placed, "c2").w).toBe(GRID_COLUMNS);
    // Charts stack vertically, each on its own row.
    expect(find(placed, "c2").y!).toBeGreaterThan(find(placed, "c1").y!);
  });

  it("orders the bands KG/timeline → table → chart → images, top to bottom", () => {
    const placed = autoLayout(
      [
        card("img", "images"),
        card("tbl", "table"),
        card("c", "chart"),
        card("t", "timeline"),
        card("kg", "knowledge-graph"),
      ],
      false
    );
    const yOf = (id: string) => find(placed, id).y!;
    expect(yOf("kg")).toBe(yOf("t")); // same top row
    expect(yOf("t")).toBeLessThan(yOf("tbl"));
    expect(yOf("tbl")).toBeLessThan(yOf("c"));
    expect(yOf("c")).toBeLessThan(yOf("img"));
  });

  it("collapses a missing capability's slot (no gap, deterministic)", () => {
    // No timeline → KG still anchors the top row; table follows it directly.
    const placed = autoLayout(
      [card("kg", "knowledge-graph"), card("tbl", "table")],
      false
    );
    const kg = find(placed, "kg");
    const tbl = find(placed, "tbl");
    expect(tbl.y).toBe(kg.y! + kg.h);
  });

  it("stacks extra cards of a type full-width below the template", () => {
    const placed = autoLayout(
      [card("tbl1", "table"), card("tbl2", "table"), card("tbl3", "table")],
      false
    );
    // First table in its slot; extras full-width, stacked, below.
    expect(placed.every((p) => p.w === GRID_COLUMNS)).toBe(true);
    const ys = placed.map((p) => p.y!).sort((a, b) => a - b);
    expect(new Set(ys).size).toBe(3); // three distinct rows
  });

  it("stacks every chart full-width below the top row", () => {
    const placed = autoLayout(
      [
        card("t", "timeline"),
        card("c1", "chart"),
        card("c2", "chart"),
        card("c3", "chart"),
      ],
      false
    );
    const topRowBottom = find(placed, "t").y! + find(placed, "t").h;
    for (const id of ["c1", "c2", "c3"]) {
      const c = find(placed, id);
      expect(c.w).toBe(GRID_COLUMNS);
      expect(c.y!).toBeGreaterThanOrEqual(topRowBottom);
    }
    // Distinct rows, stacked in order.
    expect(find(placed, "c2").y!).toBeGreaterThan(find(placed, "c1").y!);
    expect(find(placed, "c3").y!).toBeGreaterThan(find(placed, "c2").y!);
  });

  it("never overflows the grid width and places every card once", () => {
    const cards = [
      card("kg", "knowledge-graph"),
      card("t", "timeline"),
      card("c1", "chart"),
      card("c2", "chart"),
      card("tbl", "table"),
      card("img", "images"),
    ];
    const placed = autoLayout(cards, false);
    expect(placed).toHaveLength(cards.length);
    for (const p of placed) {
      expect(p.x! + p.w).toBeLessThanOrEqual(GRID_COLUMNS);
      expect(p.w).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    const cards = [card("t", "timeline"), card("c", "chart"), card("kg", "knowledge-graph")];
    expect(autoLayout(cards, false)).toEqual(autoLayout(cards, false));
  });
});

describe("autoLayout — stacked (skinny viewport)", () => {
  it("makes every card full-width and stacks them one per row", () => {
    const cards = [card("a", "chart"), card("b", "table"), card("c", "timeline")];
    const placed = autoLayout(cards, true);
    expect(placed.every((p) => p.w === GRID_COLUMNS && p.x === 0)).toBe(true);
    const ys = placed.map((p) => p.y!);
    expect(new Set(ys).size).toBe(placed.length);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
    }
  });
});

describe("placeCards", () => {
  it("uses the template when nothing is saved", () => {
    const cards = [card("kg", "knowledge-graph"), card("c", "chart")];
    const placed = placeCards(cards, undefined, false);
    expect(placed.every((p) => p.autoPlace && p.x !== undefined)).toBe(true);
  });

  it("respects saved positions and auto-places only new cards", () => {
    const saved = [{ id: "chart:a", x: 2, y: 3, w: 12, h: 5 }];
    const cards = [card("a"), card("b")];
    cards[0]!.id = "chart:a";
    cards[1]!.id = "chart:b";
    const placed = placeCards(cards, saved, false);
    const a = placed.find((p) => p.card.id === "chart:a")!;
    const b = placed.find((p) => p.card.id === "chart:b")!;
    expect(a.autoPlace).toBe(false);
    expect(a.x).toBe(2);
    expect(b.autoPlace).toBe(true);
  });

  it("clamps a saved width to the grid column count", () => {
    const saved = [{ id: "chart:a", x: 0, y: 0, w: 40, h: 5 }];
    const cards = [card("a")];
    cards[0]!.id = "chart:a";
    const placed = placeCards(cards, saved, false);
    expect(placed[0]!.w).toBe(GRID_COLUMNS);
  });

  it("stacks full-width and ignores the saved layout when skinny", () => {
    const saved = [{ id: "chart:a", x: 12, y: 0, w: 12, h: 5 }];
    const cards = [card("a"), card("b")];
    cards[0]!.id = "chart:a";
    cards[1]!.id = "chart:b";
    const placed = placeCards(cards, saved, true);
    expect(placed.every((p) => p.w === GRID_COLUMNS && p.x === 0)).toBe(true);
  });
});
