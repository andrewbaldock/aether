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

// Normalize a title for de-dup comparison: trimmed + lowercased. Empty/whitespace
// titles return undefined (never merge an untitled widget onto another).
function normTitle(title: string | undefined): string | undefined {
  const t = title?.trim().toLowerCase();
  return t ? t : undefined;
}

export function useStreamingEntries<Spec>(
  toolName: string,
  parse: (raw: string) => Spec | null,
  // Optional: extract a spec's title for de-duplication. When a turn opens a FRESH
  // entry whose title matches an existing entry's (case-insensitive, trimmed), the
  // new spec REPLACES that entry in place instead of appending a near-duplicate.
  // This is the safety net for follow-up turns where the model re-emits a widget it
  // already produced (same "History of Bowling" timeline twice, same gallery title,
  // an overlapping chart). Omit it (or return undefined) to always append.
  getTitle?: (spec: Spec) => string | undefined
): {
  entries: StreamingEntry<Spec>[];
  setEntries: React.Dispatch<React.SetStateAction<StreamingEntry<Spec>[]>>;
  nextId: React.MutableRefObject<number>;
  requestReplace: () => void;
  requestReplaceEntry: (id: number) => void;
} {
  const bus = useAgentEvents();
  const [entries, setEntries] = useState<StreamingEntry<Spec>[]>([]);
  // Live mirror of entries so the bus handler can read the current set (for the
  // title-merge lookup) without re-subscribing on every entries change.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  // Monotonic id source for stable keys — never reused, even across removals.
  const nextId = useRef(0);
  // The id of the entry currently being streamed for THIS in-flight render, or null
  // between renders. Lets a partial update the same entry rather than appending.
  const streamingId = useRef<number | null>(null);
  // Set by a "Rebuild" action: replace-on-arrival. We do NOT clear the existing
  // entries up front (that would blink the canvas tile out and risk an empty state
  // being persisted over good data). Instead we drop the prior entries the instant
  // the FIRST parseable spec of the rebuild turn actually lands — so the old table
  // stays visible until the new one supersedes it, and stays put if the rebuild
  // yields nothing.
  const replaceOnArrival = useRef(false);
  // Arm on a microtask, not synchronously. requestReplace is fired from
  // useQueuedExplore's settle handler — i.e. INSIDE the prior turn's done/idle
  // dispatch, the very dispatch whose done handler (below) disarms the latch.
  // Deferring past the current dispatch means we arm cleanly for the upcoming
  // rebuild turn without that same done clearing us first. (Synchronous idle
  // clicks dispatch nothing, so the microtask still lands before any spec.)
  const requestReplace = useRef(() => {
    queueMicrotask(() => {
      replaceOnArrival.current = true;
    });
  }).current;
  // Set by a per-entry "Reload this one" action: the first parseable spec of the
  // rebuild turn REPLACES the entry with this id IN PLACE, leaving every other entry
  // untouched (vs. requestReplace, which wipes the whole set). Same microtask-arm
  // reasoning as above. Cleared on settle if nothing arrived.
  const replaceEntryId = useRef<number | null>(null);
  const requestReplaceEntry = useRef((id: number) => {
    queueMicrotask(() => {
      replaceEntryId.current = id;
    });
  }).current;

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
        // A rebuild that ended without ever producing a parseable spec keeps the
        // old entries; disarm the latches so a LATER unrelated turn can't replace
        // them. (When a spec did arrive, the latch already consumed itself.)
        replaceOnArrival.current = false;
        replaceEntryId.current = null;
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
        // updater would race that).
        let id = streamingId.current;
        // Whether this is a freshly-opened slot (vs. continuing to stream into one
        // already open this render). Only a fresh slot is eligible for title-merge —
        // once a slot is bound, every partial keeps targeting the same entry.
        let freshSlot = false;
        if (id === null) {
          // A per-entry reload binds the streaming slot to the EXISTING entry's id,
          // so this turn's spec(s) overwrite that one entry in place. Otherwise open
          // a fresh id (append, title-merge, or whole-set replace below).
          if (replaceEntryId.current !== null) {
            id = replaceEntryId.current;
            replaceEntryId.current = null;
          } else {
            id = nextId.current++;
            freshSlot = true;
          }
          streamingId.current = id;
        }
        let targetId = id;
        // A pending whole-set rebuild replaces the prior set with this fresh entry the
        // moment it arrives, then behaves normally for the rest of the turn.
        const replacing = replaceOnArrival.current;
        if (replacing) replaceOnArrival.current = false;
        // De-dup by title: when a fresh slot opens with a title that matches an
        // existing entry (and we're not doing a whole-set replace), retarget the
        // streaming slot onto that entry so the new spec supersedes it in place
        // instead of appending a near-duplicate (the follow-up-turn dupe bug).
        const newTitle = freshSlot && !replacing ? normTitle(getTitle?.(parsed)) : undefined;
        if (newTitle !== undefined) {
          const match = entriesRef.current.find(
            (e) => normTitle(getTitle?.(e.spec)) === newTitle
          );
          if (match) {
            targetId = match.id;
            streamingId.current = match.id;
          }
        }
        setEntries((prev) => {
          const base = replacing ? [] : prev;
          const idx = base.findIndex((e) => e.id === targetId);
          if (idx !== -1) {
            const next = base.slice();
            next[idx] = { id: targetId, spec: parsed };
            return next;
          }
          return [...base, { id: targetId, spec: parsed }];
        });
      }

      if (finalize) streamingId.current = null;
    }
    return bus.subscribe(handle);
  }, [bus, toolName, parse]);

  return { entries, setEntries, nextId, requestReplace, requestReplaceEntry };
}
