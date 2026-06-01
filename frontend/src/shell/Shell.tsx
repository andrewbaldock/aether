import { useEffect, useState } from "react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
} from "react-resizable-panels";
import { useCapabilities } from "../capabilities/useCapabilities";
import { CapabilityColumn } from "./CapabilityColumn";
import { ChatPanel } from "./ChatPanel";
import { Sidebar, SidebarToggleIcon } from "./Sidebar";

const handle =
  "w-1 bg-neutral-800 transition-colors hover:bg-neutral-600 data-[separator-state=hover]:bg-neutral-600 data-[separator-state=drag]:bg-neutral-500";

const SIDEBAR_COLLAPSED_KEY = "aether-sidebar-collapsed";

// The three-zone shell. The capability store decides which of the three states renders:
// chat-only · split · capability-fullscreen.
export function Shell() {
  const { isOpen, isFullscreen } = useCapabilities();

  // Sidebar open/closed, persisted across reloads. The Panel is `collapsible`,
  // so we drive collapse()/expand() imperatively via its ref and keep this state
  // in sync (including when the user drags it shut).
  const sidebarRef = usePanelRef();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"
  );

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
    const panel = sidebarRef.current;
    if (!panel) return;
    // Apply our state to the panel without fighting it: only act on a mismatch.
    if (sidebarCollapsed && !panel.isCollapsed()) panel.collapse();
    if (!sidebarCollapsed && panel.isCollapsed()) panel.expand();
  }, [sidebarCollapsed, sidebarRef]);

  const toggleSidebar = () => setSidebarCollapsed((c) => !c);

  // Which panels are mounted depends on the current state, and the panels
  // resize independently in each — so we persist a separate saved layout per
  // combination of mounted panels. useDefaultLayout keys storage on `panelIds`
  // and reads/writes localStorage for us.
  const panelIds = ["sidebar"];
  if (!isFullscreen) panelIds.push("chat");
  if (isOpen) panelIds.push("capability");

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "aether-shell",
    storage: localStorage,
    panelIds,
  });

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-neutral-900">
      <Group
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        {/* Sidebar — resizable + collapsible. v4: bare numbers = px, strings = percentages.
            Fixed-width feel: px sizing so it doesn't grow on large screens. */}
        <Panel
          id="sidebar"
          panelRef={sidebarRef}
          defaultSize={sidebarCollapsed ? 0 : 240}
          minSize={180}
          maxSize={300}
          collapsible
          collapsedSize={0}
          // Keep our state in sync when the user drags the panel shut/open.
          onResize={(size) => {
            const collapsed = size.inPixels === 0;
            setSidebarCollapsed((prev) =>
              prev === collapsed ? prev : collapsed
            );
          }}
        >
          <Sidebar onToggle={toggleSidebar} />
        </Panel>
        {!sidebarCollapsed && <Separator className={handle} />}

        {/* Chat — hidden when a capability is fullscreen */}
        {!isFullscreen && (
          <>
            <Panel id="chat" defaultSize={isOpen ? "50%" : "82%"} minSize="30%">
              <ChatPanel />
            </Panel>
            {isOpen && <Separator className={handle} />}
          </>
        )}

        {/* Capability column — present whenever a widget is open */}
        {isOpen && (
          <Panel
            id="capability"
            defaultSize={isFullscreen ? "82%" : "32%"}
            minSize="20%"
          >
            <CapabilityColumn />
          </Panel>
        )}
      </Group>

      {/* Floating re-open control — the only way back when the sidebar is
          fully collapsed (its own header toggle is gone with it). */}
      {sidebarCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Open sidebar"
          className="absolute left-2 top-3 z-10 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <SidebarToggleIcon />
        </button>
      )}
    </div>
  );
}
