import { useEffect, useRef, useState } from "react";
import { Wordmark } from "../brand/Wordmark";
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
            toggle (left) and theme toggle (right) don't push it off-centre. */}
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
          <Wordmark height={28} compact={!started} />
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
          href={
            import.meta.env.DEV
              ? "http://localhost:5173"
              : "https://andrewbaldock.com"
          }
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Focus input when rename mode opens.
  useEffect(() => {
    if (renaming) {
      inputRef.current?.select();
    }
  }, [renaming]);

  function startRename() {
    setDraft(title);
    setRenaming(true);
    setMenuOpen(false);
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

      {/* Kebab button — visible on hover or when menu is open */}
      {!renaming && (
        <div ref={menuRef} className="absolute right-1 top-1.5">
          <button
            type="button"
            aria-label="Session options"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className={`rounded p-1 text-content-faint hover:bg-border-strong hover:text-content ${
              menuOpen
                ? "bg-border-strong text-content opacity-100"
                : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <KebabIcon />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-border bg-surface-raised py-1 shadow-md">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startRename();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-content hover:bg-elevated"
              >
                <PencilIcon />
                Rename
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-danger-content hover:bg-elevated"
              >
                <TrashIcon />
                Delete
              </button>
            </div>
          )}
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

function KebabIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
