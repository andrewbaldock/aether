// The Tiles canvas layout model. Cards are placed on a FIXED 24-column GridStack
// grid (column + row units, never pixels) so the arrangement is resolution-
// independent and serializes cleanly to the conversation's ui_state. Responsiveness
// is the column WIDTH (panelWidth / 24), not the column COUNT — everything grows and
// shrinks with the panel/window.
//
// TWO SYSTEMS (plan 011). Placement is split into two entirely separate regimes with a
// one-time handoff:
//   • SYSTEM 1 — autoLayout(): the fixed ROLE-BASED TEMPLATE (KG | Timeline top row,
//     then Table, Charts, Images). Runs ONLY on the initial build of a conversation's
//     canvas (and on Reset), scripts an explicit x/y/w/h for every card, persists once.
//   • SYSTEM 2 — placeCards() once a saved layout exists: honor each saved slot verbatim;
//     append a new card below everything (GridStack float:false then floats it up). The
//     template NEVER runs here. placeCards is the handoff: empty saved → System 1, else 2.

import type { TilesLayoutItem } from "../../../lib/composition";
import type { Card, CardCapability } from "./cards";

// The persisted grid-item shape lives in the neutral lib/composition module (the
// session hooks read it too, without depending on this widget); re-exported here so
// the Bigsail-local import path still resolves.
export type { TilesLayoutItem };

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

// Hysteresis dead-band around the breakpoint. A stacked canvas is taller, so it
// shows a vertical scrollbar that shrinks the measured contentRect width by the
// scrollbar gutter (~15px). Right at 560px that gutter makes the width oscillate
// across the threshold, flipping `stacked` on every ResizeObserver tick → endless
// re-layout → React "max update depth exceeded" (#185), white screen. With a
// dead-band we only stack below 560-margin and only un-stack above 560+margin, so a
// ~15px scrollbar jitter can't ping-pong the 48px gap. ponytail: deadband, not a
// debounce/RAF batch — the scrollbar jitter is the only perturbation, this kills it.
export const STACK_HYSTERESIS_PX = 24;

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

