import { describe, expect, it } from "vitest";
import type { Card, CardCapability } from "./cards";
import type { CompositionPlan } from "./plan";
import {
  mergeWithSkeletons,
  planToSkeletons,
  SKELETON_FLOOR,
  SKELETON_FLOOR_COUNT,
} from "./skeletonCards";

const plan = (caps: CardCapability[]): CompositionPlan => ({
  intents: caps.map((capability) => ({ capability })),
  relationships: [],
});

const realCard = (type: CardCapability, id = `${type}:x`): Card => ({
  id,
  capabilityType: type,
  spec: {} as Card["spec"],
  sizeHint: { w: 100, h: 100 },
});

describe("planToSkeletons", () => {
  it("returns nothing for a null/empty plan", () => {
    expect(planToSkeletons(null)).toEqual([]);
    expect(planToSkeletons(plan([]))).toEqual([]);
  });

  it("makes one placeholder card per intent, in order", () => {
    const skels = planToSkeletons(plan(["table", "chart", "knowledge-graph"]));
    expect(skels).toHaveLength(3);
    expect(skels.every((s) => s.placeholder)).toBe(true);
    expect(skels.map((s) => s.capabilityType)).toEqual([
      "table",
      "chart",
      "knowledge-graph",
    ]);
  });

  it("gives stable, distinct ids to repeated capabilities", () => {
    const skels = planToSkeletons(plan(["chart", "chart"]));
    expect(skels.map((s) => s.id)).toEqual([
      "skeleton:chart:0",
      "skeleton:chart:1",
    ]);
    // Deterministic across calls.
    expect(planToSkeletons(plan(["chart", "chart"]))).toEqual(skels);
  });
});

describe("mergeWithSkeletons", () => {
  it("returns the real cards unchanged when there are no skeletons", () => {
    const real = [realCard("table")];
    expect(mergeWithSkeletons(real, [])).toBe(real);
  });

  it("keeps skeletons that have no real counterpart yet", () => {
    const real = [realCard("table")];
    const skels = planToSkeletons(plan(["table", "chart", "knowledge-graph"]));
    const merged = mergeWithSkeletons(real, skels);
    // Real table first, then the two still-pending skeletons.
    expect(
      merged.map((c) => [c.capabilityType, c.placeholder ?? false])
    ).toEqual([
      ["table", false],
      ["chart", true],
      ["knowledge-graph", true],
    ]);
  });

  it("drops a skeleton once a real card of that capability arrives", () => {
    const real = [realCard("table"), realCard("chart")];
    const skels = planToSkeletons(plan(["table", "chart"]));
    const merged = mergeWithSkeletons(real, skels);
    expect(merged).toHaveLength(2);
    expect(merged.every((c) => !c.placeholder)).toBe(true);
  });

  it("covers skeletons one-for-one per capability (two charts)", () => {
    const real = [realCard("chart", "chart:a")];
    const skels = planToSkeletons(plan(["chart", "chart"]));
    const merged = mergeWithSkeletons(real, skels);
    // One real chart covers one skeleton; the second chart skeleton remains.
    expect(merged).toHaveLength(2);
    expect(merged.filter((c) => c.placeholder)).toHaveLength(1);
  });
});

describe("SKELETON_FLOOR", () => {
  // The trailing shimmer floor BigsailWidget appends while a turn is still busy but
  // the plan is already fully covered, so the first arriving panel can never empty
  // the shimmer — only the end of the turn can. See the cards useMemo in
  // BigsailWidget.tsx.
  it("is a fixed set of placeholder cards of the floor count", () => {
    expect(SKELETON_FLOOR).toHaveLength(SKELETON_FLOOR_COUNT);
    expect(SKELETON_FLOOR.every((c) => c.placeholder)).toBe(true);
  });

  it("uses a high ordinal so its ids never collide with plan/pad skeletons", () => {
    // A plan can never reach a :900 ordinal in practice, so the floor ids stay
    // distinct from any real plan skeleton (no double-cover, no GridStack id clash).
    const planIds = new Set(
      planToSkeletons(plan(["table", "chart", "knowledge-graph"])).map(
        (s) => s.id
      )
    );
    expect(SKELETON_FLOOR.every((c) => !planIds.has(c.id))).toBe(true);
    expect(SKELETON_FLOOR.every((c) => c.id.endsWith(":900"))).toBe(true);
  });

  it("is stable across reads (module constant — same ids every render)", () => {
    // Id stability is what keeps GridStack from churning the trailing slot: the
    // reconcile is keyed on card.id, so identical ids each render are left in place.
    expect(SKELETON_FLOOR.map((c) => c.id)).toEqual(
      SKELETON_FLOOR.map((c) => c.id)
    );
  });
});
