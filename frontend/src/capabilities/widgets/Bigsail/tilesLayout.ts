// The Tiles canvas layout model. Cards are placed on a FIXED 24-column GridStack
// grid (column + row units, never pixels) so the arrangement is resolution-
// independent and serializes cleanly to the conversation's ui_state. Responsiveness
// is the column WIDTH (panelWidth / 24), not the column COUNT — everything grows and
// shrinks with the panel/window. The default arrangement is a fixed ROLE-BASED
// TEMPLATE (KG on top, Timeline + stacked Charts, then Table, then Images); the user
// can drag/resize freely from there and that arrangement persists. This module is the
// pure glue: the grid config, the template, and the merge that preserves the user's
// saved arrangement while auto-placing new cards.

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
//
// `pinned` is the user-moved cards already placed at their saved geometry. It matters
// for the KG↔Timeline top row: that row's lone-survivor promotion (half→full when its
// partner is absent) must NOT fire when the partner is merely PINNED rather than truly
// absent — otherwise dragging one onto the other to swap them makes the survivor
// balloon to full width and dumps the pin below. A pinned partner is counted as
// occupying the row (so the auto card stays half-width), and the auto card takes the
// slot the pin ISN'T in, at the pin's y, so the two land side by side — i.e. swapped.
export function autoLayout(
  cards: Card[],
  stacked: boolean,
  pinned: readonly PlacedCard[] = []
): PlacedCard[] {
  const out: PlacedCard[] = [];

  if (stacked) {
    stackFullWidth(cards, 0, out);
    return out;
  }

  const pinnedByCap = new Map(pinned.map((p) => [p.card.capabilityType, p]));

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
  const pinnedKg = pinnedByCap.get("knowledge-graph");
  const pinnedTimeline = pinnedByCap.get("timeline");
  // The top row is "paired" — each slot half-width — when BOTH slots are filled,
  // counting a PINNED occupant of the other capability as filled. So a lone auto
  // card whose partner the user pinned (e.g. dragged to swap) stays half-width
  // rather than ballooning to full width.
  // A pinned partner only counts as the top-row mate when it's STILL IN THE TOP ROW
  // (y === 0). The pairing logic (half-width slots, dodge to the open slot, share the
  // pin's y) is the SWAP affordance: drag KG onto Timeline within the top row → they
  // trade slots. But if the user drags a half-width card to ITS OWN LINE (a different
  // row, y > 0), that's NOT a swap — the auto partner must keep its own top-row slot,
  // not get yanked down to the pin's row (and not balloon to full width). So the
  // "present" / pairing checks consider a pinned partner only while it remains at y:0.
  const pinnedKgInTopRow = pinnedKg !== undefined && (pinnedKg.y ?? 0) === 0;
  const pinnedTimelineInTopRow =
    pinnedTimeline !== undefined && (pinnedTimeline.y ?? 0) === 0;
  const kgPresent = Boolean(kgCard) || pinnedKgInTopRow;
  const timelinePresent = Boolean(timelineCard) || pinnedTimelineInTopRow;
  const topRowPaired = kgPresent && timelinePresent;
  // Lone-survivor promotion (half → full when the partner is absent) is a STREAMING
  // convenience: while a turn is loading, a solo KG/Timeline fills the row rather than
  // leaving a dead half-gap. But once the user has started arranging (any pin exists),
  // promotion must NOT fire — otherwise dragging one half-width card to its own line
  // balloons the partner left behind to full width (the bug). With pins present, a lone
  // top-row card keeps its natural HALF width. (No pins = pure template = promote.)
  const userArranging = pinned.length > 0;
  const topRowW = topRowPaired || userArranging ? HALF_W : FULL_W;
  // When the partner is pinned IN THE TOP ROW, the auto card takes the slot the pin
  // ISN'T in (so they sit side by side rather than overlapping) at the pin's y.
  // Default slots (no top-row pinned partner): KG left, Timeline right, at y:0.
  if (kgCard) {
    // Left slot by default; dodge to the right only if a pinned timeline holds the
    // left half OF THE TOP ROW.
    const partnerLeft =
      pinnedTimelineInTopRow && (pinnedTimeline!.x ?? 0) < HALF_W;
    out.push({
      card: kgCard,
      x: topRowPaired && partnerLeft ? HALF_W : 0,
      y: pinnedTimelineInTopRow ? pinnedTimeline!.y : y,
      w: topRowW,
      h: SLOT_H,
      autoPlace: true,
    });
  }
  if (timelineCard) {
    // Right slot by default; dodge to the left only if a pinned KG holds the right
    // half OF THE TOP ROW (e.g. the user dragged the KG into the timeline's slot to
    // swap them).
    const partnerRight = pinnedKgInTopRow && (pinnedKg!.x ?? 0) >= HALF_W;
    out.push({
      card: timelineCard,
      x: topRowPaired && !partnerRight ? HALF_W : 0,
      y: pinnedKgInTopRow ? pinnedKg!.y : y,
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

// Merge the saved layout with the current card set.
//
// THE LAW (Andrew): packing/templating is for the SYSTEM while STREAMING. The user is
// KING while READING — during and after any drag/drop/resize, the system bends to them
// and NEVER reflows their cards. So placement has two distinct modes:
//
//   • settled === false  → STREAMING / RESTORING. The template runs: auto cards get
//     their role-based slots, re-evaluated as cards hydrate (the KG loads via a separate
//     async fetch and lands a beat late — the template must re-pair it with the timeline
//     when it arrives). USER-MOVED cards are still pinned verbatim. This is the ONLY time
//     autoLayout repositions anything.
//   • settled === true   → READING. The template does NOT run. Every card with a saved
//     position is honored VERBATIM (clamped to the grid), userMoved or not — because a
//     resize/move the user just made is the source of truth and must never be reflowed
//     or jumped to the bottom. A card with no saved entry at all (e.g. unhidden or
//     duplicated while reading) is the only thing template-placed, so it gets a sane slot.
//
// stacked (skinny) → ignore saved positions and stack full-width regardless; the saved
// "true" layout stays in the DB and reflows back when the panel widens.
//
// Deterministic ordering keeps placement stable across renders.
export function placeCards(
  cards: Card[],
  saved: TilesLayoutItem[] | undefined,
  stacked: boolean,
  settled = false
): PlacedCard[] {
  if (stacked) return autoLayout(cards, true);

  const savedById = new Map((saved ?? []).map((s) => [s.id, s]));

  // Partition: pin a card when the user explicitly moved it OR (when settled/reading)
  // whenever it has ANY saved position — because while reading, the saved layout is
  // canonical and the template must not touch it. Auto-arrange only what has no saved
  // slot to honor.
  const pinned: PlacedCard[] = [];
  const autoCards: Card[] = [];
  for (const card of cards) {
    const s = savedById.get(card.id);
    if (s && (s.userMoved || settled)) {
      // Clamp a pinned card to the grid so a restored card never overflows: width
      // first, then x into [0, GRID_COLUMNS - w] so x + w can't exceed the grid
      // (a stale/corrupt saved x like {x:20,w:12} would otherwise run off-grid).
      const w = clamp(s.w, 1, GRID_COLUMNS);
      const x = clamp(s.x, 0, GRID_COLUMNS - w);
      pinned.push({ card, x, y: s.y, w, h: s.h, autoPlace: false });
    } else {
      autoCards.push(card);
    }
  }

  // No pins → the whole canvas is the clean template (the common case: fresh or
  // restored-but-never-dragged). This is what re-pairs KG+Timeline on every load.
  if (pinned.length === 0) return autoLayout(autoCards, false);

  // Some pins: keep them verbatim, and template-arrange the rest. autoLayout places
  // the auto cards at explicit slots and is passed the pins so the KG↔Timeline top row
  // (a) doesn't promote a lone auto card to full width while the user is arranging, and
  // (b) gives the auto card the slot the pin isn't in (the swap case). GridStack runs
  // with float:true (no gravity), so these positions are honored as-is — nothing gets
  // packed on top of the user's pins.
  return [...pinned, ...autoLayout(autoCards, false, pinned)];
}
