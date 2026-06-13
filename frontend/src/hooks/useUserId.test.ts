import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserId } from "./useUserId";

// Install our OWN in-memory localStorage before each test rather than relying on
// jsdom to provide one. jsdom doesn't always expose a global `localStorage`
// (depends on the jsdom version / how the environment is created under bun), which
// made this suite fail intermittently with "Cannot read properties of undefined
// (reading 'clear')". Owning the stub makes the test deterministic regardless of
// environment — it tests the hook's persistence logic, not the runtime's storage.
function createLocalStorageStub(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear: () => {
      store = {};
    },
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageStub());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
