import type { ReactNode } from "react";

// A mobile bottom sheet that explains a tool and lets the user flip it on/off.
// Desktop uses the chip's hover tooltip + instant toggle; touch has no hover, so
// tapping the chip opens this instead — giving the tool a name, an explanation,
// and an explicit switch. Rendered by ChatPanel only on mobile.
//
// Plain fixed-overlay + scrim (no portal): the shell already layers z-indices,
// and this sits above everything at z-50. Tapping the scrim or "Done" closes it.
export function ToolInfoSheet({
  open,
  onClose,
  title,
  icon,
  enabled,
  onToggle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: ReactNode;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 rounded-t-2xl border-t border-border bg-surface-raised px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        {/* Grab handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong" />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-content">
            {icon}
            <span className="text-base font-semibold">{title}</span>
          </div>
          <Switch
            checked={enabled}
            onChange={() => onToggle(!enabled)}
            label={`Turn ${title} ${enabled ? "off" : "on"}`}
          />
        </div>

        <div className="mt-3 text-sm leading-relaxed text-content-muted">
          {children}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-11 w-full rounded-lg bg-elevated text-sm font-medium text-content hover:bg-border-strong"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// A small iOS-style on/off switch. Pink (brand) when on.
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? "bg-neon-pink" : "bg-border-strong"
      }`}
    >
      {/* Track 48px, knob 24px, 2px inset each side → 20px of travel. */}
      <span
        className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[20px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
