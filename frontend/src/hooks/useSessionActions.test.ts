import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { act, createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionActions } from "./useSessionActions";

const USER = "user-1";
const SESSION = "sess-1";

// fetch is hit twice per loadSession: GET /messages and GET /sessions/:id. Return
// an empty message list and a session owned by USER (so it doesn't fork).
function stubFetchForLoad(ownerId = USER) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/messages")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(
        JSON.stringify({ id: SESSION, user_id: ownerId, ui_state: null }),
        { status: 200 }
      );
    })
  );
}

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

function renderActions() {
  const switchSession = vi.fn();
  const startNewConversation = vi.fn();
  const { result } = renderHook(
    () =>
      useSessionActions({
        userId: USER,
        sessionId: null,
        switchSession,
        startNewConversation,
      }),
    { wrapper: makeWrapper() }
  );
  return { result, switchSession };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});
afterEach(() => vi.restoreAllMocks());

describe("useSessionActions.loadSession — view preservation", () => {
  it("preserves a deep-linked /:view when the URL already points at this session", async () => {
    stubFetchForLoad();
    // Simulate landing on a shared deep link to a specific tab.
    window.history.replaceState(null, "", `/c/${SESSION}/chart`);
    const { result, switchSession } = renderActions();

    await act(async () => {
      await result.current.loadSession(SESSION);
    });

    expect(switchSession).toHaveBeenCalledWith(SESSION, []);
    // The chart tab segment survives the load.
    expect(window.location.pathname).toBe(`/c/${SESSION}/chart`);
  });

  it("maps the knowledge-graph slug through unchanged", async () => {
    stubFetchForLoad();
    window.history.replaceState(null, "", `/c/${SESSION}/graph`);
    const { result } = renderActions();
    await act(async () => {
      await result.current.loadSession(SESSION);
    });
    expect(window.location.pathname).toBe(`/c/${SESSION}/graph`);
  });

  it("falls back to the bare /c/:id when switching from a different URL", async () => {
    stubFetchForLoad();
    // We're on some OTHER session's tab; loading SESSION should not inherit it.
    window.history.replaceState(null, "", "/c/other/chart");
    const { result } = renderActions();
    await act(async () => {
      await result.current.loadSession(SESSION);
    });
    expect(window.location.pathname).toBe(`/c/${SESSION}`);
  });

  it("falls back to the bare /c/:id when loaded from home", async () => {
    stubFetchForLoad();
    window.history.replaceState(null, "", "/");
    const { result } = renderActions();
    await act(async () => {
      await result.current.loadSession(SESSION);
    });
    expect(window.location.pathname).toBe(`/c/${SESSION}`);
  });
});
