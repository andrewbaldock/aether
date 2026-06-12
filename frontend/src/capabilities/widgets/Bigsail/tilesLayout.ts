// The Tiles canvas layout model. Cards are placed on a FIXED 24-column GridStack
// grid (column + row units, never pixels) so the arrangement is resolution-
// independent and serializes cleanly to the conversation's ui_state. Responsiveness
// is the column WIDTH (panelWidth / 24), not the column COUNT — everything grows and
// shrinks with the panel/window. The default arrangement is a fixed ROLE-BASED
// TEMPLATE (KG on top, Timeline + stacked Charts, then Table, then Images); the user
// can drag/resize freely from there and that arrangement persists. This module is the
// pure glue: the grid config, the template, and the merge that preserves the user's
// saved arrangement while auto-placing new cards.

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

// The grid is always this many columns wide. Cards are fractions of it.
export const GRID_COLUMNS = 24;

// Row geometry. Rows are a fixed pixel cellHeight; the margin is the always-present
// gap between cards.
export const GRID_CELL_HEIGHT = 28; // px per row unit (finer → tighter height fit)
export const GRID_MARGIN = 6; // px gap around every card (tight grid, no overlap)

// Below this panel width there isn't room for two half-width cards side by side,
// so every card collapses to full-width (24-col) stacked. Above it, cards reflow
// to their true fractional layout. Tuned by eye.
export const STACK_BREAKPOINT_PX = 560;

// ── Fixed template geometry (grid units) ────────────────────────────────────
// The canvas has ONE deterministic shape, mirroring the agreed layout:
//   KG | Timeline    top row, side by side (each half width, standard height)
//   Table           full width, standard height
//   Chart           full width, standard height — charts carry dense x-axis labels,
//                   so they always get the FULL 24 columns (never squeezed)
//   Images          full width, standard height
// The KG and Timeline anchor the top row together; Table, Chart(s), and Images then
// stack full-width beneath. Standard slot height clears the 55px floor comfortably
// and reads well. Widths are out of GRID_COLUMNS (24): full = 24, half = 12.
const FULL_W = GRID_COLUMNS; // 24
const HALF_W = GRID_COLUMNS / 2; // 12
const SLOT_H = 10; // ~280px standard card — readable, above the 55px floor

// Images is the bottom slot and its gallery height varies with the image count, so
// instead of the fixed SLOT_H it grows to fit its content (clamped). The card's
// sizeHint.h (px, from sizeHintFor in cards.ts) is the content-derived height; we
// convert px → grid rows and clamp so a small gallery stays compact and a big one
// can't run away.
const IMAGES_MIN_H = SLOT_H; // never shorter than a standard card
const IMAGES_MAX_H = 30; // ~1000px ceiling — past this the card scrolls

// Content height (px) → grid rows, accounting for the per-row margin. Inverse of
// GridStack's own row geometry (h rows ≈ h*cellHeight + (h-1)*margin px).
function pxToRows(px: number): number {
  return Math.ceil((px + GRID_MARGIN) / (GRID_CELL_HEIGHT + GRID_MARGIN));
}

// The Images slot's height in grid rows: content-fit, clamped to [min, max].
function imagesSlotH(card: Card): number {
  return clamp(pxToRows(card.sizeHint.h), IMAGES_MIN_H, IMAGES_MAX_H);
}

// Per-capability default width for the FULL-WIDTH stacking path (skinny view and
// overflow extras). Everything stacks full width there.
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// A card with its resolved grid geometry. `autoPlace` is true when this card has
// no saved position — in the auto-layout path we compute explicit x/y too (so the
// row arrangement is exact); false when x/y come from the user's saved arrangement.
export interface PlacedCard {
  card: Card;
  x?: number;
  y?: number;
  w: number;
  h: number;
  autoPlace: boolean;
}

// Stack a list of cards full-width, one per row, starting at y. Returns the next
// free y. Used for the skinny view and for overflow "extra" cards below the
// template.
function stackFullWidth(
  cards: Card[],
  startY: number,
  out: PlacedCard[]
): number {
  let y = startY;
  for (const card of cards) {
    out.push({ card, x: 0, y, w: FULL_W, h: SLOT_H, autoPlace: true });
    y += SLOT_H;
  }
  return y;
}

