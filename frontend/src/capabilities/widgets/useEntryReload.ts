import { useQueuedExplore } from "./useQueuedExplore";

// Wires the PER-ENTRY reload used by each entry's header icon: rebuild just that one
// table/chart/timeline/gallery from the conversation, replacing it in place by id
// (requestReplaceEntry), leaving siblings untouched. Distinct from the bottom
// "Reload" which rebuilds the whole tool.
//
// `noun` is the singular ("table", "chart", …) used in the prompt + transcript line.
// `requestReplaceEntry` comes from the widget's state hook (useStreamingEntries).
export function useEntryReload(
  noun: string,
  requestReplaceEntry: (id: number) => void
): {
  reloadEntry: (id: number, title?: string) => void;
  queued: boolean;
} {
  const reload = useQueuedExplore();
  function reloadEntry(id: number, title?: string) {
    const which = title ? ` titled "${title}"` : "";
    reload.enqueue({
      // Targeted so the model rebuilds THIS one, not a new sibling. The in-place
      // replace (onFire) binds the next spec of the turn to this entry's id.
      prompt: `Rebuild just the single ${noun}${which} from our conversation so far — call its render tool once with a fresh, improved version of that ${noun}. Don't add others.`,
      displayText: `Reload this ${noun}.`,
      onFire: () => requestReplaceEntry(id),
    });
  }
  return { reloadEntry, queued: reload.queued };
}
