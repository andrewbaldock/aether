// Builds skeleton (placeholder) cards from the backend's composition plan, and
// merges them with the real cards as tool results arrive. This is the drip-feed
// seam: the planner names the capabilities a turn will produce BEFORE any tool
// runs, so we can paint the canvas's final shape immediately and swap each
// skeleton for its real card in place — no empty-spinner wait, no layout jump.

import {
  baseSizeHint,
  type Card,
  type CardCapability,
  type CardSpec,
} from "./cards";
import type { CompositionPlan } from "./plan";

// A typed-but-empty spec stand-in for a skeleton. The renderer never reads it
// (it branches on card.placeholder first), so an empty object is enough — it only
// satisfies the Card<spec> type. Cast at the single construction site below.
const EMPTY_SPEC = {} as CardSpec;

// One skeleton per plan intent, in plan order. Ids are stable per (capability,
// ordinal) so re-deriving the same plan yields the same skeleton ids — placement
// stays put across renders. The ordinal disambiguates two intents of one type
// (e.g. two charts). sizeHint is carried only so the skeleton satisfies the Card
// type AND so an images skeleton gets a sensible default slot height — placeCards
// is template-driven and ignores sizeHint for every other capability.
// One skeleton card for a capability, ordinal-numbered for a stable id.
function skeletonFor(capability: CardCapability, ordinal: number): Card {
  return {
    id: `skeleton:${capability}:${ordinal}`,
    capabilityType: capability,
    spec: EMPTY_SPEC,
    sizeHint: baseSizeHint(capability),
    placeholder: true,
  };
}

// Turn an ordered list of capabilities into skeleton cards (ordinal disambiguates
// repeats of one type). Shared by the plan path and the fallback floor.
function capabilitiesToSkeletons(capabilities: CardCapability[]): Card[] {
  const seen = new Map<CardCapability, number>();
  return capabilities.map((cap) => {
    const n = seen.get(cap) ?? 0;
    seen.set(cap, n + 1);
    return skeletonFor(cap, n);
  });
}

export function planToSkeletons(plan: CompositionPlan | null): Card[] {
  if (!plan || plan.intents.length === 0) return [];
  return capabilitiesToSkeletons(plan.intents.map((it) => it.capability));
}

// The canvas's preferred capability order. Drives both the fallback shape and the
// padding order below, so a thin plan grows along the same sensible sequence the
// no-plan floor uses (kg + timeline top row, then table, chart, images).
const CANVAS_CAPABILITY_ORDER: CardCapability[] = [
  "knowledge-graph",
  "timeline",
  "table",
  "chart",
  "images",
];

// The fallback skeleton shape used when a turn is composing but we have NO plan to
// shape it from — the plan event was empty, slow, or never arrived. The loading
// contract is "EVERY new-conversation load shows skeletons in real grid slots", so
// the canvas must NEVER sit on a bare spinner: we drip in a sensible generic shape
// (one of every capability — knowledge-graph + timeline top row, then table,
// chart, and images — so each lands in its own template slot and the drip keeps
// feeding rows the full length of the canvas, never stalling after two) so the
// user always sees the canvas assembling. These are superseded the instant ANY
// real card OR a real plan arrives, so an over-guess never persists or misleads.
export const FALLBACK_SKELETONS: Card[] = capabilitiesToSkeletons(
  CANVAS_CAPABILITY_ORDER
);

// The canvas must always assemble with a substantial shape: a thin plan (the Haiku
// planner sometimes returns just 1–2 intents) would otherwise drip in two skeletons
// and stall, leaving the canvas looking broken. Pad any skeleton set up to MIN_SKELETONS
// by appending distinct extra capabilities in CANVAS_CAPABILITY_ORDER — preferring
// capabilities the set doesn't already have so the padding spreads across template
// slots rather than stacking duplicates. Padded skeletons behave exactly like the
// fallback floor: a real card of that type supersedes them, and any with no real
// counterpart simply vanish when the turn settles (cards → realCards once !busy).
export const MIN_SKELETONS = 5;

export function padSkeletons(skeletons: Card[], min = MIN_SKELETONS): Card[] {
  if (skeletons.length >= min) return skeletons;
  const have = new Set(skeletons.map((s) => s.capabilityType));
  const padded = [...skeletons];

  // First pass: add capabilities not yet present, in canvas order.
  for (const cap of CANVAS_CAPABILITY_ORDER) {
    if (padded.length >= min) break;
    if (have.has(cap)) continue;
    have.add(cap);
    padded.push(skeletonFor(cap, 0));
  }
  // Still short (a request needing >5 of few types)? Cycle the order, bumping the
  // ordinal so each padded id stays unique and placement stays stable.
  let ordinal = 1;
  while (padded.length < min) {
    for (const cap of CANVAS_CAPABILITY_ORDER) {
      if (padded.length >= min) break;
      padded.push(skeletonFor(cap, ordinal));
    }
    ordinal++;
  }
  return padded;
}

// A small fixed set of TRAILING shimmer skeletons, shown while a turn is still in
// flight but every planned/padded skeleton has already been superseded by its real
// card. Without this the canvas drops to ZERO skeletons the instant the real cards
// cover the (often thin) plan — even though more panels are still streaming. The
// loading contract is "skeletons persist until the LAST panel pops in"; this floor
// keeps a couple shimmering ahead of the real cards until busy flips false, so the
// FIRST arriving panel can never clear the shimmer — only the end of the turn can.
//
// CRITICAL: these ids are FIXED for the whole turn (a high :ordinal namespace that
// can't collide with plan/pad skeletons), never derived from realCards count or
// arrival order. GridStack's id-keyed reconcile then adds them once and removes
// them once at turn end; a count that grew per-arrival would churn ids and flicker
// the trailing slot on every panel. They are appended AFTER mergeWithSkeletons (not
// fed through it) so a real card of their capability never instantly covers them —
// their whole point is "something generic is still coming."
const FLOOR_ORDINAL = 900;
export const SKELETON_FLOOR_COUNT = 2;
export const SKELETON_FLOOR: Card[] = CANVAS_CAPABILITY_ORDER.slice(
  0,
  SKELETON_FLOOR_COUNT
).map((cap) => skeletonFor(cap, FLOOR_ORDINAL));

// Merge real cards with plan skeletons so the canvas shows its final shape while
// tools are still running. Rule: a real card SUPERSEDES a pending skeleton of the
// same capability (one-for-one, in arrival order), and any skeleton with no real
// counterpart yet stays as a shimmer. Real cards come first, leftover skeletons
// behind — but note final placement is template-driven (placeCards buckets by
// capability into fixed slots), so this list order affects WHICH cards exist, not
// where they land; reordering within a capability doesn't move anything.
//
//   plan: [table, chart, chart, kg]   real so far: [table, chart]
//   → [realTable, realChart, skeletonChart, skeletonKg]
export function mergeWithSkeletons(real: Card[], skeletons: Card[]): Card[] {
  if (skeletons.length === 0) return real;

  // How many real cards exist per capability — that many skeletons are "covered"
  // and should be dropped.
  const realCountByType = new Map<CardCapability, number>();
  for (const c of real) {
    realCountByType.set(
      c.capabilityType,
      (realCountByType.get(c.capabilityType) ?? 0) + 1
    );
  }

  const remaining = new Map(realCountByType);
  const pending = skeletons.filter((s) => {
    const left = remaining.get(s.capabilityType) ?? 0;
    if (left > 0) {
      remaining.set(s.capabilityType, left - 1); // this skeleton is covered
      return false;
    }
    return true; // no real card for it yet → keep the shimmer
  });

  return [...real, ...pending];
}
