import { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useCapabilities } from "../capabilities/useCapabilities";
import { GraphPersistenceBridge } from "../capabilities/widgets/KnowledgeGraph/GraphPersistenceBridge";
import { WidgetPersistenceBridge } from "../capabilities/widgets/WidgetPersistenceBridge";
import { parseRoute } from "../hooks/useRoute";
import { CapabilityColumn } from "./CapabilityColumn";
import { ChatPanel } from "./ChatPanel";
import { MobileShell } from "./MobileShell";
import { SessionProvider, useSessionContext } from "./SessionContext";
import { Sidebar, SidebarToggleIcon } from "./Sidebar";
import { Tooltip } from "./Tooltip";
import { useIsMobile } from "./useIsMobile";

// The resize handle: a wide-enough-to-grab hit zone (w-2.5) that's transparent
// at rest, with an always-visible grip pill centered in it so the divider is
// discoverable without hovering. The pill and hit zone both brighten on
// hover/drag. `group` lets the inner grip react to the separator's hover state.
const handle =
  "group relative flex w-2.5 shrink-0 cursor-col-resize items-center justify-center";
const handleGrip =
  "h-8 w-1 rounded-full bg-border transition-colors group-hover:bg-border-strong group-data-[separator-state=hover]:bg-border-strong group-data-[separator-state=drag]:bg-content-subtle";

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
// SessionProvider so it can call loadSession.
function RouteBootstrap() {
  const { loadSession } = useSessionContext();
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only — subsequent navigation is driven by user actions
  useEffect(() => {
    const route = parseRoute(location.pathname);
    if (route.type === "conversation") loadSession(route.sessionId);
  }, []);
  return null;
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
              <span aria-hidden="true" className={handleGrip} />
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
          <CapabilityColumn />
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
