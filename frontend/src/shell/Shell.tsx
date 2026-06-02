import { useEffect, useRef, useState } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { useCapabilities } from "../capabilities/useCapabilities";
import { CapabilityColumn } from "./CapabilityColumn";
import { ChatPanel } from "./ChatPanel";
import { SessionProvider } from "./SessionContext";
import { Sidebar, SidebarToggleIcon } from "./Sidebar";

const handle =
  "w-1 bg-border transition-colors hover:bg-border-strong data-[separator-state=hover]:bg-border-strong data-[separator-state=drag]:bg-content-subtle";

const SIDEBAR_COLLAPSED_KEY = "aether-sidebar-collapsed";
const SIDEBAR_SIZE_KEY = "aether-sidebar-size";
const CAPABILITY_SIZE_KEY = "aether-capability-size";
const SIDEBAR_DEFAULT_SIZE = 240; // px
const CAPABILITY_DEFAULT_SIZE = 32; // percent

function readCapabilitySize(): number {
  const saved = Number(localStorage.getItem(CAPABILITY_SIZE_KEY));
  return saved > 0 ? saved : CAPABILITY_DEFAULT_SIZE;
}

// The three-zone shell. SessionProvider wraps everything so Sidebar and
// ChatPanel share the same session + message state.
export function Shell() {
  return (
    <SessionProvider>
      <ShellInner />
    </SessionProvider>
  );
}

function ShellInner() {
  const { isOpen, isFullscreen } = useCapabilities();

  const sidebarRef = usePanelRef();
  const capabilityRef = usePanelRef();
  const capabilityMounted = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"
  );

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
    const panel = sidebarRef.current;
    if (!panel) return;
    if (sidebarCollapsed && !panel.isCollapsed()) panel.collapse();
    if (!sidebarCollapsed && panel.isCollapsed()) panel.expand();
  }, [sidebarCollapsed, sidebarRef]);

  const toggleSidebar = () => setSidebarCollapsed((c) => !c);

  useEffect(() => {
    const panel = capabilityRef.current;
    if (!panel) return;
    if (!capabilityMounted.current) {
      capabilityMounted.current = true;
      if (!isOpen) panel.collapse();
      return;
    }
    if (isOpen) {
      panel.expand();
      panel.resize(`${readCapabilitySize()}%`);
    } else {
      panel.collapse();
    }
  }, [isOpen, capabilityRef]);

  const savedCapabilitySize = readCapabilitySize();
  const savedSidebarSize =
    Number(localStorage.getItem(SIDEBAR_SIZE_KEY)) || SIDEBAR_DEFAULT_SIZE;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-surface">
      <Group orientation="horizontal">
        <Panel
          id="sidebar"
          panelRef={sidebarRef}
          defaultSize={sidebarCollapsed ? 0 : savedSidebarSize}
          minSize={180}
          maxSize={300}
          collapsible
          collapsedSize={0}
          onResize={(size) => {
            const collapsed = size.inPixels === 0;
            setSidebarCollapsed((prev) =>
              prev === collapsed ? prev : collapsed
            );
            if (size.inPixels > 0) {
              localStorage.setItem(SIDEBAR_SIZE_KEY, String(size.inPixels));
            }
          }}
        >
          <Sidebar onToggle={toggleSidebar} />
        </Panel>
        {!sidebarCollapsed && <Separator className={handle} />}

        {!isFullscreen && (
          <>
            <Panel id="chat" defaultSize={isOpen ? "50%" : "82%"} minSize="30%">
              <ChatPanel />
            </Panel>
            <Separator className={handle} />
          </>
        )}

        <Panel
          id="capability"
          panelRef={capabilityRef}
          defaultSize={savedCapabilitySize}
          minSize="20%"
          collapsible
          collapsedSize={0}
          style={{
            transition: "flex-basis 280ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onResize={(size) => {
            if (size.asPercentage && size.asPercentage > 0) {
              localStorage.setItem(
                CAPABILITY_SIZE_KEY,
                String(size.asPercentage)
              );
            }
          }}
        >
          <CapabilityColumn />
        </Panel>
      </Group>

      {sidebarCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Open sidebar"
          className="absolute left-2 top-3 z-10 rounded-md p-1.5 text-content-muted hover:bg-elevated hover:text-content"
        >
          <SidebarToggleIcon />
        </button>
      )}
    </div>
  );
}
