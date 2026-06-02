import { Wordmark } from "../brand/Wordmark";
import { ThemeToggle } from "../theme/ThemeToggle";

// Left zone: logo + nav (top), conversation history (list). Stubbed for now — real
// conversation history arrives with persistence.
const stubConversations = [
  "Build me a cozy reading nook",
  "What's overhead right now?",
  "Make the room feel like dusk",
];

export function Sidebar({ onToggle }: { onToggle: () => void }) {
  return (
    <div className="flex h-full flex-col bg-surface-raised text-content-muted">
      <div className="flex items-center gap-2 px-4 py-5">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          className="-ml-1 shrink-0 rounded-md p-1.5 text-content-muted hover:bg-elevated hover:text-content"
        >
          <SidebarToggleIcon />
        </button>
        <Wordmark height={48} />
        <ThemeToggle />
      </div>

      <nav className="px-2">
        <button
          type="button"
          className="w-full rounded-md px-3 py-2 text-left text-sm text-content-muted hover:bg-elevated"
        >
          + New conversation
        </button>
      </nav>

      <div className="mt-4 px-4 text-xs font-medium uppercase tracking-wide text-content-faint">
        Recent
      </div>
      <ul className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {stubConversations.map((title) => (
          <li key={title}>
            <button
              type="button"
              className="w-full truncate rounded-md px-3 py-2 text-left text-sm text-content-muted hover:bg-elevated hover:text-content"
            >
              {title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Standard sidebar glyph: a panel with a divider rail. Used by the header
// collapse button and the floating re-open button in the shell.
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
