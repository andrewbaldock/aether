import type { ReactNode } from "react";
import { AdminTabs } from "./AdminTabs";

// Shared chrome for the admin/utility pages (Welcome, Settings, Health). Each used
// to roll its own scroll container, max-width, padding, tab-bar slot, and heading
// size — so navigating between them made the column jump (width changing, the tab
// bar sliding up/down, the title resizing). This wrapper standardises all of that
// so the pages feel like one surface you're switching tabs within.
//
// Screenshots deliberately opts OUT (it needs full width for the device grid), but
// still mirrors the same outer container + AdminTabs slot so its tab bar lines up.
//
// `width` lets a page widen its content column without breaking the shared chrome.
// Default suits text/forms; pass a wider token (e.g. max-w-5xl) for galleries.
//
// The default is a PX max-width, not a rem token, on purpose. Text size is applied
// via the root <html> font-size, so a rem-based max-width (the old max-w-2xl = 42rem)
// scaled WITH the text-size setting — clicking XS/S/M/L on the Settings page snapped
// the whole column wider/narrower (588px → 756px). 672px is exactly 42rem at the
// default 16px, so it's visually identical at M but now holds steady at every size.
export function AdminPage({
  title,
  actions,
  width = "max-w-[672px]",
  children,
}: {
  title: string;
  // Optional right-aligned controls beside the title (e.g. Health's "Check now").
  actions?: ReactNode;
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-surface">
      <div className={`mx-auto w-full ${width} px-6 py-8`}>
        <div className="mb-6">
          <AdminTabs />
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-semibold text-content">
            {title}
          </h1>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}
