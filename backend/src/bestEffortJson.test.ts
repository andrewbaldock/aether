import { describe, expect, it } from "bun:test";
import { closeTruncatedJson, parseBestEffort } from "./bestEffortJson";

describe("closeTruncatedJson", () => {
  it("leaves already-valid JSON parseable", () => {
    const valid = '{"rows":[{"a":1},{"a":2}]}';
    expect(JSON.parse(closeTruncatedJson(valid))).toEqual({
      rows: [{ a: 1 }, { a: 2 }],
    });
  });

  it("closes an array truncated mid-stream and keeps complete elements", () => {
    // Cut off partway through writing the third object.
    const truncated = '{"rows":[{"a":1},{"a":2},{"a":';
    const parsed = parseBestEffort(truncated) as { rows: unknown[] };
    expect(parsed.rows).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("drops a dangling separator before closing", () => {
    const truncated = '{"items":[{"id":"x"},';
    const parsed = parseBestEffort(truncated) as { items: unknown[] };
    expect(parsed.items).toEqual([{ id: "x" }]);
  });

  it("closes a truncated string value's container", () => {
    // String cut off mid-value — the incomplete string element is dropped, the
    // array and object are closed around what completed.
    const truncated = '{"entities":[{"id":"a","label":"Alpha"},{"id":"b","lab';
    const parsed = parseBestEffort(truncated) as { entities: unknown[] };
    expect(parsed.entities).toEqual([{ id: "a", label: "Alpha" }]);
  });

  it("handles nested arrays/objects", () => {
    const truncated =
      '{"series":[{"key":"s1"}],"data":[{"x":1,"y":2},{"x":3,"y":';
    const parsed = parseBestEffort(truncated) as {
      series: unknown[];
      data: unknown[];
    };
    expect(parsed.series).toEqual([{ key: "s1" }]);
    expect(parsed.data).toEqual([{ x: 1, y: 2 }]);
  });

  it("does not mistake brackets inside strings for structure", () => {
    const truncated = '{"rows":[{"note":"a [b] {c}"},{"note":"next';
    const parsed = parseBestEffort(truncated) as { rows: unknown[] };
    expect(parsed.rows).toEqual([{ note: "a [b] {c}" }]);
  });
});

describe("parseBestEffort", () => {
  it("returns undefined for unsalvageable garbage", () => {
    expect(parseBestEffort("not json at all")).toBeUndefined();
  });

  it("never throws", () => {
    expect(() => parseBestEffort('{"x":')).not.toThrow();
    expect(() => parseBestEffort("")).not.toThrow();
  });
});
