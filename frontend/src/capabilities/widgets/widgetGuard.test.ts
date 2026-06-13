import { describe, expect, it } from "vitest";
import { hasSavedWidgets, isWidgetSnapshot } from "./widgetGuard";

const empty = { table: null, chart: null, timeline: null, images: null };

describe("isWidgetSnapshot", () => {
  it("accepts all-null (a session with nothing generated yet)", () => {
    expect(isWidgetSnapshot(empty)).toBe(true);
  });

  it("accepts arrays of entries that carry a spec", () => {
    expect(
      isWidgetSnapshot({
        ...empty,
        table: [{ id: 1, spec: { columns: [] } }],
      })
    ).toBe(true);
  });

  it("accepts empty arrays", () => {
    expect(isWidgetSnapshot({ ...empty, chart: [] })).toBe(true);
  });

  it("rejects a field that is neither null nor an array", () => {
    expect(isWidgetSnapshot({ ...empty, table: {} })).toBe(false);
  });

  it("rejects entries missing spec (drifted shape)", () => {
    expect(isWidgetSnapshot({ ...empty, chart: [{ id: 1 }] })).toBe(false);
  });

  it("rejects non-objects and arrays", () => {
    expect(isWidgetSnapshot(null)).toBe(false);
    expect(isWidgetSnapshot([])).toBe(false);
  });
});

describe("hasSavedWidgets", () => {
  it("is true when any provider has entries", () => {
    expect(
      hasSavedWidgets({ ...empty, images: [{ id: 1, spec: {} }] })
    ).toBe(true);
  });

  it("is false for all-null / all-empty", () => {
    expect(hasSavedWidgets(empty)).toBe(false);
    expect(hasSavedWidgets({ ...empty, table: [] })).toBe(false);
    expect(hasSavedWidgets(null)).toBe(false);
  });
});
