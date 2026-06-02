import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserId } from "./useUserId";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe("useUserId", () => {
  it("returns a valid UUID", () => {
    const { result } = renderHook(() => useUserId());
    expect(result.current).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("persists the same id across hook re-renders", () => {
    const { result, rerender } = renderHook(() => useUserId());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("returns the same id in a fresh hook instance (localStorage persistence)", () => {
    const { result: a } = renderHook(() => useUserId());
    const { result: b } = renderHook(() => useUserId());
    expect(b.current).toBe(a.current);
  });

  it("creates a new id when localStorage is cleared", () => {
    const { result: a } = renderHook(() => useUserId());
    localStorage.clear();
    const { result: b } = renderHook(() => useUserId());
    expect(b.current).not.toBe(a.current);
  });
});
