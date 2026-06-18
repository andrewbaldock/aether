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
    // No timeline → KG anchors the top row at full width; table follows directly.
    const placed = autoLayout(
      [card("kg", "knowledge-graph"), card("tbl", "table")],
      false
    );
    const kg = find(placed, "kg");
    const tbl = find(placed, "tbl");
    expect(kg.w).toBe(GRID_COLUMNS); // promoted — no half-gap
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

  it("pins user-moved cards and templates the rest", () => {
    const saved = [{ id: "chart:a", x: 2, y: 3, w: 12, h: 5, userMoved: true }];
    const cards = [card("a"), card("b")];
    cards[0]!.id = "chart:a";
    cards[1]!.id = "chart:b";
    const placed = placeCards(cards, saved, false);
    const a = placed.find((p) => p.card.id === "chart:a")!;
    const b = placed.find((p) => p.card.id === "chart:b")!;
    // The user-moved card is pinned to its saved spot…
    expect(a.autoPlace).toBe(false);
    expect(a.x).toBe(2);
    // …everything else is template-arranged (auto), so it re-packs on each change.
    expect(b.autoPlace).toBe(true);
  });

  it("re-templates a saved card that was NOT user-moved", () => {
    // The crux of the KG/timeline fix: a position saved by the auto-layout (no
    // userMoved flag — e.g. the KG persisted mid async-load) must NOT pin. It's
    // re-run through the template so a late card re-pairs instead of sticking.
    const saved = [{ id: "chart:a", x: 2, y: 3, w: 12, h: 5 }];
    const cards = [card("a")];
    cards[0]!.id = "chart:a";
    const placed = placeCards(cards, saved, false);
    expect(placed[0]!.autoPlace).toBe(true);
  });

  it("clamps a user-moved saved width to the grid column count", () => {
    const saved = [{ id: "chart:a", x: 0, y: 0, w: 40, h: 5, userMoved: true }];
    const cards = [card("a")];
    cards[0]!.id = "chart:a";
    const placed = placeCards(cards, saved, false);
    expect(placed[0]!.w).toBe(GRID_COLUMNS);
  });

  it("re-pairs KG+Timeline even when a stale saved layout had them apart", () => {
    // The reported bug: a layout saved while the KG was mid async-load (timeline
    // full-width, KG dumped below) must NOT survive as a pin. With neither card
    // user-moved, placeCards re-templates → KG (x:0) + Timeline (x:HALF) top row.
    const saved = [
      { id: "timeline:t", x: 0, y: 0, w: GRID_COLUMNS, h: 10 },
      { id: "knowledge-graph:graph", x: 0, y: 10, w: GRID_COLUMNS, h: 10 },
    ];
    const kg = card("k", "knowledge-graph");
    kg.id = "knowledge-graph:graph";
    const t = card("t", "timeline");
    t.id = "timeline:t";
    const placed = placeCards([kg, t], saved, false);
    const pk = find(placed, "knowledge-graph:graph");
    const pt = find(placed, "timeline:t");
    expect(pk.y).toBe(0);
    expect(pt.y).toBe(0);
    expect(pk.x).toBe(0);
    expect(pt.x).toBe(HALF);
    expect(pk.w).toBe(HALF);
    expect(pt.w).toBe(HALF);
  });

  it("keeps a half-width slot for the auto partner when its top-row mate is pinned", () => {
    // The swap bug: drag the KG onto the Timeline to swap them. Only the dragged
    // card (KG) becomes userMoved → pinned; the Timeline stays an auto card. The
    // auto-layout, run over the auto cards alone, no longer sees a KG — so the lone-
    // survivor promotion would balloon the Timeline to full width at x:0 and dump
    // the KG below. With the pinned KG counted as occupying the top row, the auto
    // Timeline must stay HALF width in the right slot, so the two simply swap.
    const saved = [
      { id: "knowledge-graph:graph", x: HALF, y: 0, w: HALF, h: 10, userMoved: true },
    ];
    const kg = card("k", "knowledge-graph");
    kg.id = "knowledge-graph:graph";
    const t = card("t", "timeline");
    t.id = "timeline:t";
    const placed = placeCards([kg, t], saved, false);
    const pt = find(placed, "timeline:t");
    const pk = find(placed, "knowledge-graph:graph");
    // Timeline stays half-width and dodges to the LEFT slot the pinned KG vacated,
    // sharing the pin's row — i.e. the two swap places rather than stacking.
    expect(pt.w).toBe(HALF);
    expect(pt.x).toBe(0);
    expect(pt.y).toBe(pk.y);
    // The pinned KG keeps its dropped geometry verbatim (right slot).
    expect(pk.x).toBe(HALF);
    expect(pk.w).toBe(HALF);
  });

  it("dodges the auto KG to the right when a pinned timeline holds the left slot", () => {
    // The mirror swap: drag the Timeline onto the KG. Timeline pinned left; the
    // auto KG must take the RIGHT slot (half-width) on the pin's row, not balloon.
    const saved = [
      { id: "timeline:t", x: 0, y: 0, w: HALF, h: 10, userMoved: true },
    ];
    const t = card("t", "timeline");
    t.id = "timeline:t";
    const kg = card("k", "knowledge-graph");
    kg.id = "knowledge-graph:graph";
    const placed = placeCards([kg, t], saved, false);
    const pk = find(placed, "knowledge-graph:graph");
    expect(pk.w).toBe(HALF);
    expect(pk.x).toBe(HALF);
  });

  it("drags a half-width card to its OWN line: the partner stays half-width in the top row", () => {
    // The bug: drag the Timeline OUT of the top row to its own line (y:5), not onto
    // the KG to swap. Only the Timeline is userMoved → pinned at y:5. The auto KG must
    // NOT balloon to full width, and must NOT get yanked down to the pin's row — it
    // keeps its half-width left slot at y:0. (Pre-fix it ballooned to full + followed
    // the pin's y, replacing the user's intended single-on-its-own-line arrangement.)
    const saved = [
      { id: "timeline:t", x: 0, y: 5, w: HALF, h: 10, userMoved: true },
    ];
    const t = card("t", "timeline");
    t.id = "timeline:t";
    const kg = card("k", "knowledge-graph");
    kg.id = "knowledge-graph:graph";
    const placed = placeCards([kg, t], saved, false);
    const pk = find(placed, "knowledge-graph:graph");
    const pt = find(placed, "timeline:t");
    // The pinned Timeline stays exactly where the user dropped it (its own line).
    expect(pt.y).toBe(5);
    expect(pt.x).toBe(0);
    // The auto KG stays half-width in the top row's left slot — NOT full width, NOT y:5.
    expect(pk.w).toBe(HALF);
    expect(pk.x).toBe(0);
    expect(pk.y).toBe(0);
  });

  it("dragging the KG to its own line leaves the Timeline half-width in the top row", () => {
    // Mirror of the above: pin the KG on its own line; the auto Timeline must stay
    // half-width at y:0 (right slot by default), not balloon to full width.
    const saved = [
      { id: "knowledge-graph:graph", x: 0, y: 8, w: HALF, h: 10, userMoved: true },
    ];
    const kg = card("k", "knowledge-graph");
    kg.id = "knowledge-graph:graph";
    const t = card("t", "timeline");
    t.id = "timeline:t";
    const placed = placeCards([kg, t], saved, false);
    const pt = find(placed, "timeline:t");
    expect(pt.w).toBe(HALF);
    expect(pt.y).toBe(0);
  });

  it("SETTLED (reading): a resized auto card is honored verbatim, never re-templated", () => {
    // The resize-to-bottom bug. A settled conversation (not streaming): the user resizes
    // a table from full (24) to 8 cols. Even WITHOUT a userMoved flag, while reading the
    // saved position is canonical — the template must not run and shove it to the bottom.
    const t = card("table:x", "table");
    t.id = "table:x";
    const saved = [{ id: "table:x", x: 0, y: 0, w: 8, h: 10 }]; // note: no userMoved
    const placed = placeCards([t], saved, false, true); // settled = true (reading)
    const p = find(placed, "table:x");
    expect(p.w).toBe(8); // kept the user's width
    expect(p.x).toBe(0);
    expect(p.y).toBe(0); // did NOT drop to the bottom
    expect(p.autoPlace).toBe(false); // honored as a fixed position, not template-placed
  });

  it("SETTLED: every saved card is honored verbatim (no KG/Timeline re-pairing while reading)", () => {
    // While reading, the template's top-row pairing must NOT fire. Two half-width cards
    // the user arranged stay exactly as saved, even though the template would re-pair them.
    const kg = card("knowledge-graph:g", "knowledge-graph");
    kg.id = "knowledge-graph:g";
    const t = card("timeline:t", "timeline");
    t.id = "timeline:t";
    // user put the timeline on its own line below the KG
    const saved = [
      { id: "knowledge-graph:g", x: 0, y: 0, w: HALF, h: 10 },
      { id: "timeline:t", x: 0, y: 12, w: HALF, h: 10 },
    ];
    const placed = placeCards([kg, t], saved, false, true);
    expect(find(placed, "timeline:t").y).toBe(12); // stays on its own line
    expect(find(placed, "timeline:t").w).toBe(HALF);
    expect(find(placed, "knowledge-graph:g").y).toBe(0);
  });

  it("a dropped position lives forever: userMoved is pinned on RESTORE (streaming path) too", () => {
    // "Once a user drops, that's it — it lives there." When the conversation later
    // reopens, placement runs in the RESTORE path (settled=false, template active for
    // auto cards). A userMoved card must STILL be pinned verbatim there, not re-templated.
    const t = card("table:x", "table");
    t.id = "table:x";
    const saved = [{ id: "table:x", x: 0, y: 0, w: 8, h: 10, userMoved: true }];
    const placed = placeCards([t], saved, false, false); // settled=false → restoring
    const p = find(placed, "table:x");
    expect(p.w).toBe(8);
    expect(p.autoPlace).toBe(false); // pinned, not template-placed
  });

  it("SETTLED: a card with NO saved entry still gets a template slot (unhide/duplicate while reading)", () => {
    // The one thing the template still does while reading: place a card that has no saved
    // position at all (e.g. just unhidden/duplicated), so it isn't left at 0,0 with no geometry.
    const existing = card("table:x", "table");
    existing.id = "table:x";
    const fresh = card("chart:new", "chart");
    fresh.id = "chart:new";
    const saved = [{ id: "table:x", x: 0, y: 0, w: 24, h: 10 }];
    const placed = placeCards([existing, fresh], saved, false, true);
    const pNew = find(placed, "chart:new");
    expect(pNew.autoPlace).toBe(true); // template-placed (it had no saved slot)
    expect(pNew.w).toBe(GRID_COLUMNS); // charts go full-width in the template
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
