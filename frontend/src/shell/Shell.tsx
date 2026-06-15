import { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useCapabilities } from "../capabilities/useCapabilities";
import { GraphPersistenceBridge } from "../capabilities/widgets/KnowledgeGraph/GraphPersistenceBridge";
import { WidgetPersistenceBridge } from "../capabilities/widgets/WidgetPersistenceBridge";
import { parseRoute, useRoute } from "../hooks/useRoute";
import { CapabilityColumn } from "./CapabilityColumn";
import { ChatPanel } from "./ChatPanel";
import { MobileShell } from "./MobileShell";
import { SessionProvider, useSessionContext } from "./SessionContext";
import { Sidebar, SidebarToggleIcon } from "./Sidebar";
import { Tooltip } from "./Tooltip";
import { useIsMobile } from "./useIsMobile";

// The resize handle IS the 1px divider line: it takes only 1px of layout width
// so both panels butt flush against it (no gap on either side). The grab area is
// widened invisibly via the `before` pseudo (-inset-x-1.5, transparent) which
// overflows ±6px without consuming layout. The line itself (the element's own
// bg) and the grip + dots brighten on hover/drag. `group` lets the grip react to
// the separator's hover state.
const handle =
  "group relative flex w-0.5 shrink-0 cursor-col-resize items-center justify-center bg-border transition-colors hover:bg-border-strong data-[separator-state=hover]:bg-border-strong data-[separator-state=drag]:bg-content-subtle before:absolute before:inset-y-0 before:-inset-x-1.5 before:content-['']";
// The grip: a rounded pill riding on the hairline, holding three dot bumps. Its
// background matches the panels so the hairline appears to break around it.
const handleGrip =
  "relative flex flex-col items-center gap-1 rounded-full bg-surface px-[3px] py-1.5";
const handleDot =
  "h-1 w-1 rounded-full bg-border transition-colors group-hover:bg-border-strong group-data-[separator-state=hover]:bg-border-strong group-data-[separator-state=drag]:bg-content-subtle";

const SIDEBAR_COLLAPSED_KEY = "aether-sidebar-collapsed";
const SIDEBAR_WIDTH = 240; // px — fixed so the wordmark never gets cramped

// The capability column width is chrome, not conversation state: it lives ONLY
// in localStorage, keyed per device, and NEVER travels with a shared/loaded
// conversation. (Conversation ui_state stores the active VIEW, never sizing — a
// link opened on another browser must not inherit this machine's column width.)
const CAPABILITY_SIZE_KEY = "aether-capability-size";
const CAPABILITY_DEFAULT_SIZE = 36; // percent — a comfortable default on desktop
// Clamp range. Both panels have their own minSize too, but a localStorage value
// outside this band (corrupt, or saved on a very different viewport) could push
// the column off-screen or crush the chat — so we sanitise on read.
const CAPABILITY_MIN_SIZE = 20;
const CAPABILITY_MAX_SIZE = 60;

// Resolve the column's start width. With no usable localStorage value (first
// visit, or a browser that blocked it) we fall back to a safe default; any saved
// value is clamped into a sane band so the column is always clearly on-screen.
function readCapabilitySize(): number {
  let saved = NaN;
  try {
    saved = Number(localStorage.getItem(CAPABILITY_SIZE_KEY));
  } catch {
    // localStorage can throw (private mode, blocked storage) — fall through to
    // the safe default rather than crash the shell.
  }
  if (!Number.isFinite(saved) || saved <= 0) return CAPABILITY_DEFAULT_SIZE;
  return Math.min(CAPABILITY_MAX_SIZE, Math.max(CAPABILITY_MIN_SIZE, saved));
}

// Hydrates the active session from the URL on first mount. Must live inside
// SessionProvider so it can call loadSession. (Admin pages are handled reactively
// by useUrlDrivenAdmin, not here — they're URL-driven, not session-driven.)
function RouteBootstrap() {
  const { loadSession } = useSessionContext();
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only — subsequent navigation is driven by user actions
  useEffect(() => {
    const route = parseRoute(location.pathname);
    if (route.type === "workspace" && route.sessionId) {
      // The cold-URL-load flag for the restore-loading sequence is set
      // synchronously in SessionProvider's render from this same initial URL — see
      // consumeColdUrlLoad — so an effect-vs-child-render race can't drop it.
      loadSession(route.sessionId);
    }
  }, []);
  return null;
}

