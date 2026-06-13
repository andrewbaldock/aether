import { useEffect, useRef, useState } from "react";
import { Wordmark } from "../brand/Wordmark";
import { useCapabilities } from "../capabilities/useCapabilities";
import { useKnowledgeGraphState } from "../capabilities/widgets/KnowledgeGraph/useKnowledgeGraphState";
import { CapabilityColumn } from "./CapabilityColumn";
import { ChatPanel } from "./ChatPanel";
import { useSessionContext } from "./SessionContext";
import { Sidebar, SidebarToggleIcon } from "./Sidebar";

// Single-column mobile layout (< md). One surface at a time:
//   • chat is the default full-screen view, with a slim top bar
//   • the sidebar is an off-canvas drawer over the chat
//   • the capability column (graph / table / chart / … with its chip toolbar) is
//     a full-screen overlay, reached from the "Canvas" button in the top bar
//
// The desktop three-zone shell in Shell.tsx is left entirely untouched; this is
// rendered instead of it when useIsMobile() is true.
export function MobileShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { messages } = useSessionContext();
  const { openTick } = useCapabilities();

  // Mobile shows one surface at a time. The phone ALWAYS opens to the chatbox —
  // the capability column lives in a full-screen overlay that NEVER appears on
  // load. The "Canvas" button in the top bar opens it on demand; from inside, the
  // chip toolbar switches between capabilities and "← Chat" returns.
  //
  // It also auto-surfaces on a real signal, decided WITHOUT racing mount timing:
  //   • an explicit activate gesture (a chip, the help "?", a future tool) —
  //     tracked by the store's `openTick`, which bumps on `activate` but NOT on
  //     the silent restore that runs on conversation load; and
  //   • a graph actually arriving (KG node count crosses 0 → >0), so the user
  //     watches their first graph build even if it wasn't an explicit tap.
  const { nodes } = useKnowledgeGraphState();
  const hasGraph = nodes.length > 0;
  const [showOverlay, setShowOverlay] = useState(false);

  // Explicit activate gesture → surface. Skip tick 0 (the initial render); only
  // an actual bump past mount counts.
  const prevTick = useRef(openTick);
  useEffect(() => {
    if (openTick !== prevTick.current) {
      prevTick.current = openTick;
      setShowOverlay(true);
    }
  }, [openTick]);

  // First time a real graph lands, auto-surface once.
  const sawGraph = useRef(false);
  useEffect(() => {
    if (hasGraph && !sawGraph.current) {
      sawGraph.current = true;
      setShowOverlay(true);
    }
  }, [hasGraph]);

  // Match the desktop sidebar's compact-wordmark rule: full "Aether" once a
  // conversation has started, just the "A" on the empty hero state.
  const started = messages.length > 0;

  return (
    <div className="relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-surface">
      {/* Top bar: hamburger + wordmark. Kept slim so the chat dominates.
          dvh root (above) tracks the iOS URL bar/keyboard; the safe-area top
          padding clears the notch. */}
      <div className="relative flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open sidebar"
          className="flex h-11 w-11 items-center justify-center rounded-md text-content-muted hover:bg-elevated hover:text-content"
        >
          <SidebarToggleIcon />
        </button>
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
          <Wordmark height={24} compact={!started} />
        </div>
        {/* Always-available way into the capability column (graph + tools). The
            chip toolbar lives inside the overlay; this just opens it. Pairs with
            the overlay's "← Chat" for the back-and-forth. */}
        <button
          type="button"
          onClick={() => setShowOverlay(true)}
          aria-label="Open canvas"
          className="ml-auto flex h-11 items-center gap-1.5 rounded-md px-3 text-sm text-content-muted hover:bg-elevated hover:text-content"
        >
          <GraphTabIcon />
          Canvas
        </button>
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
      >
        {/* Only navigation intent (select a session / new conversation) dismisses
            the drawer — Sidebar calls onNavigate for exactly those. The kebab,
            rename, and delete controls leave the drawer open. */}
        <Sidebar
          onToggle={() => setDrawerOpen(false)}
          onNavigate={() => setDrawerOpen(false)}
        />
      </div>

      {/* Capability column as a full-screen overlay. Shown when the user opens it
          ("Canvas") or an activate gesture / first graph surfaces it; "← Chat"
          hides it (the column state survives) and "Canvas" brings it back. */}
      {showOverlay && (
        <div className="absolute inset-0 z-40 flex flex-col bg-surface">
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
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
            {/* Mobile is a single-column overlay — no collapsed sidebar to clear. */}
            <CapabilityColumn sidebarCollapsed={false} />
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

// Node-link glyph for the "View graph" button — mirrors the Knowledge Graph
// tool chip's icon so the two read as the same capability.
function GraphTabIcon() {
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
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="9" r="2.5" />
      <circle cx="9" cy="18" r="2.5" />
      <path d="M8 7.5l8 1M8 16l1-7" />
    </svg>
  );
}
