import { useEffect, useRef, useState } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { useCapabilities } from "../capabilities/useCapabilities";
import { GraphPersistenceBridge } from "../capabilities/widgets/KnowledgeGraph/GraphPersistenceBridge";
import { CapabilityColumn } from "./CapabilityColumn";
import { ChatPanel } from "./ChatPanel";
import { SessionProvider } from "./SessionContext";
import { Sidebar, SidebarToggleIcon } from "./Sidebar";

const handle =
  "w-1 bg-border transition-colors hover:bg-border-strong data-[separator-state=hover]:bg-border-strong data-[separator-state=drag]:bg-content-subtle";

const SIDEBAR_COLLAPSED_KEY = "aether-sidebar-collapsed";
const SIDEBAR_WIDTH = 240; // px — fixed so the wordmark never gets cramped
const CAPABILITY_SIZE_KEY = "aether-capability-size";
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
      {/* Loads/saves the per-session knowledge graph. Inside SessionProvider so
          it can read sessionId; the graph state itself lives at the app root. */}
      <GraphPersistenceBridge />
      <ShellInner />
    </SessionProvider>
  );
}

function ShellInner() {
  const { isOpen, isFullscreen } = useCapabilities();

  const capabilityRef = usePanelRef();
  const capabilityMounted = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"
  );

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

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

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-surface">
      {!sidebarCollapsed && (
        <div className="shrink-0" style={{ width: SIDEBAR_WIDTH }}>
          <Sidebar onToggle={toggleSidebar} />
        </div>
      )}

      <Group orientation="horizontal" className="min-w-0 flex-1">
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
            // react-resizable-panels sets `overflow: auto` inline on the Panel
            // element; that produced a spurious horizontal scrollbar across the
            // graph column. The widget manages its own width, so clip the x-axis.
            overflowX: "hidden",
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
        <div className="group absolute left-2 top-3 z-10 flex">
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
          <span className="pointer-events-none absolute left-full ml-1.5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-surface-overlay px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            Open sidebar
          </span>
        </div>
      )}
    </div>
  );
}
