import { useEffect, useMemo, useRef, useState } from "react";
import { useUpdateSession } from "../../../hooks/useUpdateSession";
import { useSessionContext } from "../../../shell/SessionContext";
import { useAgentBusy } from "../../../shell/useAgentBusy";
import type { Widget } from "../../registry";
import { useChartState } from "../Chart/useChartState";
import { useImagesState } from "../Images/useImagesState";
import { useKnowledgeGraphState } from "../KnowledgeGraph/useKnowledgeGraphState";
import { useTableState } from "../Table/useTableState";
import { useTimelineState } from "../Timeline/useTimelineState";
import { BigsailLoading } from "./BigsailLoading";
import { toCards } from "./cards";
import { TilesCanvas } from "./TilesCanvas";
import {
  columnsForWidth,
  GRID_MARGIN,
  placeCards,
  type TilesLayoutItem,
} from "./tilesLayout";

// Bigsail — the Tiles canvas. It mirrors every widget the conversation produces
// as a live card on a best-fit-packed, draggable, resizable grid (GridStack). The
// user's arrangement persists per conversation in ui_state.tilesLayout; new cards
// auto-place into gaps. The `widget` prop is unused; all state is live.
//
// (A zoom/pan plane + a node-graph "flowchart" mode are planned future surfaces;
// layout.ts keeps that flowchart/edge code dormant for then.)

// Column-width fallback before the panel has measured (first paint).
const TARGET_FALLBACK_COL_PX = 90;

export function BigsailWidget(_props: { widget: Widget }) {
  const { nodes, links } = useKnowledgeGraphState();
  const { entries: table } = useTableState();
  const { entries: chart } = useChartState();
  const { entries: timeline } = useTimelineState();
  const { entries: images } = useImagesState();
  const busy = useAgentBusy();
  const { userId, sessionId, sessions, messages } = useSessionContext();
  const updateSession = useUpdateSession(userId);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === sessionId) ?? null,
    [sessions, sessionId]
  );
  const savedLayout = currentSession?.ui_state?.tilesLayout;

  // Measure the panel so the grid's column count tracks the available width —
  // columns stay ~content-wide instead of clipping. Re-measures on resize.
  const hostRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setPanelWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns = columnsForWidth(panelWidth);
  // The on-screen pixel width of one grid column (minus the inter-card margins),
  // used to convert each card's desired pixel width into the right column span.
  const colWidthPx =
    panelWidth > 0
      ? (panelWidth - GRID_MARGIN * (columns + 1)) / columns
      : TARGET_FALLBACK_COL_PX;

  const cards = useMemo(
    () =>
      toCards({
        table,
        chart,
        timeline,
        images,
        graph: nodes.length > 0 ? { nodes, links } : null,
      }),
    [table, chart, timeline, images, nodes, links]
  );

  // Merge the saved arrangement with the current card set: saved cards keep their
  // spot, new cards auto-place. Recompute when cards, the saved layout, or the
  // grid dimensions change.
  const placed = useMemo(
    () => placeCards(cards, savedLayout, columns, colWidthPx),
    [cards, savedLayout, columns, colWidthPx]
  );

  // Debounced persistence of the grid arrangement. Keep the latest activeWidget
  // alongside so the optimistic cache write doesn't drop it (the backend merges
  // too, but this avoids a flash before the refetch).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeWidget = currentSession?.ui_state?.activeWidget ?? null;
  function persistLayout(layout: TilesLayoutItem[]) {
    if (!sessionId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateSession.mutate({
        id: sessionId,
        patch: { ui_state: { activeWidget, tilesLayout: layout } },
      });
    }, 900);
  }
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  // Reset the arrangement: clear the saved layout so every card re-auto-places.
  // Remounts the canvas (via key bump) so GridStack rebuilds from defaults.
  const [resetTick, setResetTick] = useState(0);
  function resetLayout() {
    if (sessionId) {
      updateSession.mutate({
        id: sessionId,
        patch: { ui_state: { activeWidget, tilesLayout: [] } },
      });
    }
    setResetTick((t) => t + 1);
  }

  const hasContent = cards.length > 0;

  return (
    <div ref={hostRef} className="relative h-full w-full bg-surface">
      {hasContent && (
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={resetLayout}
            title="Reset the card arrangement to a fresh best-fit layout"
            className="rounded-full border border-border bg-surface/90 px-3 py-1 text-xs font-medium text-content-muted backdrop-blur-sm transition-colors hover:text-content"
          >
            Reset layout
          </button>
        </div>
      )}

      {hasContent ? (
        <TilesCanvas
          key={`${sessionId ?? "none"}:${resetTick}`}
          placed={
            resetTick ? placeCards(cards, [], columns, colWidthPx) : placed
          }
          columns={columns}
          onLayoutChange={persistLayout}
        />
      ) : busy ? (
        <BigsailLoading />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="font-display text-base font-semibold text-content">
            Your canvas is empty — for now.
          </p>
          <p className="max-w-sm text-sm text-content-muted">
            {messages.length > 0
              ? "Ask something rich — a comparison, a history, a set of facts — and everything I compose lands here as live, rearrangeable cards."
              : "Start a conversation. Tables, charts, timelines, images, and the knowledge graph all appear here together as a living canvas of cards you can drag and resize."}
          </p>
        </div>
      )}
    </div>
  );
}
