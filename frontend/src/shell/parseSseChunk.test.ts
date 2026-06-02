import { describe, expect, it } from "vitest";
import { parseSseChunk } from "./parseSseChunk";

describe("parseSseChunk", () => {
  it("returns a complete event from a single chunk", () => {
    const payload = JSON.stringify({ type: "text", content: "hi" });
    const { events, remaining } = parseSseChunk("", `data: ${payload}\n`);
    expect(events).toEqual([payload]);
    expect(remaining).toBe("");
  });

  it("returns [DONE] terminator", () => {
    const { events, remaining } = parseSseChunk("", "data: [DONE]\n");
    expect(events).toEqual(["[DONE]"]);
    expect(remaining).toBe("");
  });

  it("carries a partial line across two chunks", () => {
    const payload = JSON.stringify({ type: "text", content: "split" });
    const full = `data: ${payload}\n`;
    const mid = Math.floor(full.length / 2);

    const first = parseSseChunk("", full.slice(0, mid));
    expect(first.events).toEqual([]);
    expect(first.remaining).toBe(full.slice(0, mid));

    const second = parseSseChunk(first.remaining, full.slice(mid));
    expect(second.events).toEqual([payload]);
    expect(second.remaining).toBe("");
  });

  it("does not lose a token whose content is a newline", () => {
    // The content value "\n" is JSON-escaped, so it never touches the framing
    // layer — the line boundary is the literal \n at the end of the SSE line.
    const payload = JSON.stringify({ type: "text", content: "\n" });
    const { events } = parseSseChunk("", `data: ${payload}\n`);
    expect(events).toEqual([payload]);
    const parsed = JSON.parse(String(events[0])) as { content: string };
    expect(parsed.content).toBe("\n");
  });

  it("returns an error event", () => {
    const payload = JSON.stringify({ type: "error", message: "boom" });
    const { events } = parseSseChunk("", `data: ${payload}\n`);
    expect(events).toEqual([payload]);
  });

  it("handles multiple events in one chunk", () => {
    const p1 = JSON.stringify({ type: "text", content: "a" });
    const p2 = JSON.stringify({ type: "text", content: "b" });
    const { events, remaining } = parseSseChunk(
      "",
      `data: ${p1}\ndata: ${p2}\n`
    );
    expect(events).toEqual([p1, p2]);
    expect(remaining).toBe("");
  });

  it("handles [DONE] split across two reads", () => {
    const full = "data: [DONE]\n";
    const mid = Math.floor(full.length / 2);

    const first = parseSseChunk("", full.slice(0, mid));
    expect(first.events).toEqual([]);

    const second = parseSseChunk(first.remaining, full.slice(mid));
    expect(second.events).toEqual(["[DONE]"]);
  });

  it("ignores non-data lines", () => {
    const payload = JSON.stringify({ type: "text", content: "x" });
    const { events } = parseSseChunk("", `: keep-alive\ndata: ${payload}\n`);
    expect(events).toEqual([payload]);
  });
});
