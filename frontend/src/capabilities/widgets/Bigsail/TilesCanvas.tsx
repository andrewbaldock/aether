import "gridstack/dist/gridstack.min.css";
import { GridStack, type GridStackNode } from "gridstack";
import { Copy, EyeOff, GripVertical, RotateCcw, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "../../../shell/ConfirmDialog";
import { Tooltip } from "../../../shell/Tooltip";
import { BigsailCard } from "./BigsailCard";
import { CardBack } from "./CardBack";
import type { Card } from "./cards";
import {
  GRID_CELL_HEIGHT,
  GRID_COLUMNS,
  GRID_MARGIN,
  type PlacedCard,
  type TilesLayoutItem,
} from "./tilesLayout";

// The Tiles canvas: a GridStack grid that holds cards on a fixed 24-col grid, with
// drag, resize, a fixed gap, and no overlap.
//
// TWO SYSTEMS, ONE HARD HANDOFF (see plan 011). Layout placement is split into two
// entirely separate regimes so there's nothing to fight:
//   • SYSTEM 1 — Streaming Packing (in tilesLayout.autoLayout): the scripted role-based
//     template. Runs ONLY for the very first build of a conversation's canvas (no saved
//     tilesLayout yet), computes explicit x/y/w/h for every card, persists once, then
//     goes dormant for the life of the conversation.
//   • SYSTEM 2 — Vanilla Grid (this file, float:false): plain GridStack with UPWARD
//     gravity compaction. Owns everything after the initial build. Saved positions are
//     honored verbatim; a new card appended at the bottom floats up into the first free
//     space; hiding a card pulls the rows below it up to close the gap. The template
//     NEVER runs here.
// float:false is what gives System 2 its gap-closing: removing/hiding a card auto-
// compacts the cards below upward, and a dropped card settles into the nearest gap. The
// old float:true existed to stop the TEMPLATE re-running on every gesture and yanking
// cards around; with the template no longer running in user mode, float:false is correct.
//
// GridStack + React ownership split (the standard pattern that avoids the DOM
// reconciliation war): GridStack OWNS the grid-item DOM and their positions — we
// create/remove items imperatively via addWidget/removeWidget. React OWNS only the
// CONTENT inside each item, rendered through a portal into the GridStack-created
// content node. React never renders the grid items as JSX children, so its
// reconciler and GridStack's DOM moves never collide.

interface TilesCanvasProps {
  placed: PlacedCard[];
  onLayoutChange: (layout: TilesLayoutItem[]) => void;
  // Hide a card from the canvas (reversible — re-addable from its tool tab). Wired
  // to the EyeOff action on the card's back face.
  onHide: (cardId: string) => void;
  // Duplicate a card: clone its entry in place so a copy lands directly beneath it
  // (in both the tool tab and here). Wired to the Copy action on the back face.
  onDuplicate: (cardId: string) => void;
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
  // No `userMoved` stamp: System 2 honors every saved position verbatim and gravity
  // (float:false) closes gaps, so there's no template to protect cards from — the
  // distinction the flag drew (pinned vs auto) no longer exists.
}

export function TilesCanvas({
  placed,
  onLayoutChange,
  onHide,
  onDuplicate,
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

  // Init GridStack once. The grid is always GRID_COLUMNS wide — responsiveness is
  // the column WIDTH (the grid spans 100% of the panel), not a changing count.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const grid = GridStack.init(
      {
        column: GRID_COLUMNS,
        cellHeight: GRID_CELL_HEIGHT,
        margin: GRID_MARGIN,
        float: false, // System 2: upward gravity — gaps close, dropped cards settle up
        resizable: { handles: "se" },
        draggable: { handle: ".bigsail-card-drag" },
      },
      el
    );
    gridRef.current = grid;
    // Every layout change (drag, resize, or gravity compaction) serializes the grid
    // back to the saved layout. System 2 treats every position as canonical, so there's
    // no need to distinguish a user move from a reflow anymore.
    grid.on("change", () => onChangeRef.current(serialize(grid)));
    return () => {
      grid.off("change");
      grid.destroy(false);
      gridRef.current = null;
    };
  }, []);

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
        // Sync an existing item to its placed geometry. For known cards in System 2,
        // `placed` IS the saved position (honored verbatim), so this is a no-op for a
        // card already sitting where it belongs and a correction for one whose saved
        // slot changed. The no-op guard avoids thrashing GridStack with identical
        // geometry (which would also fire spurious `change` events). A move/resize the
        // user just made already lives in the saved layout that produced `placed`, so
        // this never fights the user. Skip when x/y are undefined (a brand-new card
        // with no slot — handled by addWidget's autoPosition below).
        if (
          p.x !== undefined &&
          p.y !== undefined &&
          (existing.x !== p.x ||
            existing.y !== p.y ||
            existing.w !== p.w ||
            existing.h !== p.h)
        ) {
          grid.update(existing.el, { x: p.x, y: p.y, w: p.w, h: p.h });
        }
        continue;
      }
      // New card: let GridStack create the item DOM, then portal React in. System 1
      // gives every card an explicit x/y on the initial build; System 2 gives known
      // cards their saved x/y and appends a new card below everything with an explicit
      // y, so gravity (float:false) then floats it up into the first free space. If
      // x/y are somehow absent, autoPosition lets GridStack find a gap itself.
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
    // No explicit compact() needed: float:false makes GridStack compact upward on its
    // own as widgets are added/removed, which is exactly System 2's gap-closing.
    setPortals(nextPortals);
  }, [placed]);

  // Stagger index per placeholder card, in placed order, so skeletons cascade in
  // (the CSS uses --i to delay each one). Only placeholders get an index; real
  // cards render with no entrance delay.
  const skeletonIndex = new Map<string, number>();
  let si = 0;
  for (const p of placed) {
    if (p.card.placeholder) skeletonIndex.set(p.card.id, si++);
  }

  return (
    <div ref={containerRef} className="grid-stack h-full w-full overflow-auto">
      {[...portals].map(([id, host]) => {
        const card = cardById.current.get(id);
        if (!card) return null;
        return createPortal(
          <CardShell
            card={card}
            staggerIndex={skeletonIndex.get(id)}
            onHide={onHide}
            onDuplicate={onDuplicate}
          />,
          host,
          id
        );
      })}
    </div>
  );
}

