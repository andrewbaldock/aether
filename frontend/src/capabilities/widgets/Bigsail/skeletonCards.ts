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
// (e.g. two charts).
export function planToSkeletons(plan: CompositionPlan | null): Card[] {
  if (!plan || plan.intents.length === 0) return [];
  const seen = new Map<CardCapability, number>();
  return plan.intents.map((intent) => {
    const n = seen.get(intent.capability) ?? 0;
    seen.set(intent.capability, n + 1);
    return {
      id: `skeleton:${intent.capability}:${n}`,
      capabilityType: intent.capability,
      spec: EMPTY_SPEC,
      sizeHint: baseSizeHint(intent.capability),
      placeholder: true,
    };
  });
}

// Merge real cards with plan skeletons so the canvas shows its final shape while
// tools are still running. Rule: a real card SUPERSEDES a pending skeleton of the
// same capability (one-for-one, in arrival order), and any skeleton with no real
// counterpart yet stays as a shimmer. Real cards keep their order first (so the
// masonry matches the un-planned path exactly once everything has landed), then
// leftover skeletons fill in behind.
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
