import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITIES, HOME_BASE_ID } from "../capabilities/catalog";
import {
  closeAdminPage,
  navigate,
  openAdminPage,
  parseRoute,
  replaceRoute,
  useRoute,
  viewPath,
  viewSlug,
} from "./useRoute";

describe("parseRoute", () => {
  it("parses home as a workspace with no session and no view", () => {
    expect(parseRoute("/")).toEqual({
      type: "workspace",
      sessionId: null,
      view: null,
    });
  });

  it("parses a bare tool view on the home screen (/:view)", () => {
    expect(parseRoute("/chart")).toEqual({
      type: "workspace",
      sessionId: null,
      view: "chart",
    });
    // slug mapping applies to bare views too
    expect(parseRoute("/graph")).toEqual({
      type: "workspace",
      sessionId: null,
      view: "knowledge-graph",
    });
  });

  it("parses a bare conversation (no view)", () => {
    expect(parseRoute("/c/abc123")).toEqual({
      type: "workspace",
      sessionId: "abc123",
      view: null,
    });
  });

  it("parses a conversation with a tool view, mapping the slug to the id", () => {
    expect(parseRoute("/c/abc123/graph")).toEqual({
      type: "workspace",
      sessionId: "abc123",
      view: "knowledge-graph",
    });
    expect(parseRoute("/c/abc123/chart")).toEqual({
      type: "workspace",
      sessionId: "abc123",
      view: "chart",
    });
  });

  it("tolerates a trailing slash", () => {
    expect(parseRoute("/c/abc123/chart/")).toMatchObject({ view: "chart" });
    expect(parseRoute("/chart/")).toMatchObject({
      sessionId: null,
      view: "chart",
    });
  });

  it("rejects an unknown view slug to home base (null view), not a phantom view", () => {
    // bare unknown segment → home, no view
    expect(parseRoute("/bogus")).toEqual({
      type: "workspace",
      sessionId: null,
      view: null,
    });
    // unknown conversation view segment → that session, null view
    expect(parseRoute("/c/abc123/bogus")).toEqual({
      type: "workspace",
      sessionId: "abc123",
      view: null,
    });
  });

  it("does not treat an admin word as a bare view", () => {
    expect(parseRoute("/settings")).toEqual({ type: "admin", id: "settings" });
    expect(parseRoute("/welcome")).toEqual({ type: "admin", id: "welcome" });
    expect(parseRoute("/health")).toEqual({ type: "admin", id: "health" });
  });
});

describe("viewSlug / viewPath round-trip", () => {
  it("home base has no slug; viewPath yields the bare path", () => {
    expect(viewSlug(HOME_BASE_ID)).toBeNull();
    expect(viewPath(null, null)).toBe("/");
    expect(viewPath(null, HOME_BASE_ID)).toBe("/");
    expect(viewPath("abc", null)).toBe("/c/abc");
    expect(viewPath("abc", HOME_BASE_ID)).toBe("/c/abc");
  });

  it("builds bare tool-view paths on the home screen", () => {
    expect(viewPath(null, "chart")).toBe("/chart");
    expect(viewPath(null, "knowledge-graph")).toBe("/graph");
  });

  it("maps knowledge-graph to /graph and back, scoped to a session", () => {
    expect(viewPath("abc", "knowledge-graph")).toBe("/c/abc/graph");
    expect(parseRoute("/c/abc/graph")).toMatchObject({
      view: "knowledge-graph",
    });
  });

  it("identity-maps plain ids", () => {
    for (const id of ["table", "chart", "timeline", "images"]) {
      expect(viewPath("abc", id)).toBe(`/c/abc/${id}`);
      expect(viewPath(null, id)).toBe(`/${id}`);
      expect(parseRoute(`/c/abc/${id}`)).toMatchObject({ view: id });
      expect(parseRoute(`/${id}`)).toMatchObject({ sessionId: null, view: id });
    }
  });
});

