import { act, render, renderHook } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { describe, expect, it } from "vitest";
import {
  type AgentEventBus,
  AgentEventProvider,
  useAgentEvents,
} from "./AgentEventContext";
import { useAgentBusy } from "./useAgentBusy";

// Locks the Bigsail loading contract's root requirement: a consumer that mounts
// MID-TURN (Bigsail's canvas mounts only once its tab is the active view) must
// catch up to `busy=true` via the bus replay, not sit idle on the empty-state.

// One shared provider; a probe component captures the live bus so the test can
// emit BEFORE mounting the hook-under-test (simulating a turn already in flight).
function Probe({ onBus }: { onBus: (bus: AgentEventBus) => void }) {
  const bus = useAgentEvents();
  useEffect(() => {
    onBus(bus);
  }, [bus, onBus]);
  return null;
}

describe("useAgentBusy", () => {
  it("starts idle, goes busy on request_start, idle on done (live)", () => {
    let bus: AgentEventBus | null = null;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AgentEventProvider>
        <Probe onBus={(b) => (bus = b)} />
        {children}
      </AgentEventProvider>
    );
    const { result } = renderHook(() => useAgentBusy(), { wrapper });
    expect(result.current).toBe(false);
    act(() =>
      (bus as unknown as AgentEventBus).emit({ type: "request_start" })
    );
    expect(result.current).toBe(true);
    act(() => (bus as unknown as AgentEventBus).emit({ type: "done" }));
    expect(result.current).toBe(false);
  });

  it("lands busy when it MOUNTS mid-turn (replay catches it up)", () => {
    let bus: AgentEventBus | null = null;
    let busyValue = false;
    function BusyReader() {
      busyValue = useAgentBusy();
      return null;
    }
    // Render only the Probe first so we hold the bus, emit a turn-start, THEN
    // mount the busy reader against the same provider.
    const { rerender } = render(
      <AgentEventProvider>
        <Probe onBus={(b) => (bus = b)} />
      </AgentEventProvider>
    );
    act(() =>
      (bus as unknown as AgentEventBus).emit({ type: "request_start" })
    );

    rerender(
      <AgentEventProvider>
        <Probe onBus={(b) => (bus = b)} />
        <BusyReader />
      </AgentEventProvider>
    );
    expect(busyValue).toBe(true);
  });

  it("is idle after a clarifier turn settles (wait-on-user, not in-flight)", () => {
    // The clarify turn ends with `done` like any turn; the subsequent wait for the
    // user's pick is NOT busy. This is the loading-contract requirement Bigsail
    // relies on to show its calm "let's aim this first" state instead of the
    // gathering animation. `clarify` itself is a side-channel and never goes busy.
    let bus: AgentEventBus | null = null;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AgentEventProvider>
        <Probe onBus={(b) => (bus = b)} />
        {children}
      </AgentEventProvider>
    );
    const { result } = renderHook(() => useAgentBusy(), { wrapper });
    act(() => {
      const b = bus as unknown as AgentEventBus;
      b.emit({ type: "request_start" });
      b.emit({ type: "text", content: "Which tradition?" });
      b.emit({ type: "clarify", question: "Which tradition?", options: ["a", "b"] });
    });
    // The clarify event mid-turn must not flip anything off — still busy until done.
    expect(result.current).toBe(true);
    act(() => (bus as unknown as AgentEventBus).emit({ type: "done" }));
    expect(result.current).toBe(false);
  });

  it("stays idle when it mounts after the turn already settled", () => {
    let bus: AgentEventBus | null = null;
    let busyValue = true;
    function BusyReader() {
      busyValue = useAgentBusy();
      return null;
    }
    const { rerender } = render(
      <AgentEventProvider>
        <Probe onBus={(b) => (bus = b)} />
      </AgentEventProvider>
    );
    act(() => {
      (bus as unknown as AgentEventBus).emit({ type: "request_start" });
      (bus as unknown as AgentEventBus).emit({ type: "done" });
    });

    rerender(
      <AgentEventProvider>
        <Probe onBus={(b) => (bus = b)} />
        <BusyReader />
      </AgentEventProvider>
    );
    expect(busyValue).toBe(false);
  });
});
