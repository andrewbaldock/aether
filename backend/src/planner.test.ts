import { describe, expect, it } from "bun:test";
import type { CompositionPlan } from "./planner";
import { mightNeedPlan, planPreamble } from "./planner";

describe("mightNeedPlan (router heuristic)", () => {
  it("skips short trivial turns", () => {
    expect(mightNeedPlan("what's 2+2")).toBe(false);
    expect(mightNeedPlan("thanks!")).toBe(false);
    expect(mightNeedPlan("who was Marie Curie")).toBe(false);
  });

  it("fires on explicit multi-capability shapes", () => {
    expect(
      mightNeedPlan(
        "compare the populations of France, Germany, and Spain and chart them"
      )
    ).toBe(true);
    expect(
      mightNeedPlan("give me a timeline of the Apollo program missions please")
    ).toBe(true);
  });

  it("fires on long multi-clause asks without an explicit shape word", () => {
    expect(
      mightNeedPlan(
        "I'd love to understand the history of the Roman empire, its major emperors, how the territory expanded, and the key turning points along the way"
      )
    ).toBe(true);
  });
});

describe("planPreamble", () => {
  it("renders intents and relationships as terse guidance", () => {
    const plan: CompositionPlan = {
      intents: [
        { capability: "chart", subject: "populations" },
        { capability: "table", subject: "country facts" },
      ],
      relationships: [{ from: 0, to: 1, label: "summarizes" }],
    };
    const text = planPreamble(plan);
    expect(text).toContain("chart of populations");
    expect(text).toContain("table of country facts");
    expect(text).toContain("chart summarizes table");
  });

  it("omits the relationships clause when there are none", () => {
    const plan: CompositionPlan = {
      intents: [{ capability: "timeline" }],
      relationships: [],
    };
    expect(planPreamble(plan)).not.toContain("Relationships:");
  });
});
