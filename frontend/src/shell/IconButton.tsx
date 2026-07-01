import type { MouseEvent, ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export type IconButtonVariant = "chrome" | "nav";

// The two icon-button treatments used across the app. Keep this the single
// source of truth — a raw button that can't wrap in <Tooltip> (e.g. an
// AlertDialog trigger) should still read its class from here, not hand-copy it.
export const ICON_BUTTON_CLASS: Record<IconButtonVariant, string> = {
  // Naked, recedes until hovered/focused. Bigsail card drag-handle actions.
  chrome:
    "rounded p-0.5 text-content-faint/60 hover:text-content focus-visible:text-content focus-visible:outline-none",
  // Bordered, muted until hover/active. Sidebar/toolbar utility buttons.
  nav: "rounded-md border border-transparent p-1.5 text-content-muted hover:border-border hover:bg-elevated hover:text-neon-pink",
};

// Shared icon-only button: Tooltip-wrapped trigger, aria-label doubles as the
// tooltip text. `stopPointerDown` defaults on for "chrome" since those buttons
// typically live inside a drag handle and must not start a GridStack drag.
export function IconButton({
  label,
  onClick,
  variant = "nav",
  side = "top",
  stopPointerDown = variant === "chrome",
  className,
  children,
}: {
  label: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  variant?: IconButtonVariant;
  side?: "top" | "right" | "bottom" | "left";
  stopPointerDown?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip
      label={label}
      side={side}
      className={`shrink-0${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        onPointerDown={stopPointerDown ? (e) => e.stopPropagation() : undefined}
        className={`transition-colors ${ICON_BUTTON_CLASS[variant]}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
