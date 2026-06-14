import { describe, expect, it } from "bun:test";
import type { CompositionPlan } from "./planner";
import {
  mightClarify,
  mightNeedPlan,
  parseClarify,
  parsePlan,
  planPreamble,
} from "./planner";

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

describe("mightClarify (clarifier gate)", () => {
  it("fires on the short, broad questions mightNeedPlan SKIPS", () => {
    // The whole point: the clarifier targets exactly the thin asks the plan gate
    // bails on (its <40-char rule), because those are the explodable ones.
    expect(mightNeedPlan("how many kinds of art are there?")).toBe(false);
    expect(mightClarify("how many kinds of art are there?")).toBe(true);
    expect(mightClarify("tell me about music")).toBe(true);
  });

  it("skips greetings and acknowledgements", () => {
    expect(mightClarify("hi")).toBe(false);
    expect(mightClarify("thanks!")).toBe(false);
    expect(mightClarify("ok")).toBe(false);
    expect(mightClarify("yep")).toBe(false);
  });

  it("skips trivially-closed arithmetic with one right answer", () => {
    expect(mightClarify("2+2")).toBe(false);
    expect(mightClarify("what's 12 * 7?")).toBe(false);
    expect(mightClarify("   ")).toBe(false);
  });
});

describe("parseClarify", () => {
  it("parses a well-formed clarify object", () => {
    const clarify = parseClarify(
      '{"clarify":{"question":"Which tradition?","options":["Western","East Asian","African"]}}'
    );
    expect(clarify).toEqual({
      question: "Which tradition?",
      options: ["Western", "East Asian", "African"],
    });
  });

  it("extracts clarify JSON from a prose/fenced reply", () => {
    const raw =
      'Sure:\n```json\n{"clarify":{"question":"Which era?","options":["Ancient","Modern"]}}\n```';
    expect(parseClarify(raw)).toEqual({
      question: "Which era?",
      options: ["Ancient", "Modern"],
    });
  });

  it("drops blank options and caps at 4", () => {
    const clarify = parseClarify(
      '{"clarify":{"question":"Pick","options":["a","","b","c","d","e"]}}'
    );
    expect(clarify?.options).toEqual(["a", "b", "c", "d"]);
  });

  it("returns null when there are fewer than two concrete options", () => {
    expect(
      parseClarify('{"clarify":{"question":"Pick","options":["only one"]}}')
    ).toBeNull();
    expect(
      parseClarify('{"clarify":{"question":"Pick","options":[]}}')
    ).toBeNull();
  });

  it("returns null when the question is missing or blank", () => {
    expect(
      parseClarify('{"clarify":{"question":"  ","options":["a","b"]}}')
    ).toBeNull();
    expect(parseClarify('{"clarify":{"options":["a","b"]}}')).toBeNull();
  });

  it("returns null for a plain plan reply (no clarify key)", () => {
    expect(
      parseClarify('{"intents":[{"capability":"table"}],"relationships":[]}')
    ).toBeNull();
    expect(parseClarify("not json")).toBeNull();
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
