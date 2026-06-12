import { useCapabilities } from "../capabilities/useCapabilities";
import { HEALTH_WIDGET } from "../capabilities/widgets/Health";
import { SETTINGS_WIDGET } from "../capabilities/widgets/Settings";
import { WELCOME_WIDGET } from "../capabilities/widgets/Welcome";

// The three "admin" / utility views (Welcome, Settings, Health) form one group:
// non-conversation pages about the app itself. This tab bar lets the user move
// between them directly, replacing the ad-hoc cross-links each page used to carry.
// Each widget renders <AdminTabs /> at the top of its own scroll container, so the
// bar travels with the active page rather than living in the shell chrome.
const TABS = [
  { id: WELCOME_WIDGET.id, label: "Welcome" },
  { id: SETTINGS_WIDGET.id, label: "Settings" },
  { id: HEALTH_WIDGET.id, label: "Health" },
] as const;

export function AdminTabs() {
  const { activeId, activate } = useCapabilities();

  return (
    <nav
      aria-label="Admin pages"
      className="inline-flex rounded-lg border border-border p-0.5"
    >
      {TABS.map((tab) => {
        const active = activeId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => activate(tab.id)}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-surface text-content shadow-sm"
                : "text-content-muted hover:text-content"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
