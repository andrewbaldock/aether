import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { Database } from "lucide-react";
import { useState } from "react";
import { Tooltip } from "./Tooltip";

// On-brand replacement for React Query Devtools' default floating button (the
// tropical-island icon, very much not the Aether aesthetic). We render the headless
// panel ourselves and trigger it with a lucide Database icon — matching the icon
// language used across the app. Dev-only — mounted behind import.meta.env.DEV in
// main.tsx, so it never ships to prod.
export function QueryDevtoolsToggle() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip
        label="React Query devtools"
        side="right"
        className="fixed bottom-3 left-3 z-[60]"
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={
            open ? "Close React Query devtools" : "Open React Query devtools"
          }
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-content-muted opacity-60 shadow-md transition-opacity hover:text-content hover:opacity-100"
        >
          <Database className="h-4 w-4" aria-hidden />
        </button>
      </Tooltip>

      {/* The headless panel has no intrinsic size/position (the floating variant
          positions itself; this one doesn't), so it collapses to nothing unless we
          give it a sized container. Fixed bottom drawer, panel fills its height. */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-[59] h-[40vh] border-t border-border shadow-2xl">
          <ReactQueryDevtoolsPanel
            onClose={() => setOpen(false)}
            style={{ height: "100%" }}
          />
        </div>
      )}
    </>
  );
}
