import { useEffect, useState } from "react";
import { Wordmark } from "../brand/Wordmark";
import { useCapabilities } from "../capabilities/useCapabilities";
import { CapabilityColumn } from "./CapabilityColumn";
import { ChatPanel } from "./ChatPanel";
import { useSessionContext } from "./SessionContext";
import { Sidebar, SidebarToggleIcon } from "./Sidebar";

// Single-column mobile layout (< md). One surface at a time:
//   • chat is the default full-screen view, with a slim top bar
//   • the sidebar is an off-canvas drawer over the chat
//   • the capability widget (knowledge graph / agent diagram) is a full-screen
//     overlay, opened by the same controls that drive the desktop column
//
// The desktop three-zone shell in Shell.tsx is left entirely untouched; this is
// rendered instead of it when useIsMobile() is true.
export function MobileShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { messages } = useSessionContext();
  const { isOpen: capabilityOpen, activeId } = useCapabilities();

  // Mobile shows one surface at a time. The capability widget lives in a
  // full-screen overlay that "back" should HIDE (not destroy — the widgets
  // survive in the store). Re-surface it whenever a widget is opened or its
  // active tab changes (toggling graph mode, the eyeball, the help icon), which
  // mirrors how opening a widget reveals the column on desktop.
  const [showOverlay, setShowOverlay] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeId is the trigger; we re-show whenever the active widget changes.
  useEffect(() => {
    if (capabilityOpen) setShowOverlay(true);
  }, [activeId, capabilityOpen]);

  // Match the desktop sidebar's compact-wordmark rule: full "Aether" once a
  // conversation has started, just the "A" on the empty hero state.
  const started = messages.length > 0;

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-surface">
      {/* Top bar: hamburger + wordmark. Kept slim so the chat dominates. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-2 py-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open sidebar"
          className="flex h-11 w-11 items-center justify-center rounded-md text-content-muted hover:bg-elevated hover:text-content"
        >
          <SidebarToggleIcon />
        </button>
        <Wordmark height={24} compact={!started} />
      </div>

      {/* Chat fills the remaining height. min-h-0 lets its internal scroll
          region shrink instead of pushing the input off-screen. */}
      <div className="min-h-0 flex-1">
        <ChatPanel />
      </div>

      {/* Sidebar drawer + scrim */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setDrawerOpen(false)}
          className="absolute inset-0 z-20 bg-black/40"
        />
      )}
      <div
        className={`absolute inset-y-0 left-0 z-30 w-[280px] max-w-[85vw] transform transition-transform duration-200 ease-out ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        // Any tap that ends up changing the session (list item or "New
        // conversation") should dismiss the drawer. Buttons inside Sidebar do
        // the actual work; we just close on the bubbled click.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) setDrawerOpen(false);
        }}
      >
        <Sidebar onToggle={() => setDrawerOpen(false)} />
      </div>

      {/* Capability widget as a full-screen overlay. Shown while a widget is
          open AND not hidden; "back" hides it (widgets survive) and returns to
          chat. Opening/activating any widget re-surfaces it (see the effect). */}
      {capabilityOpen && showOverlay && (
        <div className="absolute inset-0 z-40 flex flex-col bg-surface">
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-2 py-2">
            <button
              type="button"
              onClick={() => setShowOverlay(false)}
              aria-label="Back to chat"
              className="flex h-11 items-center gap-1.5 rounded-md px-3 text-sm text-content-muted hover:bg-elevated hover:text-content"
            >
              <BackIcon />
              Chat
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <CapabilityColumn />
          </div>
        </div>
      )}
    </div>
  );
}

function BackIcon() {
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
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
