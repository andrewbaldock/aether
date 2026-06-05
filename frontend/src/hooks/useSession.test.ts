import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "./useSession";

function mockFetchOnce(id: string) {
  return vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id }), { status: 200 })
    );
}

// Fresh client per test; retries off so create failures surface immediately.
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSession", () => {
  it("creates a session and returns its id", async () => {
    vi.stubGlobal("fetch", mockFetchOnce("session-1"));

    const { result } = renderHook(() => useSession("user-1"), {
      wrapper: makeWrapper(),
    });

    const id = await act(() => result.current.getOrCreateSession());

    expect(id).toBe("session-1");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns the same id on repeat calls without a second fetch", async () => {
    vi.stubGlobal("fetch", mockFetchOnce("session-2"));

    const { result } = renderHook(() => useSession("user-1"), {
      wrapper: makeWrapper(),
    });

    // First call — creates the session and flushes state.
    const first = await act(() => result.current.getOrCreateSession());

    // Second call — sessionId is now set in state; no fetch needed.
    const second = await act(() => result.current.getOrCreateSession());

    expect(first).toBe("session-2");
    expect(second).toBe("session-2");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("concurrent calls resolve to the same session without double-creating", async () => {
    vi.stubGlobal("fetch", mockFetchOnce("session-3"));

    const { result } = renderHook(() => useSession("user-1"), {
      wrapper: makeWrapper(),
    });

    const ids = await act(() =>
      Promise.all([
        result.current.getOrCreateSession(),
        result.current.getOrCreateSession(),
        result.current.getOrCreateSession(),
      ])
    );

    expect(ids.every((id) => id === "session-3")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("creates a new session after resetSession()", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "session-4a" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "session-4b" }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSession("user-1"), {
      wrapper: makeWrapper(),
    });

    const first = await act(() => result.current.getOrCreateSession());
    expect(first).toBe("session-4a");

    act(() => {
      result.current.resetSession();
    });

    const second = await act(() => result.current.getOrCreateSession());
    expect(second).toBe("session-4b");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
