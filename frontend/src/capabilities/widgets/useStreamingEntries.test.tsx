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

  // requestReplace arms on a microtask (see the hook) so it lands cleanly after the
  // settle dispatch that fires it. Flush microtasks before driving the rebuild turn.
  async function arm(r: {
    current: { streaming: { requestReplace: () => void } };
  }) {
    await act(async () => {
      r.current.streaming.requestReplace();
      await Promise.resolve();
    });
  }

  it("replace-on-arrival: keeps old entries until the rebuild's first spec lands", async () => {
    const { result: r } = setup();
    const { bus } = r.current;

    // A prior table exists.
    result(bus, '{"rows":[{"v":1}]}');
    expect(r.current.streaming.entries).toHaveLength(1);

    // User hits Rebuild: requestReplace arms replace-on-arrival but does NOT clear —
    // the old table stays visible meanwhile.
    await arm(r);
    expect(r.current.streaming.entries).toHaveLength(1);
    expect(r.current.streaming.entries[0]?.spec.rows[0]?.v).toBe(1);

    // The first spec of the rebuild turn REPLACES the prior set (not append).
    partial(bus, '{"rows":[{"v":2}]}');
    expect(r.current.streaming.entries).toHaveLength(1);
    expect(r.current.streaming.entries[0]?.spec.rows[0]?.v).toBe(2);

    // Subsequent renders this turn append normally (latch was one-shot).
    result(bus, '{"rows":[{"v":2}]}');
    partial(bus, '{"rows":[{"v":3}]}');
    expect(r.current.streaming.entries).toHaveLength(2);
  });

  it("replace-on-arrival: a rebuild that yields nothing leaves the old entries", async () => {
    const { result: r } = setup();
    const { bus } = r.current;

    result(bus, '{"rows":[{"v":1}]}');
    await arm(r);
    // Turn ends with no parseable spec (agent error / empty rebuild).
    emit(bus, { type: "done" });
    expect(r.current.streaming.entries).toHaveLength(1);
    expect(r.current.streaming.entries[0]?.spec.rows[0]?.v).toBe(1);
  });

  // requestReplaceEntry arms on a microtask too; flush before driving the turn.
  async function armEntry(
    r: { current: { streaming: { requestReplaceEntry: (id: number) => void } } },
    id: number
  ) {
    await act(async () => {
      r.current.streaming.requestReplaceEntry(id);
      await Promise.resolve();
    });
  }

  it("replace-entry: the rebuild's spec overwrites ONLY the targeted entry in place", async () => {
    const { result: r } = setup();
    const { bus } = r.current;

    // Two tables exist.
    result(bus, '{"rows":[{"v":1}]}');
    result(bus, '{"rows":[{"v":2}]}');
    expect(r.current.streaming.entries).toHaveLength(2);
    const firstId = r.current.streaming.entries[0]!.id;
    const secondId = r.current.streaming.entries[1]!.id;

    // Reload just the FIRST entry.
    await armEntry(r, firstId);

    // The rebuild's spec replaces entry 1 in place — still two entries, order kept,
    // entry 2 untouched, and entry 1 keeps its id.
    partial(bus, '{"rows":[{"v":11}]}');
    result(bus, '{"rows":[{"v":11}]}');
    expect(r.current.streaming.entries).toHaveLength(2);
    expect(r.current.streaming.entries[0]?.id).toBe(firstId);
    expect(r.current.streaming.entries[0]?.spec.rows[0]?.v).toBe(11);
    expect(r.current.streaming.entries[1]?.id).toBe(secondId);
    expect(r.current.streaming.entries[1]?.spec.rows[0]?.v).toBe(2);
  });

  it("replace-entry: a rebuild that yields nothing leaves the entry intact", async () => {
    const { result: r } = setup();
    const { bus } = r.current;
    result(bus, '{"rows":[{"v":1}]}');
    const id = r.current.streaming.entries[0]!.id;
    await armEntry(r, id);
    emit(bus, { type: "done" });
    expect(r.current.streaming.entries).toHaveLength(1);
    expect(r.current.streaming.entries[0]?.spec.rows[0]?.v).toBe(1);
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

  // ── Title-merge (follow-up-turn dupe safety net) ──────────────────────────
  // A getTitle fn enables de-dup: a fresh entry whose title matches an existing
  // one replaces it in place instead of appending a near-duplicate.
  interface TitledSpec {
    title?: string;
    rows: { v: number }[];
  }
  function parseTitled(raw: string): TitledSpec | null {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
    if (data == null || typeof data !== "object") return null;
    const rows = (data as { rows?: unknown }).rows;
    if (!Array.isArray(rows)) return null;
    const title = (data as { title?: unknown }).title;
    return {
      title: typeof title === "string" ? title : undefined,
      rows: rows.filter((r): r is { v: number } => r != null),
    };
  }
  function setupTitled() {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AgentEventProvider>{children}</AgentEventProvider>
    );
    return renderHook(
      () => ({
        streaming: useStreamingEntries<TitledSpec>(
          "render_table",
          parseTitled,
          (s) => s.title
        ),
        bus: useAgentEvents(),
      }),
      { wrapper }
    );
  }

  it("title-merge: a same-titled entry from a later turn replaces in place", () => {
    const { result: r } = setupTitled();
    const { bus } = r.current;

    result(bus, '{"title":"History of Bowling","rows":[{"v":1}]}');
    expect(r.current.streaming.entries).toHaveLength(1);
    const id = r.current.streaming.entries[0]!.id;

    // Follow-up turn re-emits the SAME title — must overwrite, not append.
    result(bus, '{"title":"History of Bowling","rows":[{"v":2},{"v":3}]}');
    expect(r.current.streaming.entries).toHaveLength(1);
    expect(r.current.streaming.entries[0]?.id).toBe(id); // same entry, kept id
    expect(r.current.streaming.entries[0]?.spec.rows).toHaveLength(2);
  });

  it("title-merge is case/space-insensitive", () => {
    const { result: r } = setupTitled();
    const { bus } = r.current;
    result(bus, '{"title":"History of Bowling","rows":[{"v":1}]}');
    result(bus, '{"title":"  history of BOWLING ","rows":[{"v":9}]}');
    expect(r.current.streaming.entries).toHaveLength(1);
    expect(r.current.streaming.entries[0]?.spec.rows[0]?.v).toBe(9);
  });

  it("title-merge: different titles still append", () => {
    const { result: r } = setupTitled();
    const { bus } = r.current;
    result(bus, '{"title":"Lanes over time","rows":[{"v":1}]}');
    result(bus, '{"title":"Bowlers over time","rows":[{"v":2}]}');
    expect(r.current.streaming.entries).toHaveLength(2);
  });

  it("title-merge: untitled specs never merge onto each other", () => {
    const { result: r } = setupTitled();
    const { bus } = r.current;
    result(bus, '{"rows":[{"v":1}]}');
    result(bus, '{"rows":[{"v":2}]}');
    expect(r.current.streaming.entries).toHaveLength(2);
  });

  it("title-merge: streaming partials of a matching title upsert the matched entry", () => {
    const { result: r } = setupTitled();
    const { bus } = r.current;
    result(bus, '{"title":"Trend","rows":[{"v":1}]}');
    const id = r.current.streaming.entries[0]!.id;

    // A later turn streams a same-titled spec: the FIRST parseable partial binds the
    // slot to the matched entry, and subsequent partials keep upserting it (not a
    // new entry per tick).
    partial(bus, '{"title":"Trend","rows":[{"v":2}]}');
    expect(r.current.streaming.entries).toHaveLength(1);
    expect(r.current.streaming.entries[0]?.id).toBe(id);
    partial(bus, '{"title":"Trend","rows":[{"v":2},{"v":3}]}');
    expect(r.current.streaming.entries).toHaveLength(1);
    expect(r.current.streaming.entries[0]?.spec.rows).toHaveLength(2);
  });
});
