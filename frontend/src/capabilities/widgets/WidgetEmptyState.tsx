import { RefreshCw } from "lucide-react";
import { Button } from "../../shell/Button";

// The idle empty state for a data capability. Before any conversation exists it's
// just the invitation. Once a conversation has happened, it offers an Update button
// that asks the agent to fill this panel from what's been discussed — and, if the
// agent strikes out twice (canUpdate flips false), a friendly "Got nothin'!" with a
// way to try again.
//
// When `awaitingClarification` is true, the agent answered an Update with ONE
// clarifying question (it needs a direction) — the question + options are waiting in
// the chat, so we point the user there instead of showing an inert Update button.
export function WidgetEmptyState({
  invitation,
  hasConversation,
  canUpdate,
  onUpdate,
  onReset,
  awaitingClarification,
}: {
  invitation: string;
  hasConversation: boolean;
  canUpdate: boolean;
  onUpdate: () => void;
  onReset: () => void;
  awaitingClarification?: boolean;
}) {
  if (awaitingClarification) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface p-8 text-center">
        <p className="font-display text-base font-semibold text-content">
          One quick question first.
        </p>
        <p className="max-w-sm text-sm text-content-muted">
          I need a little direction to fill this — answer the question in the
          chat (or pick an option) and I'll build it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-surface p-8 text-center">
      <p className="max-w-md text-sm text-content-subtle">{invitation}</p>

      {hasConversation &&
        (canUpdate ? (
          <Button
            variant="secondary"
            onClick={onUpdate}
            icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            // "Update" alone doesn't say update WHAT — the label names the target.
            aria-label="Fill this panel from the conversation"
          >
            Update
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-sm text-content-muted">
              Got nothin'! Nothing in the conversation fit this view.
            </p>
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-content-subtle underline-offset-2 transition-colors hover:text-content hover:underline"
            >
              Try again
            </button>
          </div>
        ))}
    </div>
  );
}
