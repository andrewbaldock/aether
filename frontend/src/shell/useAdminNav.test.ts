import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminNav } from "./useAdminNav";

// useAdminNav reads the active session id from SessionContext; stub it so we don't
// stand up the whole provider. Each test sets the sessionId it needs.
let mockSessionId: string | null = null;
vi.mock("./SessionContext", () => ({
  useSessionContext: () => ({ sessionId: mockSessionId }),
}));

beforeEach(() => {
  mockSessionId = null;
  window.history.replaceState(null, "", "/");
});
afterEach(() => vi.restoreAllMocks());

describe("useAdminNav", () => {
  it("isActive reflects whether the URL is this admin page", () => {
    window.history.replaceState(null, "", "/settings");
    const { result } = renderHook(() => useAdminNav("settings"));
    expect(result.current.isActive).toBe(true);

    const { result: welcome } = renderHook(() => useAdminNav("welcome"));
    expect(welcome.current.isActive).toBe(false);
  });

  it("activate() opens the admin page when not already there", () => {
    window.history.replaceState(null, "", "/c/abc");
    const { result } = renderHook(() => useAdminNav("settings"));
    act(() => result.current.activate());
    expect(window.location.pathname).toBe("/settings");
  });

  it("activate() turns the page off (back to prior entry) when already active", async () => {
    // Build history: /c/abc → openAdminPage('/settings'), then activate again.
    window.history.replaceState(null, "", "/c/abc");
    const { result } = renderHook(() => useAdminNav("settings"));
    act(() => result.current.activate()); // open
    expect(window.location.pathname).toBe("/settings");

    // Re-render so the hook sees the new (admin) route, then turn off.
    const { result: r2 } = renderHook(() => useAdminNav("settings"));
    const back = new Promise<void>((resolve) =>
      window.addEventListener("popstate", () => resolve(), { once: true })
    );
    act(() => r2.current.activate()); // turn off
    await back;
    expect(window.location.pathname).toBe("/c/abc");
  });

  it("turn-off falls back to /c/:id when there's no prior entry (deep link)", () => {
    mockSessionId = "abc";
    window.history.replaceState(null, "", "/settings");
    const { result } = renderHook(() => useAdminNav("settings"));
    act(() => result.current.activate()); // turn off, no marked prior entry
    expect(window.location.pathname).toBe("/c/abc");
  });

  it("turn-off falls back to / when there's no session", () => {
    mockSessionId = null;
    window.history.replaceState(null, "", "/settings");
    const { result } = renderHook(() => useAdminNav("settings"));
    act(() => result.current.activate());
    expect(window.location.pathname).toBe("/");
  });
});
