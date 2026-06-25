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
import {
  FALLBACK_SKELETONS,
  mergeWithSkeletons,
  padSkeletons,
  planToSkeletons,
  SKELETON_FLOOR,
  SKELETON_FLOOR_COUNT,
} from "./skeletonCards";
import { TilesCanvas } from "./TilesCanvas";
import {
  placeCards,
  STACK_BREAKPOINT_PX,
  STACK_HYSTERESIS_PX,
  type TilesLayoutItem,
} from "./tilesLayout";
import { useCardDuplicate } from "./useCardDuplicate";
import { useHiddenCards } from "./useHiddenCards";

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
  const { userId, sessionId, sessions, messages, consumeColdUrlLoad } =
    useSessionContext();
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
  // layout is positioning-only and placeCards clamps each item to the grid. But a
  // stale/missing version stamp means the geometry was saved against an OLD grid
  // (early layouts used a narrower column count, so full-width was w:8 not w:24) —
  // honored verbatim by System 2 that renders as ~⅓-width cards squished at x:0.
  // clamp() only stops x+w overflow; it can't rescale to today's GRID_COLUMNS. So a
  // mismatched stamp is discarded (treated as no saved layout) → System 1 rebuilds
  // the canvas fresh, exactly like Reset (no content lost, only the arrangement),
  // and the rebuild persists the current stamp so it self-heals. Current-stamp
  // layouts pass through untouched.
  const savedLayout =
    currentSession?.ui_state?.tilesLayoutVersion === SCHEMA_VERSIONS.tilesLayout
      ? currentSession?.ui_state?.tilesLayout
      : undefined;

  // Measure the panel only to decide the skinny breakpoint. The grid is always
  // 24 columns; below the breakpoint cards collapse to full-width stacked, above
  // it they reflow to their true fractional layout. Re-measures on resize.
  // The breakpoint decision is HYSTERETIC, not a bare width compare. A bare compare
  // here flipped `stacked` every time the measured width jittered across 560px — and
  // it jitters by exactly the scrollbar gutter, because the stacked layout is taller
  // and toggles the vertical scrollbar that shrinks the measured width. That feedback
  // loop (flip → relayout → scrollbar toggles → width re-crosses → flip) blew React's
  // update-depth limit (#185) and whited out the page on resize. Only stack below
  // 560-margin and only un-stack above 560+margin, so the gutter jitter can't ping-pong.
  const hostRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const w = entry.contentRect.width;
      if (w === 0) return; // unmounted/hidden — don't unstack to a phantom 0 width
      setStacked((prev) =>
        prev
          ? w < STACK_BREAKPOINT_PX + STACK_HYSTERESIS_PX // stacked: stay until clearly wide
          : w < STACK_BREAKPOINT_PX - STACK_HYSTERESIS_PX // wide: stack only when clearly narrow
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // Deliberate restore-loading sequence on a COLD URL/refresh load. The canvas
  // hydrates from the DB instantly, so without this the loading flourish never
  // plays on a shared/refreshed link. When RouteBootstrap flags a cold load, we
  // hold the gathering animation + the full generic skeleton set (all at once, no
  // drip) for a minimum window, then reveal the real cards in one swap. This is a
  // frontend-only mode, deliberately separate from the live-turn loading contract
  // (useAgentBusy / the composition plan) — the two never share state.
  const RESTORE_MIN_MS = 3500; // hold the sequence at least this long
  const RESTORE_MAX_MS = 8000; // ...but never pin the canvas if data stalls
  const [restoreLoading, setRestoreLoading] = useState(() =>
    consumeColdUrlLoad()
  );
  const [restoreMinElapsed, setRestoreMinElapsed] = useState(false);
  useEffect(() => {
    if (!restoreLoading) return;
    const min = setTimeout(() => setRestoreMinElapsed(true), RESTORE_MIN_MS);
    // Hard cap: release regardless of data so an empty/slow hydrate can't hang.
    const cap = setTimeout(() => setRestoreLoading(false), RESTORE_MAX_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(cap);
    };
  }, [restoreLoading]);
  // Exit once the minimum has elapsed AND the real cards are present — whichever is
  // later. A live turn starting mid-restore (busy) abandons the sequence so the two
  // loading paths never fight.
  useEffect(() => {
    if (!restoreLoading) return;
    if (busy) {
      setRestoreLoading(false);
      return;
    }
    if (restoreMinElapsed && firstPanelArrived) setRestoreLoading(false);
  }, [restoreLoading, restoreMinElapsed, firstPanelArrived, busy]);

  // Fallback floor: a turn can be composing with NO plan to shape it (the plan event
  // was empty, slow, or never arrived). The loading contract says the canvas must
  // never sit on a bare spinner, so after a short grace we drip in a generic shape.
  // The grace exists so a quick TEXT-ONLY turn ("what's 2+2") — which also has no
  // plan and no cards — never flashes skeletons that would never fill. As soon as a
  // real plan or a real card arrives, the fallback is moot (planSkeletons/realCards
  // take over below). Reset whenever we're not in the bare-waiting state.
  const FALLBACK_GRACE_MS = 1200;
  const [fallbackEngaged, setFallbackEngaged] = useState(false);
  const bareWaiting = busy && !firstPanelArrived && planSkeletons.length === 0;
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
  // no skeletons). The plan path always wins over the fallback. Either way we pad up
  // to MIN_SKELETONS so a thin plan (Haiku sometimes returns 1–2 intents) still
  // assembles a full canvas instead of dripping two skeletons and stalling — the
  // padded extras drip in one-at-a-time like the rest and vanish if no real card
  // supersedes them. (FALLBACK_SKELETONS is already 5, so padding is a no-op there.)
  const skeletons = useMemo(() => {
    if (planSkeletons.length > 0) return padSkeletons(planSkeletons);
    if (fallbackEngaged) return padSkeletons(FALLBACK_SKELETONS);
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
    // Cold-load restore: show the full generic skeleton set all at once (no drip,
    // no merge) until the sequence releases — then the real cards take over below.
    if (restoreLoading) return FALLBACK_SKELETONS;
    if (!busy) return realCards;
    // Phase 2: once the first panel lands, show the full planned set — real cards
    // supersede their skeletons in place; the rest keep shimmering. But the merge
    // covers skeletons one-for-one per capability, so a thin/accurate plan can be
    // fully covered while the turn is STILL streaming more panels — which would
    // empty the shimmer the instant the first panel arrived. Keep a small fixed-id
    // floor of trailing skeletons whenever the merge runs short, so the shimmer
    // only clears when the LAST panel lands (busy → false, handled above), never on
    // the first. The floor is appended after the merge (not fed through it) so a
    // real card never instantly covers it.
    if (firstPanelArrived) {
      const merged = mergeWithSkeletons(realCards, skeletons);
      const pending = merged.length - realCards.length; // skeletons still shimmering
      if (pending >= SKELETON_FLOOR_COUNT) return merged;
      return [
        ...merged,
        ...SKELETON_FLOOR.slice(0, SKELETON_FLOOR_COUNT - pending),
      ];
    }
    // Phase 1: reveal only the dripped-in slice of the skeletons.
    return skeletons.slice(0, dripCount);
  }, [
    restoreLoading,
    busy,
    realCards,
    firstPanelArrived,
    skeletons,
    dripCount,
  ]);

  // Drop user-hidden cards from what the canvas actually renders. Applied HERE, at
  // the render layer — never at arrival detection (firstPanelArrived) — so hiding a
  // widget can't wedge the loading contract. Skeleton ids (`skeleton:*`) are never
  // in hiddenCards, so dripping skeletons are untouched; a real card superseding a
  // skeleton simply doesn't appear if the user has hidden it.
  const visibleCards = useMemo(
    () => cards.filter((c) => !isHidden(c.id)),
    [cards, isHidden]
  );

  // Merge the saved arrangement with the current card set (plan 011, two systems). If
  // this conversation has no saved layout yet, placeCards runs System 1 (the template)
  // to build the canvas once; otherwise System 2 honors every saved slot verbatim and
  // just appends any new card at the bottom (GridStack float:false floats it up). No
  // streaming/reading mode flag is needed anymore — the saved layout itself is the
  // signal. Recompute when cards, the saved layout, or the grid width changes.
  const placed = useMemo(
    () => placeCards(visibleCards, savedLayout, stacked),
    [visibleCards, savedLayout, stacked]
  );

  // Debounced persistence of the grid arrangement. Keep the latest activeWidget
  // alongside so the optimistic cache write doesn't drop it (the backend merges
  // too, but this avoids a flash before the refetch).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeWidget = currentSession?.ui_state?.activeWidget ?? null;
  function persistLayout(layout: TilesLayoutItem[], fromUser: boolean) {
    if (!sessionId) return;
    // System 1 until the user touches a card. A programmatic layout change (streaming
    // packing, gravity reflow, reconcile sync) must NOT persist — auto-saving the first
    // streamed panel mid-build is what used to flip the canvas into System 2 too early
    // and dump later panels at the bottom (the empty-top-left bug). Only a real user
    // drag/resize (fromUser) commits the arrangement and hands off to System 2;
    // thereafter (savedLayout non-empty) reflows persist normally.
    const inSystem2 = (savedLayout?.length ?? 0) > 0;
    if (!fromUser && !inSystem2) return;
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
  // in beneath it. It stops the instant a real panel arrives. It also plays for the
  // whole cold-load restore sequence (over the all-at-once skeletons).
  const waitingForFirstPanel = busy && realCards.length === 0;
  const showLoadingOverlay = waitingForFirstPanel || restoreLoading;
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
          // Don't persist the transient restore skeletons' positions — they vanish
          // when the sequence releases. (persistLayout already strips skeleton ids,
          // but skipping the write entirely avoids a spurious debounced no-op.)
          onLayoutChange={restoreLoading ? () => {} : persistLayout}
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
      {showLoadingOverlay && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <BigsailLoading />
        </div>
      )}
    </div>
  );
}
