import { describe, expect, it } from "vitest";
import { computeSavePayload, EMPTY_GOOD } from "./widgetSavePayload";

// The self-healing save floor: an empty live field is persisted as its last-good
// value, never as null, so a rebuild that clears-then-fails (or any transient empty
// state) can never overwrite real saved widgets.

const tableGood = [{ id: 1, spec: {} }];
const chartGood = [{ id: 2, spec: {} }];

describe("computeSavePayload", () => {
  it("persists live values when present", () => {
    const live = {
      table: tableGood,
      chart: chartGood,
      timeline: [],
      images: [],
    };
    const payload = computeSavePayload(live, EMPTY_GOOD);
    expect(payload).toEqual({
      table: tableGood,
      chart: chartGood,
      timeline: null,
      images: null,
    });
  });

  it("keeps last-good when a field momentarily goes empty (rebuild mid-flight)", () => {
    // Table just cleared to [] but chart still present; last-good has both.
    const lastGood = {
      table: tableGood,
      chart: chartGood,
      timeline: null,
      images: null,
    };
    const live = { table: [], chart: chartGood, timeline: [], images: [] };
    const payload = computeSavePayload(live, lastGood);
    // table is empty live → falls back to last-good, NOT null.
    expect(payload?.table).toEqual(tableGood);
    expect(payload?.chart).toEqual(chartGood);
  });

  it("returns null (skip the PUT) for a fresh, still-empty session", () => {
    const live = { table: [], chart: [], timeline: [], images: [] };
    expect(computeSavePayload(live, EMPTY_GOOD)).toBeNull();
  });

  it("protects even when everything went empty but last-good exists", () => {
    const lastGood = {
      table: tableGood,
      chart: null,
      timeline: null,
      images: null,
    };
    const live = { table: [], chart: [], timeline: [], images: [] };
    const payload = computeSavePayload(live, lastGood);
    // Not null — we must re-persist the last-good table rather than wipe it.
    expect(payload?.table).toEqual(tableGood);
  });
});
