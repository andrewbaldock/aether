import "gridstack/dist/gridstack.min.css";
import { GridStack, type GridStackNode } from "gridstack";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BigsailCard } from "./BigsailCard";
import type { Card } from "./cards";
import {
  GRID_CELL_HEIGHT,
  GRID_MARGIN,
  type PlacedCard,
  type TilesLayoutItem,
} from "./tilesLayout";

// The Tiles canvas: a GridStack grid that best-fit packs cards (float off →
// gravity packing, so cards rise to fill gaps), with drag, resize, a fixed gap,
// and no overlap — all native to GridStack.
//
// GridStack + React ownership split (the standard pattern that avoids the DOM
// reconciliation war): GridStack OWNS the grid-item DOM and their positions — we
// create/remove items imperatively via addWidget/removeWidget. React OWNS only the
// CONTENT inside each item, rendered through a portal into the GridStack-created
// content node. React never renders the grid items as JSX children, so its
// reconciler and GridStack's DOM moves never collide.

interface TilesCanvasProps {
  placed: PlacedCard[];
  // Live grid column count (derived from the panel width upstream). The grid
  // re-columns when this changes so cards stay content-wide on resize.
  columns: number;
  onLayoutChange: (layout: TilesLayoutItem[]) => void;
}

function serialize(grid: GridStack): TilesLayoutItem[] {
  const nodes = grid.save(false) as GridStackNode[];
  return nodes
    .filter((n) => typeof n.id === "string")
    .map((n) => ({
      id: n.id as string,
      x: n.x ?? 0,
      y: n.y ?? 0,
      w: n.w ?? 1,
      h: n.h ?? 1,
    }));
}

export function TilesCanvas({
  placed,
  columns,
  onLayoutChange,
}: TilesCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<GridStack | null>(null);
  // cardId → the GridStack-created content element we portal React into.
  const [portals, setPortals] = useState<Map<string, HTMLElement>>(new Map());
  // cardId → its Card, so a portal can render the right contents.
  const cardById = useRef<Map<string, Card>>(new Map());
  cardById.current = new Map(placed.map((p) => [p.card.id, p.card]));

  const onChangeRef = useRef(onLayoutChange);
  onChangeRef.current = onLayoutChange;
  // Initial column count, captured once for GridStack.init (changes are applied by
  // the responsive effect below, not by re-initialising).
  const initialColumnsRef = useRef(columns);

  // Init GridStack once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const grid = GridStack.init(
      {
        column: initialColumnsRef.current,
        cellHeight: GRID_CELL_HEIGHT,
        margin: GRID_MARGIN,
        float: false, // gravity packing → best-fit tiling
        resizable: { handles: "se" },
        draggable: { handle: ".bigsail-card-drag" },
      },
      el
    );
    gridRef.current = grid;
    grid.on("change", () => onChangeRef.current(serialize(grid)));
    return () => {
      grid.off("change");
      grid.destroy(false);
      gridRef.current = null;
    };
  }, []);

  // Responsive re-columning: when the panel width changes the column count, tell
  // GridStack so it reflows existing cards to the new grid. "list" layout keeps the
  // packed order rather than trying to preserve absolute x (which breaks at a
  // different column count).
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    if (grid.getColumn() !== columns) grid.column(columns, "list");
  }, [columns]);

  // Reconcile the card SET against GridStack imperatively. Add widgets GridStack
  // doesn't have, remove ones whose card is gone, and track each item's content
  // node so React can portal into it. Existing items' positions are untouched
  // (the user owns them). GridStack creates/destroys the DOM here — React only
  // fills the content node — so there's no reconciliation conflict.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    // GridStack 12: batchUpdate(true) opens a batch, batchUpdate(false) flushes
    // it (there is no separate commit()).
    grid.batchUpdate(true);
    const liveIds = new Set(placed.map((p) => p.card.id));
    const nextPortals = new Map<string, HTMLElement>();

    // Remove gone cards (removeDOM=true: GridStack owns this DOM, so it's safe).
    for (const node of grid.engine.nodes.slice()) {
      if (typeof node.id === "string" && !liveIds.has(node.id) && node.el) {
        grid.removeWidget(node.el, true);
      }
    }

    const known = new Map(
      grid.engine.nodes
        .filter((n): n is GridStackNode & { id: string } => !!n.id)
        .map((n) => [n.id, n])
    );

    for (const p of placed) {
      const existing = known.get(p.card.id);
      if (existing?.el) {
        // Already managed — reuse its content node for the portal.
        const content = existing.el.querySelector<HTMLElement>(
          ".grid-stack-item-content"
        );
        if (content) nextPortals.set(p.card.id, content);
        continue;
      }
      // New card: let GridStack create the item DOM, then portal React in. We
      // always have explicit x/y now — the auto-layout (full-width, bottom-squared)
      // computes them for fresh cards, and saved cards carry the user's. Only a
      // genuinely-new card added onto an existing user arrangement lacks x/y, in
      // which case autoPosition lets GridStack find a gap.
      const hasPos = p.x !== undefined && p.y !== undefined;
      const node = grid.addWidget({
        id: p.card.id,
        w: p.w,
        h: p.h,
        ...(hasPos ? { x: p.x, y: p.y } : { autoPosition: true }),
        content: "",
      });
      const content = node.querySelector<HTMLElement>(
        ".grid-stack-item-content"
      );
      if (content) nextPortals.set(p.card.id, content);
    }

    grid.batchUpdate(false);
    // No compact() here: the auto-layout already fills the width and squares the
    // bottom, and compacting would collapse those full-width rows back to intrinsic
    // widths (re-introducing the ragged right edge).
    setPortals(nextPortals);
  }, [placed]);

  return (
    <div ref={containerRef} className="grid-stack h-full w-full overflow-auto">
      {[...portals].map(([id, host]) => {
        const card = cardById.current.get(id);
        if (!card) return null;
        return createPortal(<CardShell card={card} />, host, id);
      })}
    </div>
  );
}

// One card's contents inside a GridStack item: a drag-handle strip on top (only
// the handle starts a drag, so card contents stay interactive) + the live widget.
function CardShell({ card }: { card: Card }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
      <div
        className="bigsail-card-drag flex h-5 shrink-0 cursor-grab items-center justify-center bg-elevated/60 active:cursor-grabbing"
        title="Drag to rearrange"
      >
        <span className="text-content-faint text-xs leading-none">⋯</span>
      </div>
      <div className="bigsail-card min-h-0 flex-1 overflow-hidden">
        <BigsailCard card={card} />
      </div>
    </div>
  );
}
