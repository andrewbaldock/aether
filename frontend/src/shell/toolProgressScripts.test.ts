import { describe, expect, it } from "vitest";
import { scriptFor, TOOL_PROGRESS_SCRIPTS } from "./toolProgressScripts";

describe("scriptFor", () => {
  it("returns the scripted sequence for the slow network tools", () => {
    for (const tool of [
      "wikidata_query",
      "world_bank",
      "search_images",
      "web_search",
    ]) {
      const script = scriptFor(tool);
      expect(script).toBe(TOOL_PROGRESS_SCRIPTS[tool]);
      expect(script?.length).toBeGreaterThan(0);
    }
  });

  it("returns null for instant render_* echoes and unknown tools", () => {
    expect(scriptFor("render_table")).toBeNull();
    expect(scriptFor("render_chart")).toBeNull();
    expect(scriptFor("get_current_datetime")).toBeNull();
    expect(scriptFor("totally_unknown_tool")).toBeNull();
  });

  it("every scripted step has a message and a positive hold time", () => {
    for (const steps of Object.values(TOOL_PROGRESS_SCRIPTS)) {
      for (const step of steps) {
        expect(step.message.trim().length).toBeGreaterThan(0);
        expect(step.holdMs).toBeGreaterThan(0);
      }
    }
  });
});
