import { RefreshCw } from "lucide-react";

// The idle empty state for a data capability. Before any conversation exists it's
// just the invitation. Once a conversation has happened, it offers an Update button
// that asks the agent to fill this panel from what's been discussed — and, if the
// agent strikes out twice (canUpdate flips false), a friendly "Got nothin'!" with a
// way to try again.
export function WidgetEmptyState({
  invitation,
  hasConversation,
  canUpdate,
  onUpdate,
  onReset,
}: {
  invitation: string;
  hasConversation: boolean;
  canUpdate: boolean;
  onUpdate: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-surface p-8 text-center">
      <p className="max-w-md text-sm text-content-subtle">{invitation}</p>

      {hasConversation &&
        (canUpdate ? (
          <button
            type="button"
            onClick={onUpdate}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-content-muted transition-colors hover:border-content-muted hover:text-content"
            aria-label="Fill this panel from the conversation"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Update
          </button>
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
