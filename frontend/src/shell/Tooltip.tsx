import type { ReactNode } from "react";

type Side = "top" | "bottom" | "left" | "right";

// Position classes for the bubble relative to the wrapper. Each side also
// centres on the cross-axis so the bubble lines up with the trigger.
const SIDE_CLASS: Record<Side, string> = {
  top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
  left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
};

interface TooltipProps {
  /** The hover/focus text. */
  label: ReactNode;
  /** Which side of the trigger the bubble appears on. Default "top". */
  side?: Side;
  /** The trigger element (a button/icon). */
  children: ReactNode;
  /** Extra classes on the wrapper (e.g. layout/positioning). */
  className?: string;
}

// CSS-only tooltip: a styled bubble that fades in on hover or keyboard focus of
// the wrapped trigger. No new dependency, no JS state, no portals. Mirrors the
// brand styling already used by ThemeToggle (surface-overlay bubble, neon copy).
// Keep an aria-label on the trigger itself for assistive tech — this is purely
// the visual affordance.
export function Tooltip({
  label,
  side = "top",
  children,
  className,
}: TooltipProps) {
  return (
    <div
      className={`group/tooltip relative flex${className ? ` ${className}` : ""}`}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-surface-overlay px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${SIDE_CLASS[side]}`}
      >
        {label}
      </span>
    </div>
  );
}
