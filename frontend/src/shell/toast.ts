import { toast } from "sonner";

// One configured surface for app toasts, so callers don't sprinkle raw sonner
// calls with ad-hoc options. The <Toaster /> itself is mounted (and themed) in
// App.tsx. Add new helpers here as we grow more toast kinds.

// Shown when a tool's persisted JSON snapshot fails the schema-version check on
// load and gets discarded back to first-run state. A stable id collapses the
// duplicates that fire when graph + widgets + tiles all reset in one load, so
// the user sees a single toast, not three.
export function notifyStateReset() {
  toast("Your saved state was from an older version and has been reset.", {
    id: "schema-state-reset",
  });
}