// Place cards into the FIXED TEMPLATE — SYSTEM 1 (Streaming Packing). Runs only for
// the initial build of a conversation's canvas (and on Reset); System 2 owns the canvas
// forever after, so this never has to coexist with user-arranged ("pinned") cards.
//   • stacked → skinny viewport: every card is full-width, stacked top to bottom.
//     The saved arrangement is NOT consulted here (it's preserved in the DB and
//     reappears when the panel widens).
//   • not stacked → the template: a top row of KG (half) + Timeline (half) side by
//     side, then Table (full), Chart(s) (full — never squeezed), and Images (full)
//     stacked beneath. The FIRST KG/timeline/table/images card fills its slot;
//     charts ALL stack full-width; any EXTRA cards of the other types stack
//     full-width below the whole template. A missing capability's slot simply
//     collapses (no gap). Deterministic → identical every render and device.
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

  // 1. Top row: KG and Timeline side by side. When BOTH exist each takes half the
  //    width. When only ONE exists the survivor promotes to FULL width rather than
  //    leaving a dead half-gap — the template shape stays recognisable but no slot
  //    sits empty. This is what closes the "lone KG above the fold" gap: during
  //    streaming the absent partner is still a skeleton card in the set (so both
  //    render half-width, partner shimmering); once the turn settles and an
  //    unfilled skeleton is dropped, the lone real card reflows to full width here.
  //    If NEITHER exists the row collapses (no gap).
  const kgCard = kg[0];
  const timelineCard = timelines[0];
  const topRowPaired = Boolean(kgCard) && Boolean(timelineCard);
  const topRowW = topRowPaired ? HALF_W : FULL_W;
  if (kgCard) {
    out.push({ card: kgCard, x: 0, y, w: topRowW, h: SLOT_H, autoPlace: true });
  }
  if (timelineCard) {
    // Right half when paired with the KG; otherwise it anchors the full top row.
    out.push({
      card: timelineCard,
      x: topRowPaired ? HALF_W : 0,
      y,
      w: topRowW,
      h: SLOT_H,
      autoPlace: true,
    });
  }
  if (kgCard || timelineCard) y += SLOT_H;

  // 2. Table — full width.
  const tableCard = tables[0];
  if (tableCard) {
    out.push({
      card: tableCard,
      x: 0,
      y,
      w: FULL_W,
      h: SLOT_H,
      autoPlace: true,
    });
    y += SLOT_H;
  }

  // 3. Charts — full width, stacked. Charts carry dense x-axis labels, so each one
  //    always spans the full 24 columns rather than being squeezed into a half.
  y = stackFullWidth(charts, y, out);

  // 4. Images — full width.
  const imagesCard = images[0];
  if (imagesCard) {
    const h = imagesSlotH(imagesCard);
    out.push({ card: imagesCard, x: 0, y, w: FULL_W, h, autoPlace: true });
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

// THE HANDOFF (plan 011). Placement is two entirely separate systems with one signal
// deciding which runs: does the saved layout already hold a real (non-skeleton) entry?
//
//   • NO real saved entry → SYSTEM 1 (Streaming Packing). This conversation's canvas has
//     never been built. Run the role-based template (autoLayout) over the whole card set
//     to script an explicit x/y/w/h for every card; it's persisted once and then dormant.
//   • YES → SYSTEM 2 (Vanilla Grid). The canvas is already built/arranged. Honor each
//     known card's saved slot VERBATIM (clamped to the grid). A card with NO saved slot
//     (a new turn's card, an unhide, a duplicate) is appended below everything; GridStack
//     float:false then floats it up into the first free space. The template NEVER runs.
//
// stacked (skinny) → ignore saved positions and stack full-width regardless; the saved
// "true" layout stays in the DB and reflows back when the panel widens.
//
// Deterministic ordering keeps placement stable across renders.
export function placeCards(
  cards: Card[],
  saved: TilesLayoutItem[] | undefined,
  stacked: boolean
): PlacedCard[] {
  if (stacked) return autoLayout(cards, true);

  // Only real (non-skeleton) entries count as "this conversation has been built".
  // Transient skeleton:* positions are never persisted, but guard anyway so a stray
  // one can't flip us into System 2 on a fresh build.
  const savedById = new Map(
    (saved ?? [])
      .filter((s) => !s.id.startsWith("skeleton:"))
      .map((s) => [s.id, s])
  );

  // SYSTEM 1: fresh build — no saved layout yet. Script the whole canvas with the
  // template, once. (This is also the Reset path: resetLayout clears tilesLayout.)
  if (savedById.size === 0) return autoLayout(cards, false);

  // SYSTEM 2: already built. Honor saved slots verbatim; append new cards at the bottom
  // so gravity (float:false) floats them up. The template must NOT run here.
  let appendY = 0;
  const placed: PlacedCard[] = [];
  const news: Card[] = [];
  for (const card of cards) {
    const s = savedById.get(card.id);
    if (s) {
      // Clamp a saved card to the grid so a restored/stale entry never overflows:
      // width first, then x into [0, GRID_COLUMNS - w] so x + w can't exceed the grid
      // (a corrupt saved x like {x:20,w:12} would otherwise run off-grid).
      const w = clamp(s.w, 1, GRID_COLUMNS);
      const x = clamp(s.x, 0, GRID_COLUMNS - w);
      placed.push({ card, x, y: s.y, w, h: s.h, autoPlace: false });
      appendY = Math.max(appendY, s.y + s.h);
    } else {
      news.push(card);
    }
  }

  // New cards: stack them full-width below everything saved. GridStack's float:false
  // then compacts each one upward into the first gap that fits. autoPlace stays true so
  // the reconcile effect treats their x/y as a starting hint, not a user-fixed pin.
  for (const card of news) {
    placed.push({
      card,
      x: 0,
      y: appendY,
      w: FULL_W,
      h: SLOT_H,
      autoPlace: true,
    });
    appendY += SLOT_H;
  }

  return placed;
}
