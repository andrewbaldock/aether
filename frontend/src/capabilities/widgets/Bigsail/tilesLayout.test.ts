import { describe, expect, it } from "vitest";
import type { Card, CardCapability } from "./cards";
import { autoLayout, columnsForWidth, placeCards } from "./tilesLayout";

// A card whose intrinsic sizeHint maps to a known-ish width. The exact column
// count depends on MIN_CARD_PX per type; tests assert invariants, not magic sizes.
const card = (id: string, type: CardCapability = "chart"): Card => ({
  id,
  capabilityType: type,
  spec: { type: "line", data: [], xKey: "x", series: [{ key: "y" }] },
  sizeHint: { w: 360, h: 320 },
});

const COLS = 12;
const COL_PX = 90;

// Helper: group placed cards into rows by their y coordinate.
function rows(placed: ReturnType<typeof autoLayout>) {
  const byY = new Map<number, typeof placed>();
  for (const p of placed) {
    const list = byY.get(p.y!) ?? [];
    list.push(p);
    byY.set(p.y!, list);
  }
  return [...byY.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

describe("autoLayout — fill width + square bottom", () => {
  it("returns nothing for no cards", () => {
    expect(autoLayout([], COLS, COL_PX)).toEqual([]);
  });

  it("every row spans the full column count (fills horizontally)", () => {
    const cards = [card("a"), card("b"), card("c"), card("d"), card("e")];
    const placed = autoLayout(cards, COLS, COL_PX);
    for (const r of rows(placed)) {
      const total = r.reduce((sum, c) => sum + c.w, 0);
      expect(total).toBe(COLS);
    }
  });

  it("cards never exceed the grid width", () => {
    const placed = autoLayout([card("a"), card("b")], COLS, COL_PX);
    for (const p of placed) {
      expect(p.x! + p.w).toBeLessThanOrEqual(COLS);
      expect(p.w).toBeGreaterThan(0);
    }
  });

  it("equalises card heights within a row (squares each band)", () => {
    // Force two cards into one row with different intrinsic heights.
    const tall = card("tall");
    tall.sizeHint = { w: 200, h: 800 };
    const short = card("short");
    short.sizeHint = { w: 200, h: 200 };
    const placed = autoLayout([tall, short], COLS, COL_PX);
    const firstRow = rows(placed)[0]!;
    if (firstRow.length === 2) {
      expect(firstRow[0]!.h).toBe(firstRow[1]!.h);
    }
  });

  it("stacks rows flush with no vertical gaps", () => {
    const cards = Array.from({ length: 6 }, (_, i) => card(`c${i}`));
    const placed = autoLayout(cards, COLS, COL_PX);
    const rs = rows(placed);
    // Each row's y equals the cumulative height of the rows above it.
    let expectedY = 0;
    for (const r of rs) {
      expect(r[0]!.y).toBe(expectedY);
      expectedY += r[0]!.h; // equalised, so any card's h is the row height
    }
  });

  it("is deterministic", () => {
    const cards = [card("a"), card("b"), card("c")];
    expect(autoLayout(cards, COLS, COL_PX)).toEqual(
      autoLayout(cards, COLS, COL_PX)
    );
  });

  it("does not overlap cards within a row", () => {
    const cards = [card("a"), card("b"), card("c"), card("d")];
    for (const r of rows(autoLayout(cards, COLS, COL_PX))) {
      const sorted = [...r].sort((a, b) => a.x! - b.x!);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.x!).toBeGreaterThanOrEqual(
          sorted[i - 1]!.x! + sorted[i - 1]!.w
        );
      }
    }
  });
});

describe("placeCards", () => {
  it("uses the filled auto-layout when nothing is saved", () => {
    const cards = [card("a"), card("b")];
    const placed = placeCards(cards, undefined, COLS, COL_PX);
    // All auto-placed with explicit coords, full-width rows.
    expect(placed.every((p) => p.autoPlace && p.x !== undefined)).toBe(true);
  });

  it("respects saved positions and auto-places only new cards", () => {
    const saved = [{ id: "chart:a", x: 2, y: 3, w: 4, h: 5 }];
    const cards = [card("a"), card("b")];
    // Card ids are `${type}:${id}` via toCards, but here we build cards directly
    // with id "a"/"b"; saved uses raw id to match card.id.
    cards[0]!.id = "chart:a";
    cards[1]!.id = "chart:b";
    const placed = placeCards(cards, saved, COLS, COL_PX);
    const a = placed.find((p) => p.card.id === "chart:a")!;
    const b = placed.find((p) => p.card.id === "chart:b")!;
    expect(a.autoPlace).toBe(false);
    expect(a.x).toBe(2);
    expect(b.autoPlace).toBe(true);
  });

  it("clamps a saved width to the current column count", () => {
    const saved = [{ id: "chart:a", x: 0, y: 0, w: 20, h: 5 }];
    const cards = [card("a")];
    cards[0]!.id = "chart:a";
    const placed = placeCards(cards, saved, COLS, COL_PX);
    expect(placed[0]!.w).toBe(COLS);
  });
});

describe("columnsForWidth", () => {
  it("scales columns with panel width, clamped", () => {
    expect(columnsForWidth(0)).toBe(12); // fallback
    expect(columnsForWidth(360)).toBe(4); // clamped to MIN
    expect(columnsForWidth(900)).toBeGreaterThanOrEqual(8);
    expect(columnsForWidth(5000)).toBeLessThanOrEqual(16); // clamped to MAX
  });
});
