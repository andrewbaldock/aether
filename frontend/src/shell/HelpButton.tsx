import { Tooltip } from "./Tooltip";
import { useAdminNav } from "./useAdminNav";

// Opens the "Welcome to Aether" explainer. Lives in the sidebar header on
// desktop and the slim top bar on mobile — the persistent way back to the intro
// after its one-time first-arrival auto-open. Clicking it while Welcome is showing
// turns it off (navigates back).
export function HelpButton({ className }: { className?: string }) {
  const { activate } = useAdminNav("welcome");
  return (
    <Tooltip label="What is Aether?" side="bottom" className={className}>
      <button
        type="button"
        onClick={(e) => {
          activate();
          e.currentTarget.blur();
        }}
        aria-label="What is Aether?"
        className="shrink-0 rounded-md border border-transparent p-1.5 text-content-muted transition-colors hover:border-border hover:bg-elevated hover:text-neon-pink"
      >
        <HelpIcon />
      </button>
    </Tooltip>
  );
}

function HelpIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}
