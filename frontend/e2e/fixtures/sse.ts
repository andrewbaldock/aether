// Builders for the SSE wire format the frontend expects.
//
// CRITICAL: the backend streams via Hono's streamSSE, which prefixes every event
// with "data: " and ends it with a blank line. The frontend's parseSseChunk only
// keeps lines that start with "data: " (it slices those 6 chars) and splits on a
// single "\n". So each event MUST be exactly `data: <payload>\n`. A body without
// the "data: " prefix is silently dropped — which is the bug the original plan's
// example fixture would have hit. The terminal sentinel is the literal `[DONE]`.

export type SseEvent =
  | { type: "text"; content: string }
  | { type: "status"; message: string }
  | { type: "tool_start"; tool: string; input?: unknown; label?: string }
  | {
      type: "tool_partial";
      tool: string;
      partialJson: string;
      isComplete?: boolean;
    }
  | { type: "tool_result"; tool: string; result: string }
  | { type: "loop_start"; iteration: number }
  | { type: "error"; message: string };

// Serialise a list of events into a single SSE body, terminated by [DONE].
// Each event is one `data: …` line. Pass `done: false` to omit the terminator
// (e.g. to simulate a stream cut off mid-flight by an abort).
export function sseBody(
  events: SseEvent[],
  { done = true }: { done?: boolean } = {}
): string {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n`);
  if (done) lines.push("data: [DONE]\n");
  return lines.join("");
}

// A plain text turn: the assistant streams a short reply, no tools.
export function textTurn(text = "Hello from the mocked stream."): SseEvent[] {
  // Split into a few chunks so the test exercises incremental accumulation, the
  // same way real tokens arrive.
  const parts = text.match(/.{1,12}/g) ?? [text];
  return parts.map((content) => ({ type: "text", content }));
}

// A render-tool round trip: a bit of preamble text, then a render_table tool call
// whose tool_result carries a valid TableSpec (the shape parseTableSpec accepts).
// The widget keys on the tool NAME "render_table" (not "table") and consumes the
// spec off the agent-event bus, so the name here must match exactly.
export function tableTurn(): SseEvent[] {
  const spec = {
    title: "Largest planets by diameter",
    columns: [
      { key: "name", label: "Planet" },
      { key: "diameter", label: "Diameter (km)" },
    ],
    rows: [
      { name: "Jupiter", diameter: 139820 },
      { name: "Saturn", diameter: 116460 },
      { name: "Uranus", diameter: 50724 },
    ],
  };
  const json = JSON.stringify(spec);
  return [
    { type: "text", content: "Here are the largest planets:" },
    {
      type: "tool_start",
      tool: "render_table",
      input: spec,
      label: "Building a table",
    },
    { type: "tool_result", tool: "render_table", result: json },
    { type: "text", content: " — rendered in the Table tab." },
  ];
}
