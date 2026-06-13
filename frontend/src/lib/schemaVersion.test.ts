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
  it("returns the payload for a current-version blob that passes the guard", () => {
    const raw = stamp("graph", { foo: 1 });
    expect(validate("graph", raw, isFoo)).toEqual(raw);
  });

  it("round-trips a stamped blob", () => {
    const raw = stamp("widgets", { foo: 7 });
    expect(validate("widgets", raw, isFoo)).not.toBeNull();
  });

  it("returns null when the schemaVersion is missing", () => {
    expect(validate("graph", { foo: 1 }, isFoo)).toBeNull();
  });

  it("returns null for an older version", () => {
    expect(
      validate("graph", { foo: 1, schemaVersion: SCHEMA_VERSIONS.graph - 1 }, isFoo)
    ).toBeNull();
  });

  it("returns null for a NaN / non-numeric version", () => {
    expect(validate("graph", { foo: 1, schemaVersion: "1" }, isFoo)).toBeNull();
    expect(validate("graph", { foo: 1, schemaVersion: NaN }, isFoo)).toBeNull();
  });

  it("returns null when the version matches but the shape guard fails", () => {
    expect(
      validate("graph", { schemaVersion: SCHEMA_VERSIONS.graph }, isFoo)
    ).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(validate("graph", null, isFoo)).toBeNull();
    expect(validate("graph", undefined, isFoo)).toBeNull();
    expect(validate("graph", 42, isFoo)).toBeNull();
  });
});
