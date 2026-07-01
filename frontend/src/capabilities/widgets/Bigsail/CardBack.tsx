import { RotateCcw } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { Card } from "./cards";
import { cardSummarySeed, useCardRegenerate } from "./useCardRegenerate";

// The BACK of a Bigsail card: an editable one-sentence summary of what the widget
// currently shows (the "re-prompt"), a Regenerate button that rebuilds THIS widget
// from the edited sentence in place, and the read-only spec JSON below for reference.
//
// The summary is seeded from the model's own description (spec.summary / blurb). The
// user edits it to steer a different result — e.g. "show as revenue per quarter
// instead of per month" — then Regenerate re-runs the render tool. On a successful
// turn the new spec replaces this entry and the card flips back to the front.
//
// `onRegenerated` flips the card back to the front the moment a rebuild fires, so the
// user watches the new result land rather than sitting on the back.
export function CardBack({
  card,
  onRegenerated,
}: {
  card: Card;
  onRegenerated: () => void;
}) {
  const { canRegenerate, regenerate, queued } = useCardRegenerate(card);
  const seed = cardSummarySeed(card);
  const [draft, setDraft] = useState(seed);
  const promptFieldId = useId();

  // Re-seed if the underlying spec's summary changes (e.g. after a regenerate lands a
  // new description) and the user hasn't diverged from the previous seed.
  const [lastSeed, setLastSeed] = useState(seed);
  useEffect(() => {
    if (seed !== lastSeed) {
      setLastSeed(seed);
      setDraft((d) => (d === lastSeed ? seed : d));
    }
  }, [seed, lastSeed]);

  function onRegenerate() {
    if (!draft.trim()) return;
    regenerate(draft);
    onRegenerated();
  }

  return (
    <div className="flex h-full flex-col">
      {canRegenerate ? (
        <div className="shrink-0 border-border border-b px-3 py-2">
          <label
            htmlFor={promptFieldId}
            className="mb-1 block font-display text-xs font-semibold text-content-muted"
          >
            What this {nounFor(card)} shows — edit to regenerate
          </label>
          <textarea
            id={promptFieldId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            // Don't let the drag handle (the strip above) or the card swallow typing
            // gestures; keep focus/selection inside the textarea.
            onPointerDown={(e) => e.stopPropagation()}
            rows={3}
            placeholder={`Describe the ${nounFor(card)} you want…`}
            className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-content placeholder:text-content-faint focus:border-border-strong focus:outline-none"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onRegenerate}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={!draft.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw
                className={`h-3.5 w-3.5 ${queued ? "animate-spin" : ""}`}
                aria-hidden
              />
              {queued ? "Queued…" : "Regenerate"}
            </button>
          </div>
        </div>
      ) : null}
      {/* The chunk of JSON that rules this widget — read-only for now. */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="px-3 pt-2 font-display text-xs font-semibold text-content-faint">
          Parameters
        </div>
        <pre className="whitespace-pre-wrap break-words px-3 pt-1 pb-2 font-mono text-xs leading-relaxed text-content-muted">
          {JSON.stringify(card.spec, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function nounFor(card: Card): string {
  switch (card.capabilityType) {
    case "images":
      return "gallery";
    case "knowledge-graph":
      return "graph";
    default:
      return card.capabilityType;
  }
}
