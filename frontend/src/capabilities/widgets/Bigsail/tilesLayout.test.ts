import { describe, expect, it } from "vitest";
import type { Card, CardCapability } from "./cards";
import {
  autoLayout,
  GRID_COLUMNS,
  type PlacedCard,
  placeCards,
} from "./tilesLayout";

// A card of a given capability type. The template places by capabilityType, so the
// spec/sizeHint don't affect geometry — they're just filled to satisfy the type.
const card = (id: string, type: CardCapability = "chart"): Card => ({
  id,
  capabilityType: type,
  spec: { type: "line", data: [], xKey: "x", series: [{ key: "y" }] },
  sizeHint: { w: 360, h: 320 },
});

// Both layout engines always resolve x/y for every placed card; this test suite
// leans on that guarantee to assert on them without re-checking it everywhere.
type Placed = PlacedCard & { x: number; y: number };

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("expected a defined value");
  return v;
}

const HALF = GRID_COLUMNS / 2;
const find = (placed: ReturnType<typeof autoLayout>, id: string): Placed => {
  const p = placed.find((c) => c.card.id === id);
  return must(p) as Placed;
};

// ── SYSTEM 1: the fixed role-based template (autoLayout). Runs only on the initial
//    build of a conversation's canvas. ────────────────────────────────────────────
describe("autoLayout — fixed role-based template (System 1)", () => {
  it("returns nothing for no cards", () => {
    expect(autoLayout([], false)).toEqual([]);
  });

  it("promotes a lone KG to full width (no half-gap beside it)", () => {
    // No timeline partner → the KG fills the whole top row rather than sitting
    // half-width with a dead gap on the right.
    const placed = autoLayout([card("kg", "knowledge-graph")], false);
    const kg = find(placed, "kg");
    expect(kg.x).toBe(0);
    expect(kg.w).toBe(GRID_COLUMNS);
    expect(kg.y).toBe(0);
  });

  it("promotes a lone Timeline to full width at x=0", () => {
    // No KG partner → the timeline fills the top row from the left edge (not its
    // usual right-half slot), so there's no empty half on either side.
    const placed = autoLayout([card("t", "timeline")], false);
    const t = find(placed, "t");
    expect(t.x).toBe(0);
    expect(t.w).toBe(GRID_COLUMNS);
    expect(t.y).toBe(0);
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
    expect(find(placed, "c2").y).toBeGreaterThan(find(placed, "c1").y);
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
    const yOf = (id: string) => find(placed, id).y;
    expect(yOf("kg")).toBe(yOf("t")); // same top row
    expect(yOf("t")).toBeLessThan(yOf("tbl"));
    expect(yOf("tbl")).toBeLessThan(yOf("c"));
    expect(yOf("c")).toBeLessThan(yOf("img"));
  });

  it("collapses a missing capability's slot (no gap, deterministic)", () => {
    // No timeline → KG anchors the top row at full width; table follows directly.
    const placed = autoLayout(
      [card("kg", "knowledge-graph"), card("tbl", "table")],
      false
    );
    const kg = find(placed, "kg");
    const tbl = find(placed, "tbl");
    expect(kg.w).toBe(GRID_COLUMNS); // promoted — no half-gap
    expect(tbl.y).toBe(kg.y + kg.h);
  });

  it("stacks extra cards of a type full-width below the template", () => {
    const placed = autoLayout(
      [card("tbl1", "table"), card("tbl2", "table"), card("tbl3", "table")],
      false
    );
    // First table in its slot; extras full-width, stacked, below.
    expect(placed.every((p) => p.w === GRID_COLUMNS)).toBe(true);
    const ys = placed.map((p) => must(p.y)).sort((a, b) => a - b);
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
    const topRowBottom = find(placed, "t").y + find(placed, "t").h;
    for (const id of ["c1", "c2", "c3"]) {
      const c = find(placed, id);
      expect(c.w).toBe(GRID_COLUMNS);
      expect(c.y).toBeGreaterThanOrEqual(topRowBottom);
    }
    // Distinct rows, stacked in order.
    expect(find(placed, "c2").y).toBeGreaterThan(find(placed, "c1").y);
    expect(find(placed, "c3").y).toBeGreaterThan(find(placed, "c2").y);
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
      expect(must(p.x) + p.w).toBeLessThanOrEqual(GRID_COLUMNS);
      expect(p.w).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    const cards = [
      card("t", "timeline"),
      card("c", "chart"),
      card("kg", "knowledge-graph"),
    ];
    expect(autoLayout(cards, false)).toEqual(autoLayout(cards, false));
  });
});

describe("autoLayout — stacked (skinny viewport)", () => {
  it("makes every card full-width and stacks them one per row", () => {
    const cards = [
      card("a", "chart"),
      card("b", "table"),
      card("c", "timeline"),
    ];
    const placed = autoLayout(cards, true);
    expect(placed.every((p) => p.w === GRID_COLUMNS && p.x === 0)).toBe(true);
    const ys = placed.map((p) => must(p.y));
    expect(new Set(ys).size).toBe(placed.length);
    for (let i = 1; i < ys.length; i++) {
      expect(must(ys[i])).toBeGreaterThan(must(ys[i - 1]));
    }
  });
});

