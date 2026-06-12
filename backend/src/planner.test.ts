import { describe, expect, it } from "bun:test";
import type { CompositionPlan } from "./planner";
import { mightNeedPlan, parsePlan, planPreamble } from "./planner";

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

describe("parsePlan", () => {
  it("parses a clean JSON object", () => {
    const plan = parsePlan(
      '{"intents":[{"capability":"chart","subject":"populations"}],"relationships":[]}'
    );
    expect(plan).toEqual({
      intents: [{ capability: "chart", subject: "populations" }],
      relationships: [],
    });
  });

  it("extracts JSON from a ```json fenced / prose-wrapped reply", () => {
    const raw =
      'Sure! Here is the plan:\n```json\n{"intents":[{"capability":"timeline"}],"relationships":[]}\n```';
    expect(parsePlan(raw)).toEqual({
      intents: [{ capability: "timeline" }],
      relationships: [],
    });
  });

  it("drops intents with an invalid capability but keeps the rest", () => {
    const plan = parsePlan(
      '{"intents":[{"capability":"3d-scene"},{"capability":"table"}],"relationships":[]}'
    );
    expect(plan).toEqual({
      intents: [{ capability: "table" }],
      relationships: [],
    });
  });

  it("drops self-referential and out-of-range relationships", () => {
    const plan = parsePlan(
      '{"intents":[{"capability":"chart"},{"capability":"table"}],"relationships":[{"from":0,"to":0},{"from":0,"to":5},{"from":0,"to":1,"label":"summarizes"}]}'
    );
    expect(plan?.relationships).toEqual([
      { from: 0, to: 1, label: "summarizes" },
    ]);
  });

  it("returns null when intents is empty (nothing to compose)", () => {
    expect(parsePlan('{"intents":[],"relationships":[]}')).toBeNull();
  });

  it("returns null on non-JSON instead of throwing", () => {
    expect(parsePlan("I can't help with that.")).toBeNull();
    expect(parsePlan("")).toBeNull();
  });
});
