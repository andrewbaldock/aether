// Unit tests for the shared streaming-entries hook that backs Table/Chart/Timeline/
// Images. Drives real tool_partial + tool_result events through the agent bus and
// asserts: partials upsert ONE entry in place (no per-tick append), the final
// tool_result doesn't duplicate it, a second render in the same turn opens a fresh
// entry, and the max_tokens salvage path (final partial then `done`, no tool_result)
// leaves no stale streaming slot for the next turn.

import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  type AgentEventBus,
  AgentEventProvider,
  useAgentEvents,
} from "../../shell/AgentEventContext";
import { useStreamingEntries } from "./useStreamingEntries";

interface Spec {
  rows: { v: number }[];
}

// A defensive parser like the real widget parsers: returns null on unparseable or
// shape-less input (so mid-token partials are simply skipped).
function parseSpec(raw: string): Spec | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data == null || typeof data !== "object") return null;
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return null;
  return { rows: rows.filter((r): r is { v: number } => r != null) };
}

function setup() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AgentEventProvider>{children}</AgentEventProvider>
  );
  return renderHook(
    () => ({
      streaming: useStreamingEntries<Spec>("render_table", parseSpec),
      bus: useAgentEvents(),
    }),
    { wrapper }
  );
}

function partial(bus: AgentEventBus, json: string, isComplete = false) {
  act(() => {
    bus.emit({
      type: "tool_partial",
      tool: "render_table",
      partialJson: json,
      isComplete,
    });
  });
}
function result(bus: AgentEventBus, json: string) {
  act(() => {
    bus.emit({ type: "tool_result", tool: "render_table", result: json });
  });
}
function emit(bus: AgentEventBus, e: Parameters<AgentEventBus["emit"]>[0]) {
  act(() => bus.emit(e));
}

describe("useStreamingEntries", () => {
  it("upserts a single entry as partials stream, then finalizes once", () => {
    const { result: r } = setup();
    const { bus } = r.current;

    // Unparseable mid-token snapshot — skipped, no entry yet.
    partial(bus, '{"rows":[{"v":1');
    expect(r.current.streaming.entries).toHaveLength(0);

    // First parseable partial — opens ONE streaming entry.
    partial(bus, '{"rows":[{"v":1}]}');
    expect(r.current.streaming.entries).toHaveLength(1);
    expect(r.current.streaming.entries[0]?.spec.rows).toHaveLength(1);

    // Larger partial — UPSERTS the same entry (still one), more rows.
    partial(bus, '{"rows":[{"v":1},{"v":2}]}');
    expect(r.current.streaming.entries).toHaveLength(1);
    expect(r.current.streaming.entries[0]?.spec.rows).toHaveLength(2);

    // Final partial then authoritative result — still ONE entry, no dup.
    partial(bus, '{"rows":[{"v":1},{"v":2},{"v":3}]}', true);
    result(bus, '{"rows":[{"v":1},{"v":2},{"v":3}]}');
    expect(r.current.streaming.entries).toHaveLength(1);
    expect(r.current.streaming.entries[0]?.spec.rows).toHaveLength(3);
  });

  it("starts a fresh entry for a second render in the same turn", () => {
    const { result: r } = setup();
    const { bus } = r.current;

    partial(bus, '{"rows":[{"v":1}]}');
    result(bus, '{"rows":[{"v":1}]}');
    // Second table this turn.
    partial(bus, '{"rows":[{"v":9}]}');
    result(bus, '{"rows":[{"v":9}]}');

    expect(r.current.streaming.entries).toHaveLength(2);
    expect(r.current.streaming.entries[1]?.spec.rows[0]?.v).toBe(9);
  });

  it("appends without a prior partial (non-streaming path)", () => {
    const { result: r } = setup();
    const { bus } = r.current;
    result(bus, '{"rows":[{"v":7}]}');
    expect(r.current.streaming.entries).toHaveLength(1);
  });

  it("closes the streaming slot on turn end (max_tokens salvage path)", () => {
    const { result: r } = setup();
    const { bus } = r.current;

    // Salvage: a final partial arrives, then the turn ends with `done` and NO
    // tool_result (the backend onDone()s after emitting the salvaged partial).
    partial(bus, '{"rows":[{"v":1}]}', true);
    emit(bus, { type: "done" });
    expect(r.current.streaming.entries).toHaveLength(1);

    // Next turn's first partial must APPEND a new entry, not upsert the stale one.
    partial(bus, '{"rows":[{"v":5}]}');
    expect(r.current.streaming.entries).toHaveLength(2);
    expect(r.current.streaming.entries[1]?.spec.rows[0]?.v).toBe(5);
  });

  it("ignores events for other tools", () => {
    const { result: r } = setup();
    const { bus } = r.current;
    act(() => {
      bus.emit({
        type: "tool_partial",
        tool: "render_chart",
        partialJson: '{"rows":[{"v":1}]}',
        isComplete: false,
      });
    });
    expect(r.current.streaming.entries).toHaveLength(0);
  });
});