// ── placeCards: the HANDOFF between the two systems. The single signal is "does the
//    saved layout hold a real (non-skeleton) entry?" — empty → System 1 (build),
//    non-empty → System 2 (honor + append). ───────────────────────────────────────
describe("placeCards — System 1 (no saved layout: build it)", () => {
  it("runs the template when nothing is saved (undefined)", () => {
    const cards = [card("kg", "knowledge-graph"), card("c", "chart")];
    const placed = placeCards(cards, undefined, false);
    // Every card gets explicit template geometry (autoPlace).
    expect(placed.every((p) => p.autoPlace && p.x !== undefined)).toBe(true);
    // KG promoted to full width (lone), chart full-width below it.
    expect(find(placed, "kg").w).toBe(GRID_COLUMNS);
    expect(find(placed, "c").w).toBe(GRID_COLUMNS);
  });

  it("runs the template when the saved layout is empty", () => {
    const cards = [card("kg", "knowledge-graph"), card("t", "timeline")];
    const placed = placeCards(cards, [], false);
    // Fresh build → KG+Timeline pair to the half/half top row.
    expect(find(placed, "kg").w).toBe(HALF);
    expect(find(placed, "t").w).toBe(HALF);
    expect(find(placed, "t").x).toBe(HALF);
  });

  it("treats a saved layout of ONLY skeleton entries as a fresh build", () => {
    // Skeletons are never persisted, but guard anyway: a stray skeleton:* slot must
    // not flip the canvas into System 2 and strand the real cards untemplated.
    const cards = [card("c", "chart")];
    const saved = [{ id: "skeleton:0", x: 0, y: 0, w: 24, h: 10 }];
    const placed = placeCards(cards, saved, false);
    expect(find(placed, "c").autoPlace).toBe(true); // template-placed
  });
});

describe("placeCards — System 2 (saved layout present: honor + append)", () => {
  it("honors a saved card's slot VERBATIM (the template does not run)", () => {
    // The resize-to-bottom guarantee: a lone saved KG saved at half width stays half
    // width — System 1's lone-promotion does NOT fire, because the template never runs
    // once a layout exists.
    const kg = card("knowledge-graph:g", "knowledge-graph");
    kg.id = "knowledge-graph:g";
    const saved = [{ id: "knowledge-graph:g", x: HALF, y: 4, w: HALF, h: 10 }];
    const placed = placeCards([kg], saved, false);
    const p = find(placed, "knowledge-graph:g");
    expect(p.autoPlace).toBe(false); // honored as a fixed position
    expect(p.x).toBe(HALF);
    expect(p.y).toBe(4);
    expect(p.w).toBe(HALF); // NOT promoted to full
  });

  it("does NOT re-pair KG+Timeline that the user arranged apart", () => {
    // While in System 2, two cards the user split onto separate rows stay exactly as
    // saved — the template's top-row pairing must not fire.
    const kg = card("knowledge-graph:g", "knowledge-graph");
    kg.id = "knowledge-graph:g";
    const t = card("timeline:t", "timeline");
    t.id = "timeline:t";
    const saved = [
      { id: "knowledge-graph:g", x: 0, y: 0, w: HALF, h: 10 },
      { id: "timeline:t", x: 0, y: 12, w: HALF, h: 10 },
    ];
    const placed = placeCards([kg, t], saved, false);
    expect(find(placed, "knowledge-graph:g").y).toBe(0);
    expect(find(placed, "timeline:t").y).toBe(12); // stays on its own line
    expect(find(placed, "timeline:t").w).toBe(HALF);
  });

  it("clamps a saved width/x to the grid so a stale entry never overflows", () => {
    const t = card("table:x", "table");
    t.id = "table:x";
    const saved = [{ id: "table:x", x: 20, y: 0, w: 40, h: 5 }];
    const placed = placeCards([t], saved, false);
    const p = find(placed, "table:x");
    expect(p.w).toBe(GRID_COLUMNS); // clamped width
    expect(p.x).toBe(0); // x clamped into [0, GRID_COLUMNS - w]
  });

  it("appends a NEW card below all saved cards (gravity floats it up live)", () => {
    // A new turn's card (no saved slot) is appended below the lowest saved card so
    // GridStack float:false can float it up into the first free space. Its y must be at
    // least the max saved y+h. The template is NOT invoked on the known card.
    const existing = card("table:x", "table");
    existing.id = "table:x";
    const fresh = card("chart:new", "chart");
    fresh.id = "chart:new";
    const saved = [{ id: "table:x", x: 0, y: 0, w: 24, h: 10 }];
    const placed = placeCards([existing, fresh], saved, false);
    const pNew = find(placed, "chart:new");
    const pOld = find(placed, "table:x");
    expect(pOld.autoPlace).toBe(false); // honored verbatim
    expect(pNew.autoPlace).toBe(true); // appended (a starting hint, not a pin)
    expect(pNew.y).toBeGreaterThanOrEqual(pOld.y + pOld.h); // below everything saved
    expect(pNew.x).toBe(0);
    expect(pNew.w).toBe(GRID_COLUMNS); // appended full-width
  });

  it("appends multiple new cards stacked, each below the last", () => {
    const existing = card("table:x", "table");
    existing.id = "table:x";
    const a = card("chart:a", "chart");
    a.id = "chart:a";
    const b = card("chart:b", "chart");
    b.id = "chart:b";
    const saved = [{ id: "table:x", x: 0, y: 0, w: 24, h: 10 }];
    const placed = placeCards([existing, a, b], saved, false);
    expect(find(placed, "chart:b").y).toBeGreaterThan(
      find(placed, "chart:a").y
    );
  });
});

describe("placeCards — stacked (skinny) short-circuit", () => {
  it("stacks full-width and ignores the saved layout when skinny", () => {
    const saved = [{ id: "chart:a", x: 12, y: 0, w: 12, h: 5 }];
    const a = card("a");
    a.id = "chart:a";
    const b = card("b");
    b.id = "chart:b";
    const placed = placeCards([a, b], saved, true);
    expect(placed.every((p) => p.w === GRID_COLUMNS && p.x === 0)).toBe(true);
  });
});
