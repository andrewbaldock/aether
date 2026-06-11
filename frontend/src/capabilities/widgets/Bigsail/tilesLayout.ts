// The Tiles canvas layout model. Cards are placed on a GridStack grid (column +
// row units, not pixels) so the arrangement is resolution-independent and
// serializes cleanly to the conversation's ui_state. This module is the pure
// glue: the grid config, the card→default-grid-size mapping, and the merge that
// preserves the user's saved arrangement while auto-placing new cards.

import type { Card, CardCapability } from "./cards";

// One placed card in grid units. Mirrors the backend UiState.tilesLayout shape
// and GridStack's serialized node ({id,x,y,w,h}).
export interface TilesLayoutItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Grid geometry. The column COUNT is derived from the live panel width (see
// columnsForWidth) so each column lands near TARGET_COL_PX — that keeps cards
// content-wide instead of clipping. Rows are a fixed pixel cellHeight; the margin
// is the always-present gap between cards.
export const GRID_CELL_HEIGHT = 28; // px per row unit (finer → tighter height fit)
export const GRID_MARGIN = 12; // px gap around every card (no-overlap guarantee)

// Target on-screen column width. The grid uses as many columns as fit at roughly
// this width, bounded by [MIN,MAX]_COLUMNS. ~90px gives fine-grained packing while
// keeping per-type minimum widths (below) to a sane number of columns.
const TARGET_COL_PX = 90;
const MIN_COLUMNS = 4;
const MAX_COLUMNS = 16;

// Pick a column count from the panel's pixel width so columns are ~TARGET_COL_PX
// wide regardless of how wide/narrow the capability panel is. Falls back to a
// reasonable default before the panel has measured.
export function columnsForWidth(panelPx: number): number {
  if (!panelPx || panelPx <= 0) return 12;
  return clamp(Math.round(panelPx / TARGET_COL_PX), MIN_COLUMNS, MAX_COLUMNS);
}

// Per-capability MINIMUM on-screen width (px). This is the real fix for clipping:
// a table needs room for its columns, a timeline for its date+label rows, the
// graph for its node labels. Cards are sized to the larger of this minimum and
// their content-derived sizeHint, then converted to grid columns.
const MIN_CARD_PX: Record<CardCapability, number> = {
  table: 460,
  chart: 380,
  timeline: 520,
  images: 320,
  "knowledge-graph": 460,
};

// Convert a card's pixel sizeHint into grid units for the CURRENT grid (column
// count + the pixel width each column occupies). Width honors the per-type minimum
// so content never clips; both are clamped to the grid. DEFAULTS only — a saved
// w/h (user resize) always wins downstream.
export function defaultGridSize(
  card: Card,
  columns: number,
  colWidthPx: number
): { w: number; h: number } {
  const wantPx = Math.max(card.sizeHint.w, MIN_CARD_PX[card.capabilityType]);
  // px → columns (round up so we never under-size below the minimum), clamped so
  // a card spans at most the full grid and at least ~3 columns.
  const wCols = clamp(
    Math.ceil(wantPx / Math.max(colWidthPx, 1)),
    Math.min(3, columns),
    columns
  );
  const h = clamp(Math.round(card.sizeHint.h / GRID_CELL_HEIGHT), 5, 30);
  return { w: wCols, h };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// A card with its resolved grid geometry. `autoPlace` is true when this card has
// no saved position — in the auto-layout path we compute explicit x/y too (so the
// row-fill arrangement is exact, not left to GridStack's packer); false when x/y
// come from the user's saved arrangement.
export interface PlacedCard {
  card: Card;
  x?: number;
  y?: number;
  w: number;
  h: number;
  autoPlace: boolean;
}

// Greedy row-packer that FILLS the panel horizontally and squares the bottom.
// Walks cards in order, packing each into the current row while its intrinsic
// width fits; when a card won't fit, the current row is finalised and a new one
// starts. Each finalised row is then:
//   • STRETCHED to span the full column count — leftover columns are distributed
//     across the row's cards so the right edge is flush (no ragged gap), and
//   • HEIGHT-EQUALISED — every card in the row gets the row's tallest height, so
//     each row band has a clean, square bottom edge and rows stack flush.
// The result is a gapless, full-width, bottom-squared grid. Deterministic given
// card order + column count → identical every render (and across devices).
export function autoLayout(
  cards: Card[],
  columns: number,
  colWidthPx: number
): PlacedCard[] {
  // Resolve each card's intrinsic grid size first, capped to the grid width.
  const sized = cards.map((card) => {
    const { w, h } = defaultGridSize(card, columns, colWidthPx);
    return { card, w: Math.min(w, columns), h };
  });

  const out: PlacedCard[] = [];
  let y = 0;
  let row: { card: Card; w: number; h: number }[] = [];
  let rowW = 0;

  const flush = () => {
    if (row.length === 0) return;
    // Distribute leftover columns across the row so it spans exactly `columns`.
    // Hand out one extra column at a time, widest-first (a stable widest→narrowest
    // queue), until none remain — proportional-ish fill without fractional columns.
    let leftover = columns - rowW;
    const widestFirst = [...row].sort((a, b) => b.w - a.w);
    let i = 0;
    while (leftover > 0 && widestFirst.length > 0) {
      const target = widestFirst[i % widestFirst.length];
      if (target) target.w += 1;
      leftover--;
      i++;
    }
    // Equalise heights so the row band squares off at the bottom. Cards keep their
    // original left-to-right order (row), not the widest-first fill order.
    const rowH = Math.max(...row.map((c) => c.h));
    let x = 0;
    for (const c of row) {
      out.push({ card: c.card, x, y, w: c.w, h: rowH, autoPlace: true });
      x += c.w;
    }
    y += rowH;
    row = [];
    rowW = 0;
  };

  for (const s of sized) {
    if (rowW + s.w > columns && row.length > 0) flush();
    row.push(s);
    rowW += s.w;
  }
  flush();
  return out;
}

// Merge the saved layout with the current card set:
//   • ANY saved positions present → respect the user's arrangement: saved cards
//     keep their x/y/w/h, and any card without a saved entry is auto-placed by
//     GridStack into a gap (autoPlace, no explicit x/y).
//   • NO saved positions → run the full-width, bottom-squared auto-layout so the
//     default fills the panel cleanly.
// Deterministic ordering keeps placement stable across renders.
export function placeCards(
  cards: Card[],
  saved: TilesLayoutItem[] | undefined,
  columns: number,
  colWidthPx: number
): PlacedCard[] {
  const savedById = new Map((saved ?? []).map((s) => [s.id, s]));
  const hasSaved = savedById.size > 0;

  // Fresh conversation (nothing saved): compute the filled auto-layout.
  if (!hasSaved) return autoLayout(cards, columns, colWidthPx);

  // Otherwise respect saved positions; auto-place only the genuinely-new cards.
  return cards.map((card) => {
    const s = savedById.get(card.id);
    if (s) {
      // Clamp a saved width to the current grid (column count can change with the
      // panel width) so a restored card never overflows the new grid.
      return {
        card,
        x: s.x,
        y: s.y,
        w: Math.min(s.w, columns),
        h: s.h,
        autoPlace: false,
      };
    }
    const size = defaultGridSize(card, columns, colWidthPx);
    return { card, w: size.w, h: size.h, autoPlace: true };
  });
}