// The route layer hardcodes its view-slug map to stay free of the capability
// import graph. Guard that it never drifts from the real catalog: home base has no
// slug, and every OTHER capability must be addressable (have a slug) — otherwise a
// newly-added tool would silently 404 (its /:view falling through to home).
describe("view-slug ↔ catalog invariant", () => {
  it("home base has no slug", () => {
    expect(viewSlug(HOME_BASE_ID)).toBeNull();
  });

  it("every non-home capability is addressable via a slug", () => {
    for (const cap of CAPABILITIES) {
      if (cap.id === HOME_BASE_ID) continue;
      const slug = viewSlug(cap.id);
      expect(slug, `capability "${cap.id}" has no URL slug`).toBeTruthy();
      // …and that slug round-trips back to a /:view this same capability owns.
      expect(parseRoute(`/${slug}`)).toMatchObject({ view: cap.id });
    }
  });
});

// Reset URL + history to a known root before each navigation test, so order
// doesn't matter. jsdom gives us a real history/location to drive.
function resetUrl() {
  window.history.replaceState(null, "", "/");
}

describe("navigate / replaceRoute", () => {
  beforeEach(resetUrl);
  afterEach(() => vi.restoreAllMocks());

  it("navigate() pushes a new history entry and fires popstate", () => {
    const onPop = vi.fn();
    window.addEventListener("popstate", onPop);
    const before = window.history.length;
    navigate("/settings");
    expect(window.location.pathname).toBe("/settings");
    expect(window.history.length).toBe(before + 1);
    expect(onPop).toHaveBeenCalledTimes(1);
    window.removeEventListener("popstate", onPop);
  });

  it("navigate() is a no-op when the path is already current", () => {
    navigate("/c/abc");
    const onPop = vi.fn();
    window.addEventListener("popstate", onPop);
    navigate("/c/abc");
    expect(onPop).not.toHaveBeenCalled();
    window.removeEventListener("popstate", onPop);
  });

  it("replaceRoute() swaps the URL WITHOUT growing history, and fires popstate", () => {
    navigate("/c/abc");
    const len = window.history.length;
    const onPop = vi.fn();
    window.addEventListener("popstate", onPop);
    replaceRoute("/c/abc/chart");
    expect(window.location.pathname).toBe("/c/abc/chart");
    expect(window.history.length).toBe(len); // replaced, not pushed
    expect(onPop).toHaveBeenCalledTimes(1);
    window.removeEventListener("popstate", onPop);
  });

  it("replaceRoute() is a no-op when the path is already current", () => {
    navigate("/c/abc/chart");
    const onPop = vi.fn();
    window.addEventListener("popstate", onPop);
    replaceRoute("/c/abc/chart");
    expect(onPop).not.toHaveBeenCalled();
    window.removeEventListener("popstate", onPop);
  });
});

describe("openAdminPage / closeAdminPage", () => {
  beforeEach(resetUrl);

  it("openAdminPage pushes the admin path and marks the entry", async () => {
    navigate("/c/abc");
    openAdminPage("settings");
    expect(window.location.pathname).toBe("/settings");
    // closeAdminPage detects the marker and steps back to /c/abc. history.back()
    // is async in jsdom (it schedules a popstate), so wait for the URL to settle.
    const back = new Promise<void>((resolve) =>
      window.addEventListener("popstate", () => resolve(), { once: true })
    );
    closeAdminPage("/");
    await back;
    expect(window.location.pathname).toBe("/c/abc");
  });

  it("closeAdminPage falls back to the home path when the admin page was the first entry", () => {
    // Land on an admin page with NO prior app entry we pushed (simulate deep link).
    window.history.replaceState(null, "", "/settings");
    closeAdminPage("/c/xyz");
    expect(window.location.pathname).toBe("/c/xyz");
  });
});

describe("useRoute (reactive)", () => {
  beforeEach(resetUrl);

  it("returns the parsed current route and updates on navigation", () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toEqual({
      type: "workspace",
      sessionId: null,
      view: null,
    });

    act(() => navigate("/c/abc/graph"));
    expect(result.current).toEqual({
      type: "workspace",
      sessionId: "abc",
      view: "knowledge-graph",
    });

    act(() => navigate("/settings"));
    expect(result.current).toEqual({ type: "admin", id: "settings" });
  });
});
