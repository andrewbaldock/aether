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
//   • the capability widget (knowledge graph / agent diagram) is a full-screen
//     overlay, opened by the same controls that drive the desktop column
//
// The desktop three-zone shell in Shell.tsx is left entirely untouched; this is
// rendered instead of it when useIsMobile() is true.
export function MobileShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { messages } = useSessionContext();
  const { isOpen: capabilityOpen, openTick } = useCapabilities();

  // Mobile shows one surface at a time. The phone ALWAYS opens to the chatbox —
  // the capability widget lives in a full-screen overlay that NEVER appears on
  // load. It surfaces only on a real signal, decided WITHOUT racing mount timing:
  //   • an explicit open/activate gesture (help "?", the "Graph" button, the
  //     graph-mode toggle, a future tool) — tracked by the store's `openTick`,
  //     which bumps on `open`/`activate` but NOT on the background `ensure(KG)`
  //     that merely mounts an empty KG tab when graph mode is on; and
  //   • a graph actually arriving (KG node count crosses 0 → >0), so the user
  //     watches their first graph build even if it wasn't an explicit tap.
  // "← Chat" hides the overlay (widgets survive); "Graph"/"?" bring it back.
  //
  // `hasGraph` also gates the "View graph" top-bar button. The overlay render is
  // NOT gated on hasGraph (Welcome must show with no graph).
  const { nodes } = useKnowledgeGraphState();
  const hasGraph = nodes.length > 0;
  const [showOverlay, setShowOverlay] = useState(false);

  // Explicit open/activate gesture → surface. Skip tick 0 (the initial render);
  // only an actual bump past mount counts.
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
        {/* Once a graph (or any widget) exists, give a way back INTO it from chat.
            Hidden until then, so the empty-state chat stays clean. Pairs with the
            overlay's "← Chat" for the back-and-forth. */}
        {hasGraph && capabilityOpen && (
          <button
            type="button"
            onClick={() => setShowOverlay(true)}
            aria-label="View graph"
            className="ml-auto flex h-11 items-center gap-1.5 rounded-md px-3 text-sm text-content-muted hover:bg-elevated hover:text-content"
          >
            <GraphTabIcon />
            Graph
          </button>
        )}
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

      {/* Capability widget as a full-screen overlay. Only ever shown once a graph
          exists AND the user hasn't hidden it; "← Chat" hides it (widgets survive)
          and "Graph" in the chat top bar brings it back. */}
      {capabilityOpen && showOverlay && (
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
