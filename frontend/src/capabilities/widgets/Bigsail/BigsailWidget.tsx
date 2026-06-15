import { useEffect, useMemo, useRef, useState } from "react";
import { useUpdateSession } from "../../../hooks/useUpdateSession";
import { SCHEMA_VERSIONS } from "../../../lib/schemaVersion";
import { useAgentEvents } from "../../../shell/AgentEventContext";
import { useSessionContext } from "../../../shell/SessionContext";
import { Tooltip } from "../../../shell/Tooltip";
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
import { useCardDuplicate } from "./useCardDuplicate";
import { useHiddenCards } from "./useHiddenCards";
import {
  FALLBACK_SKELETONS,
  mergeWithSkeletons,
  planToSkeletons,
} from "./skeletonCards";
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
  const bus = useAgentEvents();
  const { userId, sessionId, sessions, messages } = useSessionContext();
  const { isHidden, hide } = useHiddenCards();
  const duplicate = useCardDuplicate();

  // Awaiting a clarifier answer: the planner asked ONE question instead of
  // composing, so the canvas shows a calm "let's aim this first" state rather than
  // the empty-canvas copy. This is a deliberate wait-on-user, NOT an in-flight turn
  // — busy is false here (the clarify turn ended with [DONE]), per the loading
  // contract. Set on `clarify`; cleared the moment the next turn begins
  // (`request_start`) — whether the user tapped a chip or typed a free-form answer.
  const [awaitingClarification, setAwaitingClarification] = useState(false);
  useEffect(() => {
    return bus.subscribe((event) => {
      if (event.type === "clarify") setAwaitingClarification(true);
      else if (event.type === "request_start") setAwaitingClarification(false);
    });
  }, [bus]);
  const updateSession = useUpdateSession(userId);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === sessionId) ?? null,
    [sessions, sessionId]
  );
  // Always render the user's saved arrangement best-effort, whatever version it
  // was stamped against — never wipe their layout over a version number. The
  // layout is positioning-only and placeCards clamps each item to the grid, so a
  // slightly-older shape just re-flows rather than breaking. A stale stamp heals
  // itself on the next persist (persistLayout writes the current version).
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

  // Skeleton lifecycle across a turn. The backend planner predicts which panels this
  // turn will compose (planToSkeletons); that ordered set is the canvas's final
  // shape. We reveal it in two phases:
  //
  //   1. DRIP (before the first real panel): the spinner animation plays and one
  //      planned skeleton pops into its slot every DRIP_INTERVAL_MS — capped at the
  //      planned count, so we never show more slots than the answer will have.
  //   2. FULL (once the first real panel's data lands): the spinner stops and the
  //      ENTIRE planned set shows at once — the arrived panel filled, the rest
  //      shimmering — then each remaining skeleton is superseded in place by its
  //      panel's data as it arrives (mergeWithSkeletons). The last extras vanish as
  //      the final panel fills.
  //
  // A turn with no plan (a simple ask) has no skeletons: it's just spinner → panel.
  // Skeletons never persist — persistLayout drops every skeleton:* id.
  const plan = useBigsailPlan();
  const planSkeletons = useMemo(() => planToSkeletons(plan), [plan]);
  const firstPanelArrived = realCards.length > 0;

  // Fallback floor: a turn can be composing with NO plan to shape it (the plan event
  // was empty, slow, or never arrived). The loading contract says the canvas must
  // never sit on a bare spinner, so after a short grace we drip in a generic shape.
  // The grace exists so a quick TEXT-ONLY turn ("what's 2+2") — which also has no
  // plan and no cards — never flashes skeletons that would never fill. As soon as a
  // real plan or a real card arrives, the fallback is moot (planSkeletons/realCards
  // take over below). Reset whenever we're not in the bare-waiting state.
  const FALLBACK_GRACE_MS = 1200;
  const [fallbackEngaged, setFallbackEngaged] = useState(false);
  const bareWaiting =
    busy && !firstPanelArrived && planSkeletons.length === 0;
  useEffect(() => {
    if (!bareWaiting) {
      setFallbackEngaged(false);
      return;
    }
    const t = setTimeout(() => setFallbackEngaged(true), FALLBACK_GRACE_MS);
    return () => clearTimeout(t);
  }, [bareWaiting]);

  // The skeleton set we actually drip/merge: the real plan when we have one, else the
  // fallback floor once the grace elapses, else nothing (so a plain text turn shows
  // no skeletons). The plan path always wins over the fallback.
  const skeletons = useMemo(() => {
    if (planSkeletons.length > 0) return planSkeletons;
    if (fallbackEngaged) return FALLBACK_SKELETONS;
    return [];
  }, [planSkeletons, fallbackEngaged]);

  // One planned skeleton pops in per interval while we wait for the first real
  // panel. Tuned so the full planned shape (1–4 slots) reveals within the typical
  // pre-first-panel window: at 10s the drip was effectively invisible on a fast
  // turn (phase 2 superseded it before the first skeleton appeared) and sluggish
  // on a slow one (~40s for four slots). ~2.5s lands the whole shape in the first
  // several seconds of spinner-only time, where it actually reads.
  const DRIP_INTERVAL_MS = 2500;
  const [dripCount, setDripCount] = useState(0);
  useEffect(() => {
    // Drip only while we're waiting for the first panel and have skeletons to show.
    if (!busy || firstPanelArrived || skeletons.length === 0) {
      setDripCount(0);
      return;
    }
    // Show the first skeleton immediately, then drip the rest — the fallback floor
    // (engaged after a grace) shouldn't wait another full interval to appear.
    setDripCount((n) => (n === 0 ? 1 : n));
    const t = setInterval(() => {
      setDripCount((n) => Math.min(n + 1, skeletons.length));
    }, DRIP_INTERVAL_MS);
    return () => clearInterval(t);
  }, [busy, firstPanelArrived, skeletons.length]);

  const cards = useMemo(() => {
    if (!busy) return realCards;
    // Phase 2: once the first panel lands, show the full planned set (real cards
    // supersede their skeletons in place; the rest keep shimmering).
    if (firstPanelArrived) return mergeWithSkeletons(realCards, skeletons);
    // Phase 1: reveal only the dripped-in slice of the skeletons.
    return skeletons.slice(0, dripCount);
  }, [busy, realCards, firstPanelArrived, skeletons, dripCount]);

  // Drop user-hidden cards from what the canvas actually renders. Applied HERE, at
  // the render layer — never at arrival detection (firstPanelArrived) — so hiding a
  // widget can't wedge the loading contract. Skeleton ids (`skeleton:*`) are never
  // in hiddenCards, so dripping skeletons are untouched; a real card superseding a
  // skeleton simply doesn't appear if the user has hidden it.
  const visibleCards = useMemo(
    () => cards.filter((c) => !isHidden(c.id)),
    [cards, isHidden]
  );

  // Merge the saved arrangement with the current card set: saved cards keep their
  // spot, new cards auto-place. Recompute when cards, the saved layout, or the
  // grid dimensions change.
  const placed = useMemo(
    () => placeCards(visibleCards, savedLayout, stacked),
    [visibleCards, savedLayout, stacked]
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

    // Preserve saved slots for cards that aren't in the grid right now. On reload
    // some cards hydrate asynchronously — the knowledge graph especially, whose
    // nodes restore a beat after the other cards. GridStack fires `change` for the
    // cards already present, and a naive save would drop the absent KG entry; when
    // its nodes then arrive it'd be treated as a brand-new card and dumped
    // full-width at the bottom (the bug this guards). Cards are never user-deleted
    // on the canvas (they mirror conversation state), so an id missing from the
    // current layout is loading, not gone — keep its saved position until it
    // actually renders and reports a real one.
    const present = new Set(real.map((item) => item.id));
    const carried = (savedLayout ?? []).filter(
      (item) => !item.id.startsWith("skeleton:") && !present.has(item.id)
    );
    const merged = [...real, ...carried];

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateSession.mutate({
        id: sessionId,
        patch: {
          ui_state: {
            activeWidget,
            tilesLayout: merged,
            tilesLayoutVersion: SCHEMA_VERSIONS.tilesLayout,
          },
        },
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
  // The mutation writes tilesLayout: [] (optimistically + deep-merged into the
  // cache, so `savedLayout` becomes [] this render and `placed` recomputes to the
  // auto-layout). The key bump only forces GridStack to rebuild from those fresh
  // positions — it must NOT also gate `placed`, or it would permanently pin the
  // canvas to the auto-layout and ignore drags saved after the first reset.
  const [resetTick, setResetTick] = useState(0);
  function resetLayout() {
    if (sessionId) {
      updateSession.mutate({
        id: sessionId,
        patch: {
          ui_state: {
            activeWidget,
            tilesLayout: [],
            tilesLayoutVersion: SCHEMA_VERSIONS.tilesLayout,
          },
        },
      });
    }
    setResetTick((t) => t + 1);
  }

  // The BigsailLoading animation overlays everything until the first real panel
  // lands — for the first ~10s it plays alone, then over the skeletons as they drip
  // in beneath it. It stops the instant a real panel arrives.
  const waitingForFirstPanel = busy && realCards.length === 0;
  const hasContent = visibleCards.length > 0;

  return (
    <div ref={hostRef} className="relative h-full w-full bg-surface">
      {/* Reset layout button hidden for now — wiring (resetLayout) kept intact.
      {hasContent && (
        <div className="absolute right-3 top-3 z-10">
          <Tooltip label="Reset the card arrangement to a fresh best-fit layout">
            <button
              type="button"
              onClick={resetLayout}
              aria-label="Reset the card arrangement to a fresh best-fit layout"
              className="rounded-full border border-border bg-surface/90 px-3 py-1 text-xs font-medium text-content-muted backdrop-blur-sm transition-colors hover:text-content"
            >
              Reset layout
            </button>
          </Tooltip>
        </div>
      )} */}

      {hasContent ? (
        <TilesCanvas
          key={`${sessionId ?? "none"}:${resetTick}`}
          placed={placed}
          onLayoutChange={persistLayout}
          onHide={hide}
          onDuplicate={duplicate}
        />
      ) : awaitingClarification ? (
        // Calm wait-on-user state — NOT the empty copy, NOT the gathering animation.
        // The clarifier question + tappable options live in the chat panel; here we
        // just signal that the canvas is poised to fill once the user aims it.
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="font-display text-base font-semibold text-content">
            Let's aim this first.
          </p>
          <p className="max-w-sm text-sm text-content-muted">
            Pick a direction in the chat and I'll compose the canvas around it —
            tables, charts, a timeline, images, the works.
          </p>
        </div>
      ) : !busy ? (
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
      ) : null}

      {/* Assembling-canvas animation, overlaid on the shimmering skeletons while
          the first real panel is still composing — it rides ON TOP of the
          skeletons (only a whisper of a backdrop so the placeholders pop in
          visibly underneath), not a wash that hides them. Pointer-events off so
          the cards underneath stay live. Clears the instant a real panel lands. */}
      {waitingForFirstPanel && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <BigsailLoading />
        </div>
      )}
    </div>
  );
}
