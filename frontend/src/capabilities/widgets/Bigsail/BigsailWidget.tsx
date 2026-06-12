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
import { useBigsailPlan } from "./BigsailPlanProvider";
import { toCards } from "./cards";
import { mergeWithSkeletons, planToSkeletons } from "./skeletonCards";
import { TilesCanvas } from "./TilesCanvas";
import {
  placeCards,
  STACK_BREAKPOINT_PX,
  type TilesLayoutItem,
} from "./tilesLayout";

// Bigsail — the Tiles canvas. It mirrors every widget the conversation produces
// as a live card on a best-fit-packed, draggable, resizable grid (GridStack). The
// user's arrangement persists per conversation in ui_state.tilesLayout; new cards
// auto-place into gaps. The `widget` prop is unused; all state is live.
//
// (A zoom/pan plane + a node-graph "flowchart" mode are planned future surfaces;
// layout.ts keeps that flowchart/edge code dormant for then.)

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

  // Measure the panel only to decide the skinny breakpoint. The grid is always
  // 24 columns; below the breakpoint cards collapse to full-width stacked, above
  // it they reflow to their true fractional layout. Re-measures on resize.
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

  const stacked = panelWidth > 0 && panelWidth < STACK_BREAKPOINT_PX;

  const graphTitle = currentSession?.title ?? undefined;
  const realCards = useMemo(
    () =>
      toCards({
        table,
        chart,
        timeline,
        images,
        graph: nodes.length > 0 ? { nodes, links, title: graphTitle } : null,
      }),
    [table, chart, timeline, images, nodes, links, graphTitle]
  );

  // Drip feed: while a turn is in flight, paint skeleton cards from the planner's
  // composition plan so the canvas shows its final shape BEFORE tools return. Each
  // skeleton is superseded by the real card of the same capability the instant its
  // tool_result lands (mergeWithSkeletons). Skeletons vanish once the turn settles
  // (busy → false) or every planned capability has a real card. Saved arrangements
  // never include skeletons (they only ride the live, un-persisted view).
  const plan = useBigsailPlan();
  const cards = useMemo(() => {
    if (!busy) return realCards;
    return mergeWithSkeletons(realCards, planToSkeletons(plan));
  }, [busy, realCards, plan]);

  // Spinner floor: on a FRESH turn (the canvas was empty when the turn began),
  // hold the BigsailLoading animation for a minimum window before the skeletons
  // take over — the rectangles-into-formation spinner is the nicest first moment
  // and the plan often lands within a few hundred ms, cutting it short. Once the
  // window elapses (or the turn ends) we let the skeletons/content through. On a
  // follow-up turn (content already present) there's no floor — we never flash the
  // spinner over existing cards.
  const SPINNER_FLOOR_MS = 1400;
  const [spinnerHold, setSpinnerHold] = useState(false);
  const wasBusy = useRef(false);
  useEffect(() => {
    const startedFresh = busy && !wasBusy.current && realCards.length === 0;
    wasBusy.current = busy;
    if (!startedFresh) return;
    setSpinnerHold(true);
    const t = setTimeout(() => setSpinnerHold(false), SPINNER_FLOOR_MS);
    return () => clearTimeout(t);
  }, [busy, realCards.length]);

  // Merge the saved arrangement with the current card set: saved cards keep their
  // spot, new cards auto-place. Recompute when cards, the saved layout, or the
  // grid dimensions change.
  const placed = useMemo(
    () => placeCards(cards, savedLayout, stacked),
    [cards, savedLayout, stacked]
  );

  // Debounced persistence of the grid arrangement. Keep the latest activeWidget
  // alongside so the optimistic cache write doesn't drop it (the backend merges
  // too, but this avoids a flash before the refetch).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeWidget = currentSession?.ui_state?.activeWidget ?? null;
  function persistLayout(layout: TilesLayoutItem[]) {
    if (!sessionId) return;
    // Never persist transient skeleton positions — they vanish when the turn
    // settles, so a saved `skeleton:*` entry would just be dead weight on reload.
    const real = layout.filter((item) => !item.id.startsWith("skeleton:"));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateSession.mutate({
        id: sessionId,
        patch: { ui_state: { activeWidget, tilesLayout: real } },
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

  // While the spinner floor is active, keep showing BigsailLoading even though
  // skeleton cards already exist — let the opening animation breathe.
  const hasContent = cards.length > 0 && !spinnerHold;

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
          placed={resetTick ? placeCards(cards, [], stacked) : placed}
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
