import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "../brand/Wordmark";
import { ExploreMenu } from "../capabilities/widgets/ContextMenu";
import { SITE_URL } from "../lib/links";
import { ThemeToggle } from "../theme/ThemeToggle";
import { useModelLabel } from "./ModelPicker";
import { useSessionContext } from "./SessionContext";
import { Tooltip } from "./Tooltip";

export function Sidebar({
  onToggle,
  onNavigate,
}: {
  onToggle: () => void;
  // Called only when the user navigates to a conversation (select an existing
  // session or start a new one). Mobile uses this to dismiss the drawer; the
  // kebab/rename/delete controls intentionally don't trigger it. Optional, so
  // the desktop Sidebar can omit it.
  onNavigate?: () => void;
}) {
  const {
    sessionId,
    sessions,
    messages,
    startNewConversation,
    loadSession,
    renameSession,
    deleteSession,
  } = useSessionContext();

  // Every session returned by the API is shown. A brand-new conversation is
  // persisted (and so appears) the moment its first question is sent — it may be
  // briefly untitled until the post-[DONE] refresh picks up the auto-title, so we
  // fall back to a provisional label for the ACTIVE untitled one (the first user
  // message). Crucially we never *filter out* an untitled session: doing that on
  // `s.title || s.id === sessionId` made a just-created conversation vanish the
  // instant you switched away from it (it lost both its title-check and its
  // active-check), even though its row exists. Untitled non-active rows fall back
  // to a generic label rather than disappearing.
  const visible = sessions;
  // While the chat panel's hero wordmark is on screen (no messages yet), the sidebar
  // shows just the "A" so the brand doesn't read twice; once a conversation starts and
  // the hero is gone, it expands to the full "Aether".
  const started = messages.length > 0;
  const provisionalTitle =
    messages.find((m) => m.role === "user")?.text ?? "New conversation";

  // Resolve each session's saved model id to a short label for the thumbnail.
  // One cached fetch (shared with the picker) labels the whole list.
  const labelForModel = useModelLabel();

  function titleFor(s: (typeof sessions)[number]): string {
    if (s.title) return s.title;
    // The active untitled session can use its live first message; others (e.g. a
    // session created moments ago, not yet refreshed with a title) get a generic
    // label until the next refresh fills it in.
    return s.id === sessionId ? provisionalTitle : "New conversation";
  }

  return (
    <div className="flex h-full flex-col bg-surface-raised text-content-muted">
      <div className="relative flex items-center justify-between px-4 py-3">
        <Tooltip label="Collapse sidebar" side="bottom">
          <button
            type="button"
            onClick={(e) => {
              onToggle();
              e.currentTarget.blur();
            }}
            aria-label="Collapse sidebar"
            className="-ml-1 shrink-0 rounded-md p-1.5 text-content-muted hover:bg-elevated hover:text-content"
          >
            <SidebarToggleIcon />
          </button>
        </Tooltip>
        {/* Absolutely centred against the full bar so the differing widths of the
            toggle (left) and theme toggle (right) don't push it off-centre. The
            wrapper stays pointer-events-none so only the wordmark itself is a
            click target — clicking it goes home / starts a new conversation. */}
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={() => {
              startNewConversation();
              onNavigate?.();
            }}
            aria-label="Aether — new conversation"
            className="pointer-events-auto block rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
          >
            <Wordmark height={28} compact={!started} decorative />
          </button>
        </div>
        <ThemeToggle />
      </div>

      <nav className="px-2">
        <button
          type="button"
          onClick={() => {
            startNewConversation();
            onNavigate?.();
          }}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-content-muted hover:bg-elevated"
        >
          + New conversation
        </button>
      </nav>

      <div className="mt-4 px-4 text-xs font-medium uppercase tracking-wide text-content-faint">
        Recent
      </div>
      <ul className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {visible.length === 0 && (
          <li className="px-3 py-2 text-xs text-content-faint">
            No conversations yet
          </li>
        )}
        {visible.map((s) => (
          <SessionItem
            key={s.id}
            id={s.id}
            title={titleFor(s)}
            date={s.created_at}
            modelLabel={labelForModel(s.model)}
            active={s.id === sessionId}
            onClick={() => {
              loadSession(s.id);
              onNavigate?.();
            }}
            onRename={(t) => renameSession(s.id, t)}
            onDelete={() => deleteSession(s.id)}
          />
        ))}
      </ul>

      <div className="px-4 pb-3 pt-2 text-center">
        <a
          href={SITE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-content-faint transition-colors hover:text-content-muted"
        >
          andrewbaldock.com
        </a>
      </div>
    </div>
  );
}

interface SessionItemProps {
  id: string;
  title: string;
  date: string;
  // Short label of the model this conversation last used (e.g. "Sonnet 4.6").
  // Sessions with no explicit model resolve to the default's label; null only
  // when the allowlist hasn't loaded yet, in which case we show just the date.
  modelLabel: string | null;
  active: boolean;
  onClick: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

function SessionItem({
  title,
  date,
  modelLabel,
  active,
  onClick,
  onRename,
  onDelete,
}: SessionItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when rename mode opens.
  useEffect(() => {
    if (renaming) {
      inputRef.current?.select();
    }
  }, [renaming]);

  function startRename() {
    setDraft(title);
    setRenaming(true);
  }

  function commitRename() {
    const t = draft.trim();
    if (t && t !== title) onRename(t);
    setRenaming(false);
  }

  function handleRenameKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") setRenaming(false);
  }

  return (
    <li className="group relative">
      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleRenameKey}
          className="w-full rounded-md bg-elevated px-3 py-2 text-sm text-content outline-none ring-1 ring-border-strong"
        />
      ) : (
        <button
          type="button"
          onClick={onClick}
          className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-elevated hover:text-content ${
            active ? "bg-selected text-content" : "text-content-muted"
          }`}
        >
          <div className="truncate pr-5">{title}</div>
          <div className="mt-0.5 truncate text-xs text-content-faint">
            {formatDate(date)}
            {modelLabel && ` · ${modelLabel}`}
          </div>
        </button>
      )}

      {/* Kebab menu — always visible on touch (no hover), reveal-on-hover on
          desktop, and pinned visible while its menu is open (data-[state=open]).
          Shares the Radix-backed ExploreMenu primitive with the widgets. */}
      {!renaming && (
        <div className="absolute right-1 top-1.5">
          <ExploreMenu
            label="Session options"
            align="end"
            triggerClassName="inline-flex items-center justify-center rounded p-1 text-content-faint opacity-100 transition-opacity hover:bg-border-strong hover:text-content focus-visible:outline-none data-[state=open]:bg-border-strong data-[state=open]:text-content md:opacity-0 md:group-hover:opacity-100 md:data-[state=open]:opacity-100"
            items={[
              {
                label: "Rename",
                icon: <Pencil className="h-3.5 w-3.5" aria-hidden />,
                onClick: startRename,
              },
              {
                label: "Delete",
                icon: <Trash2 className="h-3.5 w-3.5" aria-hidden />,
                destructive: true,
                onClick: onDelete,
              },
            ]}
          />
        </div>
      )}
    </li>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

export function SidebarToggleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}
