import { useEffect, useRef, useState } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { useCapabilities } from "../capabilities/useCapabilities";
import { CapabilityColumn } from "./CapabilityColumn";
import { ChatPanel } from "./ChatPanel";
import { Sidebar, SidebarToggleIcon } from "./Sidebar";

const handle =
  "w-1 bg-border transition-colors hover:bg-border-strong data-[separator-state=hover]:bg-border-strong data-[separator-state=drag]:bg-content-subtle";

const SIDEBAR_COLLAPSED_KEY = "aether-sidebar-collapsed";
const SIDEBAR_SIZE_KEY = "aether-sidebar-size";
const CAPABILITY_SIZE_KEY = "aether-capability-size";
const SIDEBAR_DEFAULT_SIZE = 240; // px
const CAPABILITY_DEFAULT_SIZE = 32; // percent

// Percent the capability panel occupies when expanded: the user's last saved
// width, falling back to the design default. A missing/unparseable key → NaN/0
// → falls through to the default.
function readCapabilitySize(): number {
  const saved = Number(localStorage.getItem(CAPABILITY_SIZE_KEY));
  return saved > 0 ? saved : CAPABILITY_DEFAULT_SIZE;
}

// The three-zone shell. The capability store decides which of the three states renders:
// chat-only · split · capability-fullscreen.
export function Shell() {
  const { isOpen, isFullscreen } = useCapabilities();

  // Sidebar open/closed, persisted across reloads. The Panel is `collapsible`,
  // so we drive collapse()/expand() imperatively via its ref and keep this state
  // in sync (including when the user drags it shut).
  const sidebarRef = usePanelRef();
  const capabilityRef = usePanelRef();
  // Track whether we've done the first layout so we don't animate on mount.
  const capabilityMounted = useRef(false);
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

  // Drive the capability panel open/closed imperatively so it slides rather
  // than pops. Skip on first render (panel not yet measured).
  useEffect(() => {
    const panel = capabilityRef.current;
    if (!panel) return;
    // First render: panel mounted at defaultSize. If nothing is open yet (always
    // true right after a reload — the store is in-memory and starts empty),
    // collapse to 0 without animating. We never rely on the library's restored
    // size afterward; re-expansion always resizes to the saved width explicitly.
    if (!capabilityMounted.current) {
      capabilityMounted.current = true;
      if (!isOpen) panel.collapse();
      return;
    }
    if (isOpen) {
      // Expand first so the panel leaves the collapsed (flex-basis 0) state, then
      // resize to the authoritative saved width in the SAME tick. Both commit
      // synchronously through the library's applier, so resize wins over whatever
      // expand() restored — we never open at the wrong default. One 0→saved slide.
      // NB: resize() reads a bare number as PIXELS, so pass a "%"-suffixed string.
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
        {/* Sidebar — resizable + collapsible. v4: bare numbers = px, strings = percentages.
            Fixed-width feel: px sizing so it doesn't grow on large screens. */}
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

        {/* Chat — hidden when a capability is fullscreen */}
        {!isFullscreen && (
          <>
            <Panel id="chat" defaultSize={isOpen ? "50%" : "82%"} minSize="30%">
              <ChatPanel />
            </Panel>
            <Separator className={handle} />
          </>
        )}

        {/* Capability column — always mounted so it can slide in/out smoothly.
            Collapsed when no widget is open; expanded imperatively via effect. */}
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

      {/* Floating re-open control — the only way back when the sidebar is
          fully collapsed (its own header toggle is gone with it). */}
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
