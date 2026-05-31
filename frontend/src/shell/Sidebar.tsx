import { Wordmark } from "../brand/Wordmark";

// Left zone: logo + nav (top), conversation history (list). Stubbed for now — real
// conversation history arrives with persistence.
const stubConversations = [
  "Build me a cozy reading nook",
  "What's overhead right now?",
  "Make the room feel like dusk",
];

export function Sidebar() {
  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-300">
      <div className="flex items-center px-4 py-5">
        <Wordmark height={48} />
      </div>

      <nav className="px-2">
        <button
          type="button"
          className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800"
        >
          + New conversation
        </button>
      </nav>

      <div className="mt-4 px-4 text-xs font-medium uppercase tracking-wide text-neutral-600">
        Recent
      </div>
      <ul className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {stubConversations.map((title) => (
          <li key={title}>
            <button
              type="button"
              className="w-full truncate rounded-md px-3 py-2 text-left text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            >
              {title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
