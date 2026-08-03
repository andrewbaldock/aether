import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Tooltip } from "./Tooltip";

// The shared text button. Before this existed, 21 files hand-rolled their own
// `rounded-lg … px-3 py-1.5 …` string, and the drift was already visible: the
// "secondary" treatment appeared with four slightly different hover rules, and
// two files disagreed about whether disabled meant opacity-40 or opacity-50.
//
// Three variants, taken from what the app actually used — not invented:
//   primary   — the affirmative action (accent fill).      Was 3 hand-rolled copies.
//   secondary — the default/neutral action (outlined).     Was 7, with drift.
//   danger    — destructive confirmation.                  Was 1, in ConfirmDialog.
//
// Icon-ONLY buttons stay with <IconButton>; this is for buttons that carry a
// label, with an optional leading icon.

type Variant = "primary" | "secondary" | "danger";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 max-md:min-h-11";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent font-semibold text-on-accent hover:bg-accent-hover focus-visible:bg-accent-hover",
  secondary:
    "border border-border font-medium text-content-muted hover:bg-elevated hover:text-content focus-visible:bg-elevated focus-visible:text-content",
  danger:
    "bg-danger-surface font-semibold text-danger-content hover:brightness-95 focus-visible:brightness-95",
};

// Exported for the same reason ICON_BUTTON_CLASS is: a button that genuinely
// can't be this component (a Radix `asChild` trigger that also needs a Tooltip,
// say) should still read its treatment from here rather than hand-copying it.
export function buttonClass(variant: Variant = "secondary", extra?: string) {
  return `${BASE} ${VARIANT[variant]}${extra ? ` ${extra}` : ""}`;
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /** Visual treatment. Defaults to the neutral outlined button. */
  variant?: Variant;
  /** Optional leading icon. Size it yourself (h-4 w-4 is the norm). */
  icon?: ReactNode;
  /**
   * Hover/focus hint. Omit it for a self-explanatory label — a tooltip that just
   * repeats the button text is noise for pointer users and a duplicate
   * announcement for screen readers, since the label is already the accessible
   * name. Use it for a shortcut ("⌘↵") or a consequence the label can't carry.
   *
   * NOTE: a tooltip wraps this button in a Radix Tooltip tree, so a Button with
   * `tooltip` set CANNOT also be a Radix `asChild` trigger. Leave it off there.
   */
  tooltip?: string;
  /** Which side the tooltip prefers. Radix overrides on collision. */
  tooltipSide?: "top" | "right" | "bottom" | "left";
  className?: string;
  children: ReactNode;
  /**
   * Forwarded to the underlying <button>. This is the thing IconButton can't do
   * — which is why Radix `asChild` triggers there have to hand-roll a raw button
   * (see ExploreMenu). Under React 19 `ref` is an ordinary prop, so a plain
   * function component can accept one and Radix can clone it.
   */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "secondary",
  icon,
  tooltip,
  tooltipSide = "top",
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const button = (
    <button {...rest} type={type} className={buttonClass(variant, className)}>
      {icon}
      {children}
    </button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip label={tooltip} side={tooltipSide}>
      {button}
    </Tooltip>
  );
}
