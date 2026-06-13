import { describe, expect, it } from "vitest";
import { SCHEMA_VERSIONS, stamp, validate } from "./schemaVersion";

// A trivial guard for these tests — the real per-tool guards are tested
// alongside their tools.
function isFoo(v: unknown): v is { foo: number } {
  return !!v && typeof v === "object" && "foo" in v;
}

describe("stamp", () => {
  it("adds the tool's current schemaVersion to the payload", () => {
    expect(stamp("graph", { nodes: [], links: [] })).toEqual({
      nodes: [],
      links: [],
      schemaVersion: SCHEMA_VERSIONS.graph,
    });
  });
});

describe("validate", () => {
  it("returns the payload, not stale, for a current-version blob", () => {
    const raw = stamp("graph", { foo: 1 });
    expect(validate("graph", raw, isFoo)).toEqual({ data: raw, stale: false });
  });

  it("round-trips a stamped blob", () => {
    const raw = stamp("widgets", { foo: 7 });
    expect(validate("widgets", raw, isFoo).data).not.toBeNull();
  });

  // The version is advisory: a usable shape always renders. A stale/missing/
  // non-numeric stamp flags `stale: true` (→ caller heals) but never discards.
  it("renders data with stale=true when the schemaVersion is missing", () => {
    const raw = { foo: 1 };
    expect(validate("graph", raw, isFoo)).toEqual({ data: raw, stale: true });
  });

  it("renders data with stale=true for an older version", () => {
    const raw = { foo: 1, schemaVersion: SCHEMA_VERSIONS.graph - 1 };
    expect(validate("graph", raw, isFoo)).toEqual({ data: raw, stale: true });
  });

  it("renders data with stale=true for a NaN / non-numeric version", () => {
    expect(validate("graph", { foo: 1, schemaVersion: "1" }, isFoo).stale).toBe(
      true
    );
    expect(validate("graph", { foo: 1, schemaVersion: NaN }, isFoo).stale).toBe(
      true
    );
  });

  // The shape guard is the ONLY thing that discards.
  it("returns data=null when the shape guard fails (even at current version)", () => {
    expect(
      validate("graph", { schemaVersion: SCHEMA_VERSIONS.graph }, isFoo)
    ).toEqual({ data: null, stale: false });
  });

  it("returns data=null for non-object input", () => {
    expect(validate("graph", null, isFoo).data).toBeNull();
    expect(validate("graph", undefined, isFoo).data).toBeNull();
    expect(validate("graph", 42, isFoo).data).toBeNull();
  });
});
