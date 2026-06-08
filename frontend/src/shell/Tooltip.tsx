import { type ReactNode, useState } from "react";

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
  // After a click, the trigger keeps mouse :hover and gains :focus, so the
  // group-focus-within bubble lingers even once the cursor leaves. Blur the
  // focused trigger so the bubble follows the cursor — visible on hover, gone on
  // de-hover. Capture phase so we run regardless of inner stopPropagation.
  //
  // Exclude <select> here: a native dropdown stays open only while the element is
  // focused, so blurring it on the OPENING click snaps it shut instantly (flash
  // open → close). The select's lingering bubble is instead dismissed once its
  // menu actually closes — see dismissSelect below.
  function blurTrigger(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const focusable = target.closest<HTMLElement>(
      "button, a, input, [tabindex]"
    );
    if (focusable && focusable.tagName !== "SELECT") focusable.blur();
  }

  // A <select> keeps :focus (and the focus-within bubble) after its menu closes,
  // and blurring it synchronously on `change` isn't enough — the bubble visibly
  // hangs for a beat. So we force the bubble hidden: defer one tick (let the
  // select's focus/menu-close settle), blur the select, then flip `forceHidden`
  // which overrides the CSS opacity to 0. The flag clears on the next real
  // hover/focus (onPointerEnter / onFocus) so the tooltip works again afterward.
  // Triggered on `change` (item picked) and Escape (closed without choosing);
  // clicking away blurs the select natively so it needs no handling here.
  const [forceHidden, setForceHidden] = useState(false);
  function dismissSelect(e: React.SyntheticEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName !== "SELECT") return;
    setTimeout(() => {
      target.blur();
      setForceHidden(true);
    }, 0);
  }
  // The bubble is positioned against this wrapper, so the wrapper needs a
  // positioning context. Default to `relative`, but if the caller supplies their
  // own position utility (e.g. `absolute bottom-2 right-2` to pin the trigger in a
  // corner) don't also emit `relative` — both land in the same cascade layer and
  // `relative` would silently win, dropping the trigger back into normal flow.
  const hasPosition = className
    ? /\b(absolute|fixed|relative|sticky)\b/.test(className)
    : false;
  return (
    <div
      onClickCapture={blurTrigger}
      onChange={dismissSelect}
      onKeyUp={(e) => {
        if (e.key === "Escape") dismissSelect(e);
      }}
      // Re-arm the bubble once the user genuinely returns to the trigger, so the
      // forced-hidden state from a prior menu-close doesn't suppress it forever.
      onPointerEnter={() => forceHidden && setForceHidden(false)}
      onFocus={() => forceHidden && setForceHidden(false)}
      className={`group/tooltip flex${hasPosition ? "" : " relative"}${className ? ` ${className}` : ""}`}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-surface-overlay px-2 py-1 text-xs text-white shadow-lg transition-opacity duration-150 ${SIDE_CLASS[side]} ${
          forceHidden
            ? "opacity-0"
            : "opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
