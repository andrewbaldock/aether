// Unit tests for useQueuedExplore — the hook that replaced the widgets' old
// `if (busy) return` bail. Drives request_start / done events through the real
// agent bus and asserts: an idle enqueue fires straight away; an enqueue mid-turn
// is held and fires on settle; rapid mid-turn enqueues coalesce (latest-wins); and
// the onFire side effect runs at the moment the request actually fires (so a
// "reload" clears its widget on settle, not at click time).

import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  type AgentEvent,
  type AgentEventBus,
  AgentEventProvider,
  useAgentEvents,
} from "../../shell/AgentEventContext";
import { useQueuedExplore } from "./useQueuedExplore";

// Render the hook plus a sink that records every explore_request the hook emits,
// so a test can assert what fired and in what order.
function setup() {
  const fired: AgentEvent[] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AgentEventProvider>{children}</AgentEventProvider>
  );
  const view = renderHook(
    () => {
      const bus = useAgentEvents();
      const queue = useQueuedExplore();
      return { bus, queue };
    },
    { wrapper }
  );
  // Subscribe after mount so we capture live emits (the hook's own subscription
  // and this one both run; order doesn't matter for what we assert).
  act(() => {
    view.result.current.bus.subscribe((e) => {
      if (e.type === "explore_request") fired.push(e);
    });
  });
  return { ...view, fired };
}

function emit(bus: AgentEventBus, event: AgentEvent) {
  act(() => bus.emit(event));
}

describe("useQueuedExplore", () => {
  it("fires immediately when idle", () => {
    const { result, fired } = setup();
    act(() => result.current.queue.enqueue({ prompt: "now" }));
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ type: "explore_request", prompt: "now" });
    expect(result.current.queue.queued).toBe(false);
  });

  it("queues mid-turn and fires on settle", () => {
    const { result, fired } = setup();
    emit(result.current.bus, { type: "request_start" });
    act(() => result.current.queue.enqueue({ prompt: "later" }));
    // Nothing fires while the turn is in flight.
    expect(fired).toHaveLength(0);
    expect(result.current.queue.queued).toBe(true);

    emit(result.current.bus, { type: "done" });
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ prompt: "later" });
    expect(result.current.queue.queued).toBe(false);
  });

  it("coalesces rapid mid-turn enqueues (latest wins)", () => {
    const { result, fired } = setup();
    emit(result.current.bus, { type: "request_start" });
    act(() => {
      result.current.queue.enqueue({ prompt: "first" });
      result.current.queue.enqueue({ prompt: "second" });
      result.current.queue.enqueue({ prompt: "third" });
    });
    emit(result.current.bus, { type: "done" });
    // Only the most recent request fires — no stacked duplicate rebuilds.
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ prompt: "third" });
  });

  it("runs onFire at fire time, not enqueue time", () => {
    const { result } = setup();
    const onFire = vi.fn();
    emit(result.current.bus, { type: "request_start" });
    act(() => result.current.queue.enqueue({ prompt: "reload", onFire }));
    // Queued, not yet fired → side effect must not have run (clear-on-settle).
    expect(onFire).not.toHaveBeenCalled();
    emit(result.current.bus, { type: "done" });
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("fires on error and idle settle events too", () => {
    const { result, fired } = setup();
    emit(result.current.bus, { type: "request_start" });
    act(() => result.current.queue.enqueue({ prompt: "after-error" }));
    emit(result.current.bus, { type: "error", message: "boom" });
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ prompt: "after-error" });
  });
});