// Admin half of the URL→activeId projection: when the route is an admin page,
// activate its widget. Leaving an admin route does NOTHING here — the workspace
// projection in ChatPanel re-activates the workspace view from the URL (the URL is
// the single source of truth, so whatever /c/:id/:view or /:view we land on drives
// activeId). This keeps one writer per concern: admin routes here, workspace routes
// there, never both touching the store for the same transition.
function useUrlDrivenAdmin() {
  const route = useRoute();
  const { activate } = useCapabilities();
  const adminId = route.type === "admin" ? route.id : null;

  useEffect(() => {
    if (!adminId) return;
    if (adminId === "screenshots") {
      // Dev-only: the renderer is only registered in dev; in prod nothing
      // navigates here and the gallery module isn't bundled, so this arm never
      // runs in prod. Import the widget (registering its renderer) THEN activate —
      // the registry has no React subscription, so a renderer that lands after the
      // column rendered won't re-render it; activating only once registered avoids
      // the "No renderer registered" flash.
      if (import.meta.env.DEV) {
        void import("../capabilities/widgets/Screenshots").then(() =>
          activate("screenshots")
        );
      }
    } else {
      activate(adminId);
    }
  }, [adminId, activate]);
}

// The three-zone shell. SessionProvider wraps everything so Sidebar and
// ChatPanel share the same session + message state.
export function Shell() {
  return (
    <SessionProvider>
      {/* Loads/saves the per-session knowledge graph. Inside SessionProvider so
          it can read sessionId; the graph state itself lives at the app root. */}
      <GraphPersistenceBridge />
      {/* Loads/saves table + chart widget specs for the active session. */}
      <WidgetPersistenceBridge />
      <RouteBootstrap />
      <ShellInner />
    </SessionProvider>
  );
}

function ShellInner() {
  const isMobile = useIsMobile();
  const { isFullscreen } = useCapabilities();

  // The URL drives which admin page (if any) is active.
  useUrlDrivenAdmin();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"
  );

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const toggleSidebar = () => setSidebarCollapsed((c) => !c);

  // The capability column is ALWAYS present now (the Knowledge Graph is home
  // base — it never turns off), so there's no open/collapse machinery: the
  // column simply opens at a safe, clamped, localStorage-or-default width. This
  // is what makes the third column reliably visible — it can no longer launch
  // collapsed or be pushed off-screen by stale conversation state.
  const savedCapabilitySize = readCapabilitySize();

  // Mobile gets a single-column, view-switched layout. Branch here — after all
  // hooks have run, so hook order stays stable across the breakpoint — rather
  // than retrofitting the resizable desktop grid onto a phone.
  if (isMobile) return <MobileShell />;

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-surface">
      {!sidebarCollapsed && (
        <div className="shrink-0" style={{ width: SIDEBAR_WIDTH }}>
          <Sidebar onToggle={toggleSidebar} />
        </div>
      )}

      <Group
        // Remount the group when fullscreen toggles so the panels re-derive their
        // sizes from defaultSize (the chat panel is removed/added by isFullscreen).
        key={isFullscreen ? "fullscreen" : "split"}
        orientation="horizontal"
        className="min-w-0 flex-1"
      >
        {!isFullscreen && (
          <>
            <Panel
              id="chat"
              defaultSize={`${100 - savedCapabilitySize}%`}
              minSize="30%"
              style={{ overflow: "hidden" }}
            >
              <ChatPanel />
            </Panel>
            <Separator className={handle}>
              <span aria-hidden="true" className={handleGrip}>
                <span className={handleDot} />
                <span className={handleDot} />
                <span className={handleDot} />
              </span>
            </Separator>
          </>
        )}

        <Panel
          id="capability"
          defaultSize={isFullscreen ? "100%" : `${savedCapabilitySize}%`}
          minSize="20%"
          style={{
            // react-resizable-panels sets `overflow: auto` inline on the Panel
            // element; that produced a spurious horizontal scrollbar across the
            // graph column. The widget manages its own width, so clip the x-axis.
            overflowX: "hidden",
          }}
          onResize={(size) => {
            if (size.asPercentage && size.asPercentage > 0) {
              try {
                localStorage.setItem(
                  CAPABILITY_SIZE_KEY,
                  String(size.asPercentage)
                );
              } catch {
                // Storage blocked — fine; the width just won't persist.
              }
            }
          }}
        >
          <CapabilityColumn sidebarCollapsed={sidebarCollapsed} />
        </Panel>
      </Group>

      {sidebarCollapsed && (
        <Tooltip
          label="Open sidebar"
          side="right"
          className="absolute left-2 top-3 z-10"
        >
          <button
            type="button"
            onClick={(e) => {
              toggleSidebar();
              e.currentTarget.blur();
            }}
            aria-label="Open sidebar"
            className="rounded-md p-1.5 text-content-muted hover:bg-elevated hover:text-content"
          >
            <SidebarToggleIcon />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
