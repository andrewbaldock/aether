import type { MouseEvent, ReactNode } from "react";
import { Tooltip } from "./Tooltip";

// The one icon-button treatment used everywhere in the app: recedes until
// hovered/focused/pressed, then shows a border + background wash and the
// icon goes brand pink. `max-md:h-11 max-md:w-11` guarantees the 44px
// minimum touch target on mobile regardless of the icon's own size, while
// desktop keeps the tighter, padding-driven box. Single source of truth — a
// raw button that can't wrap in <Tooltip> (e.g. an AlertDialog/DropdownMenu
// asChild trigger) should still read its class from here, not hand-copy it.
export const ICON_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-md border border-transparent p-1.5 text-content-muted transition-colors hover:border-border hover:bg-elevated hover:text-neon-pink active:border-border active:bg-elevated active:text-neon-pink focus-visible:border-border focus-visible:bg-elevated focus-visible:text-neon-pink focus-visible:outline-none max-md:h-11 max-md:w-11";

// Shared icon-only button. `label` doubles as the aria-label and, unless
// `tooltip={false}`, the hover tooltip's text — turn tooltips off for
// mobile-only chrome (no hover there) or anywhere a wrapping <Tooltip> div
// would fight a fixed touch-target size. `stopPointerDown` is for buttons
// living inside a drag handle (e.g. the Bigsail card strip) so a click
// doesn't also start a GridStack drag.
export function IconButton({
  label,
  onClick,
  side = "top",
  tooltip = true,
  contentClassName,
  stopPointerDown = false,
  className,
  children,
}: {
  label: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  side?: "top" | "right" | "bottom" | "left";
  tooltip?: boolean;
  // Passed straight through to <Tooltip>'s contentClassName — use for a wide,
  // wrapping bubble (e.g. a long label like "Reload this from the conversation").
  contentClassName?: string;
  stopPointerDown?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onPointerDown={stopPointerDown ? (e) => e.stopPropagation() : undefined}
      className={`transition-colors ${ICON_BUTTON_CLASS}${className && !tooltip ? ` ${className}` : ""}`}
    >
      {children}
    </button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip
      label={label}
      side={side}
      className={`shrink-0${className ? ` ${className}` : ""}`}
      contentClassName={contentClassName}
    >
      {button}
    </Tooltip>
  );
}
