import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ReactNode } from "react";

// A small, app-styled confirm dialog built on Radix AlertDialog — a centered modal
// with a focus trap, Escape-to-cancel, and role=alertdialog a11y, for confirming an
// action before it runs. The caller supplies its own trigger (so the dialog wraps
// whatever button it guards) and the affirmative action; Cancel always just closes.
//
// `affirmative` styles the confirm button: "primary" for a reversible action (the
// default — e.g. hide-from-canvas, which can be undone), "danger" for a genuinely
// destructive one. Kept generic so future destructive confirms reuse this instead of
// each rolling its own modal.
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  affirmative = "primary",
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  affirmative?: "primary" | "danger";
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-9998 bg-black/40 backdrop-blur-[1px]" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-9999 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-strong bg-surface-raised p-5 shadow-2xl focus:outline-none">
          <AlertDialog.Title className="font-display text-base font-semibold text-content">
            {title}
          </AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="mt-2 text-sm text-content-muted">
              {description}
            </AlertDialog.Description>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-content-muted transition-colors hover:bg-elevated hover:text-content focus-visible:bg-elevated focus-visible:outline-none"
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                onClick={onConfirm}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none ${
                  affirmative === "danger"
                    ? "bg-danger-surface text-danger-content hover:brightness-95"
                    : "bg-accent text-on-accent hover:bg-accent-hover"
                }`}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
