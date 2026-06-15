import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip } from "../../shell/Tooltip";

// Per-ENTRY header: one table/chart/timeline/gallery's own title on the left, with a
// dim reload icon on the right that rebuilds JUST THAT entry from the conversation
// (the caller wires requestReplaceEntry(id) into onReload). It's a slim sticky bar —
// the entry's content scrolls beneath it (callers place this as the first child of
// the entry section). The icon is deliberately dim/low-contrast so it recedes; it
// brightens on hover.
//
// Clicking mid-turn never greys out: the action is queued (latest-wins) and fires
// when the current turn settles — see useQueuedExplore. `queued` spins the icon to
// show the click registered.
export function WidgetReloadHeader({
  title,
  onReload,
  queued,
  label = "Reload this from the conversation",
  extraAction,
}: {
  title?: string;
  onReload: () => void;
  queued?: boolean;
  label?: string;
  // Optional trailing control rendered just before the reload icon — used by the
  // tool tabs to surface a "re-add to Bigsail canvas" button on a hidden entry.
  extraAction?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      {title ? (
        <h2 className="truncate font-display text-sm font-semibold text-content">
          {title}
        </h2>
      ) : (
        <span />
      )}
      <div className="flex shrink-0 items-center gap-1">
        {extraAction}
        <WidgetReloadHeaderButton
          onReload={onReload}
          queued={queued}
          label={label}
        />
      </div>
    </div>
  );
}

// The dim per-entry reload icon on its own, for headers that compose their own title
// row (e.g. Images, whose row also carries "Get more"). Same look as the button
// inside WidgetReloadHeader.
export function WidgetReloadHeaderButton({
  onReload,
  queued,
  label = "Reload this from the conversation",
}: {
  onReload: () => void;
  queued?: boolean;
  label?: string;
}) {
  return (
    <Tooltip label={label} contentClassName="w-64 whitespace-normal leading-snug">
      <button
        type="button"
        onClick={onReload}
        aria-label={label}
        // Dim by default (text-content-subtle/60) so it recedes; brightens on hover.
        // Spins while a reload is queued behind an in-flight turn.
        className="shrink-0 rounded-md p-1 text-content-subtle/60 transition-colors hover:bg-elevated hover:text-content focus-visible:bg-elevated focus-visible:text-content focus-visible:outline-none"
      >
        <RefreshCw
          className={`h-4 w-4 ${queued ? "animate-spin" : ""}`}
          aria-hidden
        />
      </button>
    </Tooltip>
  );
}

// The quiet, always-present destructive reload at the BOTTOM of a populated tool:
// centered, no chrome of its own beyond the same outline as the empty-tool "Update"
// button — it rebuilds the ENTIRE tool from scratch (every entry). Distinct from the
// per-entry header reload above, which only refreshes one entry. `queued` reflects a
// pending rebuild behind an in-flight turn.
export function WidgetReloadAll({
  onReload,
  queued,
  label = "Rebuild this whole view from the conversation",
}: {
  onReload: () => void;
  queued?: boolean;
  label?: string;
}) {
  return (
    // mt-auto pins this to the BOTTOM of the scroll column when content is short
    // (the column is flex-col), so it never floats mid-panel with empty space
    // below it — it's always just beneath the content, and ≤8px (pb-2) off the
    // panel's bottom edge. When content is tall it simply sits after it and
    // scrolls into view at the end. Callers must NOT add their own bottom padding
    // to the scroll container (it would stack on this and break the ≤10px rule).
    <div className="mt-auto flex justify-center pt-6 pb-2">
      <Tooltip label={label} contentClassName="w-64 whitespace-normal leading-snug">
        <button
          type="button"
          onClick={onReload}
          aria-label={label}
          // Recedes at 50% opacity so it doesn't compete with the data above it;
          // brightens to full on hover. Border/text also shift on hover.
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-content-muted opacity-50 transition hover:border-content-muted hover:text-content hover:opacity-100"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${queued ? "animate-spin" : ""}`}
            aria-hidden
          />
          Reload
        </button>
      </Tooltip>
    </div>
  );
}
