import { act, renderHook, waitFor } from "@testing-library/react";
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
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-01T10:00:00Z",
  },
  {
    id: "s2",
    user_id: "user-1",
    title: "Second chat",
    graph_mode: true,
    model: null,
    created_at: "2026-06-02T10:00:00Z",
    updated_at: "2026-06-02T10:00:00Z",
  },
];

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

    const { result } = renderHook(() => useSessionList("user-1"));

    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/sessions?userId=user-1");
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

    renderHook(() => useSessionList("user id with spaces"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions?userId=user%20id%20with%20spaces"
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

    const { result } = renderHook(() => useSessionList("user-1"));

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

    const { result } = renderHook(() => useSessionList("user-1"));

    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    await act(async () => {
      result.current.refresh();
    });

    // Sessions unchanged, error logged
    await waitFor(() => expect(consoleSpy).toHaveBeenCalledTimes(1));
    expect(result.current.sessions).toHaveLength(1);
    consoleSpy.mockRestore();
  });
});
