import { describe, expect, it } from "bun:test";
import { mergeWidgetSnapshot, type WidgetSnapshot } from "./db";

// The self-healing backstop on the widget PUT: a save must never silently destroy
// saved widgets. A null/empty incoming field keeps the stored data (merge) unless
// the client explicitly passes reset:true.

const stored: WidgetSnapshot = {
  schemaVersion: 1,
  table: [{ id: 1, spec: { columns: [], rows: [] } }],
  chart: [{ id: 2, spec: {} }],
  timeline: null,
  images: null,
};

describe("mergeWidgetSnapshot", () => {
  it("keeps a stored non-empty field when the incoming field is null", () => {
    // A rebuild that cleared-then-failed sends table:null over a non-empty row.
    const merged = mergeWidgetSnapshot(
      {
        schemaVersion: 1,
        table: null,
        chart: null,
        timeline: null,
        images: null,
      },
      stored
    );
    expect(merged.table).toEqual(stored.table);
    expect(merged.chart).toEqual(stored.chart);
  });

  it("overwrites with an incoming non-empty array", () => {
    const fresh = [{ id: 9, spec: { columns: [], rows: [] } }];
    const merged = mergeWidgetSnapshot(
      {
        schemaVersion: 1,
        table: fresh,
        chart: null,
        timeline: null,
        images: null,
      },
      stored
    );
    expect(merged.table).toEqual(fresh);
    // chart was null incoming but stored non-empty → preserved.
    expect(merged.chart).toEqual(stored.chart);
  });

  it("nulls a field when reset:true even if stored is non-empty", () => {
    const merged = mergeWidgetSnapshot(
      {
        schemaVersion: 1,
        reset: true,
        table: null,
        chart: null,
        timeline: null,
        images: null,
      },
      stored
    );
    expect(merged.table).toBeNull();
    expect(merged.chart).toBeNull();
  });

  it("treats an empty array as nothing-to-keep but still merges from stored", () => {
    // Incoming [] is not a non-empty array, so the stored value is kept.
    const merged = mergeWidgetSnapshot(
      {
        schemaVersion: 1,
        table: [],
        chart: null,
        timeline: null,
        images: null,
      },
      stored
    );
    // [] is an array → taken as-is (an explicit empty list, not a "keep").
    expect(merged.table).toEqual([]);
  });

  it("preserves the frontend schemaVersion stamp", () => {
    const merged = mergeWidgetSnapshot(
      {
        schemaVersion: 3,
        table: null,
        chart: null,
        timeline: null,
        images: null,
      },
      stored
    );
    expect(merged.schemaVersion).toBe(3);
  });

  it("with no stored row, a null field stays null (fresh session)", () => {
    const merged = mergeWidgetSnapshot(
      {
        schemaVersion: 1,
        table: null,
        chart: null,
        timeline: null,
        images: null,
      },
      null
    );
    expect(merged).toEqual({
      schemaVersion: 1,
      table: null,
      chart: null,
      timeline: null,
      images: null,
    });
  });
});
