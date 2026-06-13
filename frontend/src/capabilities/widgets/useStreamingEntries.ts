import { useEffect, useRef, useState } from "react";
import { type AgentEvent, useAgentEvents } from "../../shell/AgentEventContext";

// Shared bus wiring for the "append a self-contained spec per render" widgets
// (Table, Chart, Timeline, Images) — i.e. everything EXCEPT the knowledge graph,
// which merges additively and has its own hook.
//
// Without streaming, each widget appended one entry per `tool_result`. With
// progressive rendering the backend now also emits `tool_partial` events carrying
// the growing tool-input JSON. This hook folds both into one accumulating list:
//
//   - On a `tool_partial` (isComplete=false) it parses the partial JSON and, if it
//     yields a usable spec, UPSERTS a single "streaming" entry in place — so the
//     widget repaints with more rows/points as they arrive instead of waiting.
//   - On the final `tool_partial` (isComplete=true) or the authoritative
//     `tool_result`, it finalizes that streaming entry and clears the streaming
//     slot, so the NEXT render in the same turn starts a fresh entry.
//
// The parse fn is the widget's existing defensive parser (returns null on malformed
// or not-yet-parseable JSON). A null partial is simply skipped that tick; the next,
// larger partial — or the final result — carries something parseable.

export interface StreamingEntry<Spec> {
  id: number;
  spec: Spec;
}

export function useStreamingEntries<Spec>(
  toolName: string,
  parse: (raw: string) => Spec | null
): {
  entries: StreamingEntry<Spec>[];
  setEntries: React.Dispatch<React.SetStateAction<StreamingEntry<Spec>[]>>;
  nextId: React.MutableRefObject<number>;
} {
  const bus = useAgentEvents();
  const [entries, setEntries] = useState<StreamingEntry<Spec>[]>([]);
  // Monotonic id source for stable keys — never reused, even across removals.
  const nextId = useRef(0);
  // The id of the entry currently being streamed for THIS in-flight render, or null
  // between renders. Lets a partial update the same entry rather than appending.
  const streamingId = useRef<number | null>(null);

  useEffect(() => {
    function handle(event: AgentEvent) {
      // Turn end closes any open streaming slot. Normally tool_result does this, but
      // the backend's max_tokens SALVAGE path emits a final partial then ends the
      // turn with no tool_result — without this, the next turn's first partial would
      // upsert into this turn's stale entry instead of appending a fresh one.
      if (
        event.type === "done" ||
        event.type === "error" ||
        event.type === "idle"
      ) {
        streamingId.current = null;
        return;
      }

      const isPartial = event.type === "tool_partial";
      const isResult = event.type === "tool_result";
      if (!isPartial && !isResult) return;
      if (event.tool !== toolName) return;

      const raw = isPartial ? event.partialJson : event.result;
      const parsed = parse(raw);

      // Only the authoritative tool_result FINALIZES (closes the streaming slot so
      // the next render opens a fresh entry). The final partial (isComplete) is NOT
      // a terminator here: tool_result always follows it carrying identical data, so
      // closing on the partial would let tool_result append a duplicate. Both still
      // upsert the same streaming entry, which is idempotent.
      const finalize = isResult;

      if (parsed) {
        // Decide the target id OUTSIDE the updater so ref reads/writes are
        // deterministic (the updater can re-run under StrictMode, and `finalize`
        // below clears streamingId synchronously — reading the ref inside the
        // updater would race that). Reuse the open streaming entry, or open one.
        let id = streamingId.current;
        if (id === null) {
          id = nextId.current++;
          streamingId.current = id;
        }
        const targetId = id;
        setEntries((prev) => {
          const idx = prev.findIndex((e) => e.id === targetId);
          if (idx !== -1) {
            const next = prev.slice();
            next[idx] = { id: targetId, spec: parsed };
            return next;
          }
          return [...prev, { id: targetId, spec: parsed }];
        });
      }

      if (finalize) streamingId.current = null;
    }
    return bus.subscribe(handle);
  }, [bus, toolName, parse]);

  return { entries, setEntries, nextId };
}
