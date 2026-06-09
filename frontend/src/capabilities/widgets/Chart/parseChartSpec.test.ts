// Unit tests for the render_chart payload validator. It must tolerate whatever a
// model emits: reject an unknown chart type, a missing xKey, or specs with no
// usable series; drop malformed series/data; never throw on bad JSON.

import { describe, expect, it } from "vitest";
import { parseChartSpec } from "./useChartState";

describe("parseChartSpec", () => {
  it("parses a well-formed spec", () => {
    const spec = parseChartSpec(
      JSON.stringify({
        title: "Revenue",
        type: "bar",
        xKey: "quarter",
        data: [
          { quarter: "Q1", revenue: 10 },
          { quarter: "Q2", revenue: 14 },
        ],
        series: [{ key: "revenue", label: "Revenue" }],
      })
    );
    expect(spec).not.toBeNull();
    expect(spec?.type).toBe("bar");
    expect(spec?.series).toHaveLength(1);
    expect(spec?.data).toHaveLength(2);
  });

  it("returns null on invalid JSON", () => {
    expect(parseChartSpec("nope {")).toBeNull();
  });

  it("returns null for an unknown chart type", () => {
    expect(
      parseChartSpec(
        JSON.stringify({
          type: "donut",
          xKey: "x",
          data: [],
          series: [{ key: "y" }],
        })
      )
    ).toBeNull();
  });

  it("returns null when xKey is missing", () => {
    expect(
      parseChartSpec(
        JSON.stringify({ type: "line", data: [], series: [{ key: "y" }] })
      )
    ).toBeNull();
  });

  it("returns null when no series is usable", () => {
    expect(
      parseChartSpec(
        JSON.stringify({
          type: "line",
          xKey: "x",
          data: [],
          series: [{ label: "no key" }],
        })
      )
    ).toBeNull();
  });

  it("drops non-object data points", () => {
    const spec = parseChartSpec(
      JSON.stringify({
        type: "line",
        xKey: "x",
        data: [{ x: 1, y: 2 }, "bad", null],
        series: [{ key: "y" }],
      })
    );
    expect(spec?.data).toHaveLength(1);
  });
});
