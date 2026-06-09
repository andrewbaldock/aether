// Unit tests for the render_table payload validator. It must tolerate whatever a
// model emits: drop malformed columns/rows, reject specs with no usable columns,
// and never throw on bad JSON — a bad call should yield null, not crash the widget.

import { describe, expect, it } from "vitest";
import { parseTableSpec } from "./useTableState";

describe("parseTableSpec", () => {
  it("parses a well-formed spec", () => {
    const spec = parseTableSpec(
      JSON.stringify({
        title: "Planets",
        columns: [
          { key: "name", label: "Name" },
          { key: "moons", label: "Moons", type: "number" },
        ],
        rows: [
          { name: "Earth", moons: 1 },
          { name: "Mars", moons: 2 },
        ],
      })
    );
    expect(spec).not.toBeNull();
    expect(spec?.title).toBe("Planets");
    expect(spec?.columns).toHaveLength(2);
    expect(spec?.rows).toHaveLength(2);
  });

  it("returns null on invalid JSON", () => {
    expect(parseTableSpec("not json {")).toBeNull();
  });

  it("returns null when columns/rows are missing", () => {
    expect(parseTableSpec(JSON.stringify({ title: "x" }))).toBeNull();
  });

  it("returns null when no column is usable", () => {
    expect(
      parseTableSpec(JSON.stringify({ columns: [{ key: 1 }], rows: [] }))
    ).toBeNull();
  });

  it("drops malformed columns and non-object rows", () => {
    const spec = parseTableSpec(
      JSON.stringify({
        columns: [
          { key: "a", label: "A" },
          { key: "b" }, // missing label — dropped
        ],
        rows: [{ a: 1 }, "nope", null],
      })
    );
    expect(spec?.columns).toHaveLength(1);
    expect(spec?.rows).toHaveLength(1);
  });

  it("omits a non-string title", () => {
    const spec = parseTableSpec(
      JSON.stringify({
        title: 42,
        columns: [{ key: "a", label: "A" }],
        rows: [],
      })
    );
    expect(spec?.title).toBeUndefined();
  });
});
