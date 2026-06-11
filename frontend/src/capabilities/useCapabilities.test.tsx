import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KNOWLEDGE_GRAPH_ID } from "./catalog";
import { CapabilityProvider, useCapabilities } from "./useCapabilities";

function setup() {
  return renderHook(() => useCapabilities(), { wrapper: CapabilityProvider });
}

describe("useCapabilities", () => {
  it("defaults to the Knowledge Graph home base, no unseen, not fullscreen", () => {
    const { result } = setup();
    expect(result.current.activeId).toBe(KNOWLEDGE_GRAPH_ID);
    expect(result.current.unseen).toEqual([]);
    expect(result.current.isFullscreen).toBe(false);
  });

  it("activate switches the view, bumps openTick, and clears its own unseen", () => {
    const { result } = setup();
    act(() => result.current.markUnseen("table"));
    expect(result.current.unseen).toContain("table");

    const tickBefore = result.current.openTick;
    act(() => result.current.activate("table"));
    expect(result.current.activeId).toBe("table");
    expect(result.current.openTick).toBe(tickBefore + 1);
    // Viewing a capability clears its glow.
    expect(result.current.unseen).not.toContain("table");
  });

  it("markUnseen is a no-op for the active view and dedupes", () => {
    const { result } = setup();
    // KG is active by default — flagging it does nothing.
    act(() => result.current.markUnseen(KNOWLEDGE_GRAPH_ID));
    expect(result.current.unseen).toEqual([]);

    act(() => result.current.markUnseen("chart"));
    act(() => result.current.markUnseen("chart"));
    expect(result.current.unseen).toEqual(["chart"]);
  });

  it("restore sets active + unseen atomically without bumping openTick", () => {
    const { result } = setup();
    const tickBefore = result.current.openTick;
    act(() => result.current.restore("chart", ["table", "timeline"]));
    expect(result.current.activeId).toBe("chart");
    expect(result.current.unseen).toEqual(["table", "timeline"]);
    // Loading a conversation must NOT surface the mobile overlay.
    expect(result.current.openTick).toBe(tickBefore);
  });

  it("reset returns to home base with a clean slate", () => {
    const { result } = setup();
    act(() => result.current.activate("table"));
    act(() => result.current.markUnseen("chart"));
    act(() => result.current.setFullscreen(true));
    act(() => result.current.reset());
    expect(result.current.activeId).toBe(KNOWLEDGE_GRAPH_ID);
    expect(result.current.unseen).toEqual([]);
    expect(result.current.isFullscreen).toBe(false);
  });
});
