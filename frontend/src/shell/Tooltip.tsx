import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

type Side = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  /** The hover/focus text. */
  label: ReactNode;
  /** Which side of the trigger the bubble appears on. Default "top". */
  side?: Side;
  /** The trigger element (a button/icon). */
  children: ReactNode;
  /** Extra classes on the wrapper (e.g. layout/positioning). */
  className?: string;
  /**
   * Extra classes on the bubble itself. Use for a wide, wrapping tooltip:
   * pass e.g. "w-64 whitespace-normal leading-snug" to override the default
   * single-line nowrap styling.
   */
  contentClassName?: string;
}

// Tooltip built on Radix. The bubble renders in a portal at <body>, so it can
// never be clipped by an ancestor's `overflow: hidden/auto` (the old CSS-only
// version was, repeatedly — fullscreen toggle, help icon, theme switch). Radix
// also flips/shifts to stay on screen, and handles hover, keyboard focus, touch,
// and the close-on-blur behaviour we used to hand-roll.
//
// `side` is a preferred side: Radix overrides it on collision. Brand styling
// (dark surface-overlay bubble, white copy) is preserved from the old version.
// Keep an aria-label on the trigger itself for assistive tech — the visible
// tooltip is supplementary.
export function Tooltip({
  label,
  side = "top",
  children,
  className,
  contentClassName,
}: TooltipProps) {
  return (
    <RadixTooltip.Root>
      {/* asChild merges the trigger props onto our wrapper, so layout classes
          the callers pass (ml-auto, min-w-0, max-md:hidden, …) keep working
          exactly as before. flex matches the old wrapper's display. */}
      <RadixTooltip.Trigger asChild>
        <div className={`flex${className ? ` ${className}` : ""}`}>
          {children}
        </div>
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          role="tooltip"
          // `whitespace-nowrap` is the single-line default, but only when no
          // contentClassName is given. We DON'T emit it otherwise: appending a
          // caller's `whitespace-normal` wouldn't reliably win — conflicting
          // Tailwind utilities resolve by stylesheet source order, not string
          // order, so nowrap could silently take precedence and the text would
          // overflow a fixed-width bubble. So a wrapping variant must supply its
          // own whitespace + max-width via contentClassName (see ToolChip).
          className={`pointer-events-none z-50 select-none rounded-md bg-surface-overlay px-2 py-1 text-xs text-white shadow-lg ${
            contentClassName ?? "whitespace-nowrap"
          }`}
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
