import { toast } from "sonner";

// One configured surface for app toasts, so callers don't sprinkle raw sonner
// calls with ad-hoc options. The <Toaster /> itself is mounted (and themed) in
// App.tsx. Add new helpers here as we grow more toast kinds.

// DEV-ONLY diagnostic. Fires when a tool's persisted JSON snapshot couldn't be
// rendered (shape guard rejected it) and was reset. In production we never show
// users versioning/reset churn — we render best-effort and heal silently — so
// this is a no-op outside dev. A stable id collapses the duplicates that fire
// when graph + widgets + tiles all reset in one load into a single toast.
export function notifyStateReset() {
  if (!import.meta.env.DEV) return;
  toast("[dev] A saved snapshot failed its shape guard and was reset.", {
    id: "schema-state-reset",
  });
}