// Place cards into the FIXED TEMPLATE.
//   • stacked → skinny viewport: every card is full-width, stacked top to bottom.
//     The saved arrangement is NOT consulted here (it's preserved in the DB and
//     reappears when the panel widens).
//   • not stacked → the template: a top row of KG (half) + Timeline (half) side by
//     side, then Table (full), Chart(s) (full — never squeezed), and Images (full)
//     stacked beneath. The FIRST KG/timeline/table/images card fills its slot;
//     charts ALL stack full-width; any EXTRA cards of the other types stack
//     full-width below the whole template. A missing capability's slot simply
//     collapses (no gap). Deterministic → identical every render and device.
//     Drag/resize still apply afterwards (GridStack); this is just the default the
//     user starts from and "Reset layout" returns to.
export function autoLayout(cards: Card[], stacked: boolean): PlacedCard[] {
  const out: PlacedCard[] = [];

  if (stacked) {
    stackFullWidth(cards, 0, out);
    return out;
  }

  // Bucket cards by capability, preserving arrival order within each type.
  const by = (cap: CardCapability) =>
    cards.filter((c) => c.capabilityType === cap);
  const kg = by("knowledge-graph");
  const timelines = by("timeline");
  const charts = by("chart");
  const tables = by("table");
  const images = by("images");

  let y = 0;

  // 1. Top row: KG and Timeline side by side. Each takes half the width; the row
  //    is one standard slot tall. If only one of them exists it still takes its
  //    half (left), leaving a clean gap rather than reflowing — keeps the template
  //    shape recognisable. If NEITHER exists the row collapses (no gap).
  const kgCard = kg[0];
  const timelineCard = timelines[0];
  if (kgCard) {
    out.push({ card: kgCard, x: 0, y, w: HALF_W, h: SLOT_H, autoPlace: true });
  }
  if (timelineCard) {
    out.push({ card: timelineCard, x: HALF_W, y, w: HALF_W, h: SLOT_H, autoPlace: true });
  }
  if (kgCard || timelineCard) y += SLOT_H;

  // 2. Table — full width.
  if (tables.length > 0) {
    out.push({ card: tables[0]!, x: 0, y, w: FULL_W, h: SLOT_H, autoPlace: true });
    y += SLOT_H;
  }

  // 3. Charts — full width, stacked. Charts carry dense x-axis labels, so each one
  //    always spans the full 24 columns rather than being squeezed into a half.
  y = stackFullWidth(charts, y, out);

  // 4. Images — full width.
  if (images.length > 0) {
    const h = imagesSlotH(images[0]!);
    out.push({ card: images[0]!, x: 0, y, w: FULL_W, h, autoPlace: true });
    y += h;
  }

  // 5. Everything the template didn't place — extra KGs/timelines/tables/images —
  //    stacks full-width below, in the template's capability order so it stays
  //    deterministic. (Charts are already all placed above.)
  const placed = new Set(out.map((p) => p.card.id));
  const extras = [
    ...kg.slice(1),
    ...timelines.slice(1),
    ...tables.slice(1),
    ...images.slice(1),
  ].filter((c) => !placed.has(c.id));
  stackFullWidth(extras, y, out);

  return out;
}

// Merge the saved layout with the current card set:
//   • stacked (skinny) → ignore saved positions entirely and stack full-width. The
//     saved "true" layout stays in the DB, so widening the panel reflows the cards
//     back to it. This is what makes the collapse non-destructive.
//   • ANY saved positions present → respect the user's arrangement: saved cards
//     keep their x/y/h (width clamped to the grid), and any card without a saved
//     entry is auto-placed by GridStack into a gap (autoPlace, no explicit x/y).
//   • NO saved positions → run the full auto-layout so the default fills cleanly.
// Deterministic ordering keeps placement stable across renders.
export function placeCards(
  cards: Card[],
  saved: TilesLayoutItem[] | undefined,
  stacked: boolean
): PlacedCard[] {
  if (stacked) return autoLayout(cards, true);

  const savedById = new Map((saved ?? []).map((s) => [s.id, s]));
  const hasSaved = savedById.size > 0;

  // Fresh conversation (nothing saved): compute the filled auto-layout.
  if (!hasSaved) return autoLayout(cards, false);

  // Otherwise respect saved positions; auto-place only the genuinely-new cards.
  return cards.map((card) => {
    const s = savedById.get(card.id);
    if (s) {
      // Clamp a saved width to the grid so a restored card never overflows.
      return {
        card,
        x: s.x,
        y: s.y,
        w: Math.min(s.w, GRID_COLUMNS),
        h: s.h,
        autoPlace: false,
      };
    }
    // A genuinely-new card on an existing saved arrangement: GridStack finds it a
    // gap (no explicit x/y). Default to a full-width standard slot.
    return { card, w: FULL_W, h: SLOT_H, autoPlace: true };
  });
}
