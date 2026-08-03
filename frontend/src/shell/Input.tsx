import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from "react";

// The shared text-entry controls. Before these existed the app had SIX text
// fields across four files and no two were styled alike — the audit that turned
// up the missing Button turned these up too.
//
// But unlike the buttons, the drift here wasn't purely accidental: two distinct
// treatments were in use, and both earn their place.
//
//   field  — a form control in a dialog or panel. Bordered on the page surface,
//            border darkens on focus. The default.
//   inline — editing a value IN PLACE (a conversation title in the sidebar, the
//            chat header). Filled with a ring instead of a border, because here
//            the styling has to say "this text you were just reading is now
//            editable" rather than "this is a form".
//
// So this is deliberately not a single look forced onto both. Anything that is
// neither of those two things probably wants `field`.

type Variant = "field" | "inline";

const BASE =
  "w-full rounded-md text-content transition-colors placeholder:text-content-faint focus:outline-none disabled:opacity-50 read-only:opacity-70";

const VARIANT: Record<Variant, string> = {
  field:
    "border border-border bg-surface px-2 py-1.5 text-sm focus:border-border-strong",
  inline:
    "bg-elevated px-3 py-2 text-sm outline-none ring-1 ring-border-strong focus:ring-border-strong",
};

// Exported for the same reason ICON_BUTTON_CLASS and buttonClass are: a field
// that genuinely can't be one of these components should still read its
// treatment from here rather than hand-copying the string.
export function inputClass(variant: Variant = "field", extra?: string) {
  return `${BASE} ${VARIANT[variant]}${extra ? ` ${extra}` : ""}`;
}

interface Common {
  variant?: Variant;
  className?: string;
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className">,
    Common {
  ref?: Ref<HTMLInputElement>;
}

export function Input({ variant = "field", className, ...rest }: InputProps) {
  return <input {...rest} className={inputClass(variant, className)} />;
}

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">,
    Common {
  ref?: Ref<HTMLTextAreaElement>;
}

// `resize-none` is the default because every textarea in this app lives in a
// sized container (a dialog body, a card back) where a user-dragged resize
// handle would break the layout rather than help. Pass `className="resize-y"`
// if you ever have one that shouldn't be fixed.
export function Textarea({
  variant = "field",
  className,
  ...rest
}: TextareaProps) {
  return (
    <textarea
      {...rest}
      className={inputClass(
        variant,
        `resize-none${className ? ` ${className}` : ""}`
      )}
    />
  );
}
