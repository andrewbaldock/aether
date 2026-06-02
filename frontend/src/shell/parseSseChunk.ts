/**
 * Appends a raw chunk to the running buffer and returns all complete SSE
 * event payloads found in it, plus the leftover partial line.
 *
 * Each returned event string is the raw payload after "data: " — callers
 * receive "[DONE]", a JSON string, etc. Lines that don't start with "data: "
 * are silently dropped (SSE comment lines, keep-alives, etc.).
 *
 * Splitting on "\n" (not "\n\n") is intentional: the backend streams one
 * event per line, not the multi-line SSE block format. A content token whose
 * value is "\n" is serialised as JSON, so the literal newline is escaped and
 * never touches the framing layer.
 */
export function parseSseChunk(
  buffer: string,
  chunk: string
): { events: string[]; remaining: string } {
  const combined = buffer + chunk;
  const lines = combined.split("\n");
  const remaining = lines.pop() ?? "";

  const events: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      events.push(line.slice(6));
    }
  }

  return { events, remaining };
}
