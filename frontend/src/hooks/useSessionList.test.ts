import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "./useSessionList";
import { useSessionList } from "./useSessionList";

const SESSIONS: Session[] = [
  {
    id: "s1",
    user_id: "user-1",
    title: "First chat",
    graph_mode: true,
    model: null,
    ui_state: null,
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-01T10:00:00Z",
  },
  {
    id: "s2",
    user_id: "user-1",
    title: "Second chat",
    graph_mode: true,
    model: null,
    ui_state: null,
    created_at: "2026-06-02T10:00:00Z",
    updated_at: "2026-06-02T10:00:00Z",
  },
];

// A fresh client per test so cache state never leaks. Retries off so a failed
// fetch surfaces immediately (the real client retries 5xx to ride out cold starts);
// onError mirrors the production cache so error-logging assertions hold.
function makeWrapper() {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError: (err) => console.error(err),
    }),
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
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

describe("useSessionList", () => {
  it("fetches sessions on mount with the correct userId", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(SESSIONS), { status: 200 })
        )
    );

    const { result } = renderHook(() => useSessionList("user-1"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions?userId=user-1",
      undefined
    );
    expect(result.current.sessions[0]?.id).toBe("s1");
    expect(result.current.sessions[1]?.id).toBe("s2");
  });

  it("encodes special characters in userId", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    );

    renderHook(() => useSessionList("user id with spaces"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions?userId=user%20id%20with%20spaces",
      undefined
    );
  });

  it("refresh() re-fetches and updates sessions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([SESSIONS[0]]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SESSIONS), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSessionList("user-1"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("silently ignores a failed fetch and keeps previous sessions", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([SESSIONS[0]]), { status: 200 })
      )
      .mockResolvedValueOnce(new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSessionList("user-1"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    await act(async () => {
      result.current.refresh();
    });

    // Sessions unchanged (query keeps previous data on error), error logged.
    await waitFor(() => expect(consoleSpy).toHaveBeenCalledTimes(1));
    expect(result.current.sessions).toHaveLength(1);
    consoleSpy.mockRestore();
  });
});
