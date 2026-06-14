import { RefreshCw } from "lucide-react";

// A slim header bar for a POPULATED capability widget, carrying a reload control
// at the top-right. Reload re-runs the widget's tool and REPLACES its content with
// fresh data (the caller wires clearEntries + a rebuild prompt via onReload).
//
// Clicking mid-turn never greys out: the action is queued (latest-wins) and fires
// when the current turn settles — see useQueuedExplore, which the callers use to
// build onReload. `queued` lets the caller reflect that pending state in the icon.
export function WidgetReloadHeader({
  onReload,
  queued,
  label = "Reload from the conversation",
}: {
  onReload: () => void;
  queued?: boolean;
  label?: string;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end border-border border-b px-2 py-1.5">
      <button
        type="button"
        onClick={onReload}
        aria-label={label}
        title={label}
        // ≥44px tap target (mobile rule); glyph stays small. Spins while a reload
        // is queued behind an in-flight turn so the click clearly registered.
        className="-m-1 inline-flex h-11 w-11 items-center justify-center rounded text-content-subtle transition-colors hover:bg-elevated hover:text-content focus-visible:bg-elevated focus-visible:text-content focus-visible:outline-none"
      >
        <RefreshCw
          className={`h-4 w-4 ${queued ? "animate-spin" : ""}`}
          aria-hidden
        />
      </button>
    </div>
  );
}
