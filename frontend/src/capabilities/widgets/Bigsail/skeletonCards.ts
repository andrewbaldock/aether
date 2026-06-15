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

// The fallback skeleton shape used when a turn is composing but we have NO plan to
// shape it from — the plan event was empty, slow, or never arrived. The loading
// contract is "EVERY new-conversation load shows skeletons in real grid slots", so
// the canvas must NEVER sit on a bare spinner: we drip in a sensible generic shape
// (a table + a chart, the two most common composites) so the user always sees the
// canvas assembling. These are superseded the instant ANY real card OR a real plan
// arrives, so an over-guess never persists or misleads.
export const FALLBACK_SKELETONS: Card[] = capabilitiesToSkeletons([
  "table",
  "chart",
]);

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
