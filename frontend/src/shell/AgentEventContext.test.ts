import { describe, expect, it } from "vitest";
import {
  type AgentEvent,
  isPhaseEvent,
  nextLastPhase,
} from "./AgentEventContext";

// The bus retains the most-recent coarse PHASE event and replays it to a new
// subscriber so a mid-turn mount (e.g. the Welcome diagram opened while a turn
// is in flight) lands in the right phase instead of idle. These cover the pure
// decision of WHICH event gets remembered for that replay — the React provider
// wiring (subscribe-time replay, opt-in flag) is exercised in the app itself.

describe("isPhaseEvent", () => {
  it("treats the coarse turn milestones as phase events", () => {
    const phases: AgentEvent[] = [
      { type: "request_start" },
      { type: "text", content: "hi" },
      { type: "tool_start", tool: "wikidata_query", input: {} },
      { type: "loop_start", iteration: 2 },
      { type: "done" },
      { type: "idle" },
    ];
    for (const e of phases) expect(isPhaseEvent(e)).toBe(true);
  });

  it("excludes fine-grained / side-channel events", () => {
    const nonPhases: AgentEvent[] = [
      { type: "status", message: "Got 40 results…" },
      { type: "tool_result", tool: "wikidata_query", result: "{}" },
      { type: "error", message: "boom" },
      { type: "explore_request", prompt: "more" },
    ];
    for (const e of nonPhases) expect(isPhaseEvent(e)).toBe(false);
  });
});

describe("nextLastPhase", () => {
  it("advances to a new phase milestone", () => {
    const start: AgentEvent = { type: "request_start" };
    const tool: AgentEvent = { type: "tool_start", tool: "x", input: {} };
    expect(nextLastPhase(null, start)).toBe(start);
    expect(nextLastPhase(start, tool)).toBe(tool);
  });

  it("keeps the prior phase when a non-phase event arrives", () => {
    const tool: AgentEvent = { type: "tool_start", tool: "x", input: {} };
    // A status/tool_result mid-tool must NOT overwrite the replayable phase —
    // a late subscriber should still catch up to "tool_start", not "status".
    expect(nextLastPhase(tool, { type: "status", message: "…" })).toBe(tool);
    expect(
      nextLastPhase(tool, { type: "tool_result", tool: "x", result: "{}" })
    ).toBe(tool);
  });

  it("starts from null and only latches once a phase event is seen", () => {
    expect(nextLastPhase(null, { type: "status", message: "…" })).toBeNull();
    const start: AgentEvent = { type: "request_start" };
    expect(nextLastPhase(null, start)).toBe(start);
  });
});
