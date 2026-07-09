import { HEALTH_WIDGET } from "../capabilities/widgets/Health";
import { METRICS_WIDGET } from "../capabilities/widgets/Metrics";
import { SETTINGS_WIDGET } from "../capabilities/widgets/Settings";
import { STYLEGUIDE_WIDGET } from "../capabilities/widgets/StyleGuide";
import { TOKENLAB_WIDGET } from "../capabilities/widgets/TokenLab";
import { WELCOME_WIDGET } from "../capabilities/widgets/Welcome";
import type { AdminPageId } from "../hooks/useRoute";
import { useAdminNav } from "./useAdminNav";

// The three "admin" / utility views (Welcome, Settings, Health) form one group:
// non-conversation pages about the app itself. This tab bar lets the user move
// between them directly, replacing the ad-hoc cross-links each page used to carry.
// Each widget renders <AdminTabs /> at the top of its own scroll container, so the
// bar travels with the active page rather than living in the shell chrome.
//
// Each tab is its own component so it can call the useAdminNav hook (hooks can't
// run inside a .map). Tabs are URL-driven: clicking one opens its path; clicking
// the active one turns it off (navigates back).
//
// Built inside the component, not at module load: this file sits in an import
// cycle (Welcome/index → WelcomeWidget → AdminTabs → Health/index), so reading
// HEALTH_WIDGET.id at top level can hit the export's temporal dead zone and throw
// "Cannot read properties of undefined (reading 'id')", white-screening the app.
// Reading at render time runs after every module has finished initializing.

export function AdminTabs() {
  const tabs: { id: AdminPageId; label: string }[] = [
    { id: WELCOME_WIDGET.id as AdminPageId, label: "Welcome" },
    { id: SETTINGS_WIDGET.id as AdminPageId, label: "Settings" },
    { id: HEALTH_WIDGET.id as AdminPageId, label: "Health" },
    { id: METRICS_WIDGET.id as AdminPageId, label: "Metrics" },
    { id: STYLEGUIDE_WIDGET.id as AdminPageId, label: "Style Guide" },
    { id: TOKENLAB_WIDGET.id as AdminPageId, label: "Theme Lab" },
    // Dev-only Screenshots tab. The literal "screenshots" (matching
    // SCREENSHOTS_WIDGET.id) rather than an import, so prod never pulls the gallery
    // module into its bundle. In prod the tab simply isn't in the array.
    ...(import.meta.env.DEV
      ? [{ id: "screenshots" as AdminPageId, label: "Screenshots" }]
      : []),
  ];

  return (
    // bg-surface-raised gives the bar its own muted grey-green track (the same
    // token the sidebar uses), so it reads identically on every admin page instead
    // of inheriting whatever each page renders behind it. The active tab's
    // bg-surface (white) then reads as a raised selected pill on that track — a
    // clean segmented-control look.
    <nav
      aria-label="Admin pages"
      className="inline-flex rounded-lg border border-border bg-surface-raised p-0.5"
    >
      {tabs.map((tab) => (
        <AdminTab key={tab.id} id={tab.id} label={tab.label} />
      ))}
    </nav>
  );
}

function AdminTab({ id, label }: { id: AdminPageId; label: string }) {
  const { isActive, activate } = useAdminNav(id);
  return (
    <button
      type="button"
      // Clicking the active tab again turns it off (navigates back).
      onClick={activate}
      aria-current={isActive ? "page" : undefined}
      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        isActive
          ? "bg-surface text-content shadow-sm"
          : "text-content-muted hover:text-content"
      }`}
    >
      {label}
    </button>
  );
}