// One card's contents inside a GridStack item: a drag-handle strip on top (only
// the handle starts a drag, so card contents stay interactive) + the live widget.
// A placeholder (skeleton) card gets the staggered entrance class so a planned
// answer cascades into the canvas; staggerIndex feeds the per-card --i delay.
//
// Real cards have a BACK side: a settings gear in the top bar flips the card 180°
// on its Y axis to reveal the read-only JSON spec that rules the widget, plus an
// EyeOff "hide from canvas" action. Flip state is intentionally EPHEMERAL — local
// state only, never persisted — so a reload/URL-change always returns to the front.
function CardShell({
  card,
  staggerIndex,
  onHide,
  onDuplicate,
}: {
  card: Card;
  staggerIndex?: number;
  onHide: (cardId: string) => void;
  onDuplicate: (cardId: string) => void;
}) {
  const isSkeleton = card.placeholder === true;
  // Title lives in the top bar (fixed) so it stays put while the card body
  // scrolls. Skeleton cards have no real spec yet, so no title.
  const title = isSkeleton ? undefined : card.spec.title;
  // Ephemeral flip state — never persisted; always starts on the front.
  const [flipped, setFlipped] = useState(false);

  // Skeletons never flip: no back side until real data exists. Render the plain
  // (non-3D) shell so the shimmer entrance is unaffected.
  if (isSkeleton) {
    return (
      <div
        className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg tiles-skeleton-in"
        style={{ "--i": staggerIndex ?? 0 } as React.CSSProperties}
      >
        <div
          className="bigsail-card-drag flex h-7 shrink-0 cursor-grab items-center gap-2 px-3 bg-elevated/60 active:cursor-grabbing"
          title="Drag to rearrange"
        >
          <GripVertical
            className="ml-auto h-4 w-4 shrink-0 text-content-faint/50"
            aria-hidden
          />
        </div>
        <div className="bigsail-card min-h-0 flex-1 overflow-hidden">
          <BigsailCard card={card} />
        </div>
      </div>
    );
  }

  return (
    // Outer host gives the 3D scene perspective; the flipper rotates inside it.
    <div className="group h-full w-full [perspective:1200px]">
      <div
        className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        {/* FRONT — the live widget. Hidden from the back via backface-visibility.
            backface-visibility hides the AWAY face visually but does NOT stop it
            from capturing wheel/pointer events: in a preserve-3d scene the rotated
            back face still projects onto the card's screen box and was intercepting
            scroll over part of the card (the "top half won't scroll" bug). Gate
            pointer-events on flip so only the face you see is interactive. */}
        <div
          className={`absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg [backface-visibility:hidden] ${
            flipped ? "pointer-events-none" : ""
          }`}
        >
          {/* Top bar doubles as the drag handle (the whole strip starts a drag) and
              carries the card's title, which stays fixed while the body scrolls.
              The gear button swallows its own pointer gesture so a click flips
              rather than starting a drag. */}
          <div
            className="bigsail-card-drag flex h-7 shrink-0 cursor-grab items-center gap-2 px-3 bg-elevated/60 active:cursor-grabbing"
            title="Drag to rearrange"
          >
            <CardChromeButton
              label="Show this widget's parameters"
              onClick={() => setFlipped(true)}
            >
              <Settings className="h-3.5 w-3.5" aria-hidden />
            </CardChromeButton>
            <span className="truncate font-display text-sm font-semibold text-content">
              {title}
            </span>
            <GripVertical
              className="ml-auto h-4 w-4 shrink-0 text-content-faint/50 transition-colors group-hover:text-content-faint"
              aria-hidden
            />
          </div>
          <div className="bigsail-card min-h-0 flex-1 overflow-hidden">
            <BigsailCard card={card} />
          </div>
        </div>

        {/* BACK — read-only JSON spec + hide action. Pre-rotated 180° so it faces
            the viewer once the flipper turns. Still draggable (same handle strip).
            pointer-events gated to the flipped state so the away-facing back never
            steals wheel/clicks from the front (see the FRONT note above). */}
        <div
          className={`absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)] ${
            flipped ? "" : "pointer-events-none"
          }`}
        >
          <div
            className="bigsail-card-drag flex h-7 shrink-0 cursor-grab items-center gap-2 px-3 bg-elevated/60 active:cursor-grabbing"
            title="Drag to rearrange"
          >
            <CardChromeButton
              label="Back to the widget"
              onClick={() => setFlipped(false)}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            </CardChromeButton>
            <span className="truncate font-display text-sm font-semibold text-content">
              {title}
            </span>
            {/* Duplicate this widget: clones the entry in place so a copy (titled
                "… (copy)") lands directly beneath it on the canvas and in the tool
                tab — the user then re-prompts/regenerates the copy. ml-auto pushes
                this pair to the right; the hide button sits just after it. */}
            <CardChromeButton
              label="Duplicate this widget"
              className="ml-auto"
              onClick={() => onDuplicate(card.id)}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </CardChromeButton>
            {/* Plain button (no Tooltip wrapper) as the dialog trigger: AlertDialog's
                asChild clones a single DOM element, so nesting a Tooltip (which is
                its own Radix tree) inside the trigger would be fragile. The title
                attr carries the hover hint instead. */}
            <ConfirmDialog
              title="Hide from canvas?"
              description="This removes the widget from the Bigsail canvas. You can add it back from its tool tab."
              confirmLabel="Hide"
              affirmative="primary"
              onConfirm={() => onHide(card.id)}
              trigger={
                <button
                  type="button"
                  aria-label="Hide from canvas"
                  title="Hide from canvas"
                  onPointerDown={(e) => e.stopPropagation()}
                  className="shrink-0 rounded p-0.5 text-content-faint/60 transition-colors hover:text-content focus-visible:text-content focus-visible:outline-none"
                >
                  <EyeOff className="h-3.5 w-3.5" aria-hidden />
                </button>
              }
            />
          </div>
          {/* Editable summary ("re-prompt") + read-only spec JSON. Regenerating
              flips back to the front so the user watches the new result land. */}
          <div className="bigsail-card min-h-0 flex-1 overflow-hidden">
            <CardBack card={card} onRegenerated={() => setFlipped(false)} />
          </div>
        </div>
      </div>
    </div>
  );
}

// A small icon button living in a card's drag-handle strip. It stops its own
// pointer gesture so clicking it acts (flip / hide) instead of starting a GridStack
// drag, and recedes by default, brightening on hover. `className` is for LAYOUT
// (e.g. ml-auto) and lands on the Tooltip's flex wrapper — the real DOM node in the
// handle row — so positioning works even when this is also an AlertDialog trigger.
function CardChromeButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip
      label={label}
      className={`shrink-0${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        // Keep the drag handle from claiming this gesture.
        onPointerDown={(e) => e.stopPropagation()}
        className="rounded p-0.5 text-content-faint/60 transition-colors hover:text-content focus-visible:text-content focus-visible:outline-none"
      >
        {children}
      </button>
    </Tooltip>
  );
}
