import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { KNOWLEDGE_GRAPH_ID } from "./catalog";

// The capability column's shared state.
//
// Every capability is ALWAYS available (see catalog.ts) — there is no open/close
// tab lifecycle. The store tracks only:
//   • which capability is the active view (`activeId`),
//   • which capabilities have new, unviewed content (`unseen` → pink glow),
//   • fullscreen, and
//   • `openTick`, an explicit-intent counter the mobile shell watches to surface
//     its full-screen overlay.
//
// The Knowledge Graph is "home base": it is the default active view and the
// fallback whenever nothing else is selected. Activating any capability (or the
// Welcome page) is always allowed — empty capabilities just show their own
// empty-state. Content lives in the per-widget providers, not here.
interface CapabilityState {
  activeId: string;
  isFullscreen: boolean;
  // Bumped on every EXPLICIT activate (a user/agent gesture to bring a view
  // forward). The mobile shell surfaces its overlay on this; pure restore on
  // conversation load deliberately does NOT bump it.
  openTick: number;
  // Capability ids that received new content the user hasn't looked at yet. The
  // toolbar shows a pink glow for each. Cleared when the capability is activated;
  // never set for the already-active one (you're looking at it).
  unseen: string[];
}

type Action =
  | { type: "activate"; id: string }
  | { type: "markUnseen"; id: string }
  | { type: "setFullscreen"; value: boolean }
  | { type: "restore"; activeId: string; unseen: string[] }
  | { type: "reset" };

const initialState: CapabilityState = {
  activeId: KNOWLEDGE_GRAPH_ID,
  isFullscreen: false,
  openTick: 0,
  unseen: [],
};

function reducer(state: CapabilityState, action: Action): CapabilityState {
  switch (action.type) {
    case "activate":
      return {
        ...state,
        activeId: action.id,
        openTick: state.openTick + 1,
        // Viewing a capability clears its unseen flag.
        unseen: state.unseen.filter((id) => id !== action.id),
      };
    // Flag a capability as having new, unviewed content. No-op if it's the active
    // view (already looking at it) or already flagged.
    case "markUnseen": {
      if (action.id === state.activeId || state.unseen.includes(action.id))
        return state;
      return { ...state, unseen: [...state.unseen, action.id] };
    }
    case "setFullscreen":
      return { ...state, isFullscreen: action.value };
    // Rehydrate from a saved conversation in one shot: set the active view and the
    // unseen set atomically. Deliberately does NOT bump openTick — loading a
    // conversation is not "intent" to pop the mobile overlay open. Fullscreen
    // resets so a fresh load never lands in full-page mode.
    case "restore":
      return {
        ...state,
        activeId: action.activeId,
        unseen: action.unseen,
        isFullscreen: false,
      };
    // Back to home base, clean slate (used when switching to an empty session).
    case "reset":
      return initialState;
    default:
      return state;
  }
}

interface CapabilityContextValue extends CapabilityState {
  activate: (id: string) => void;
  markUnseen: (id: string) => void;
  setFullscreen: (value: boolean) => void;
  restore: (activeId: string, unseen: string[]) => void;
  reset: () => void;
}

const CapabilityContext = createContext<CapabilityContextValue | null>(null);

export function CapabilityProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const activate = useCallback(
    (id: string) => dispatch({ type: "activate", id }),
    []
  );
  const markUnseen = useCallback(
    (id: string) => dispatch({ type: "markUnseen", id }),
    []
  );
  const setFullscreen = useCallback(
    (value: boolean) => dispatch({ type: "setFullscreen", value }),
    []
  );
  const restore = useCallback(
    (activeId: string, unseen: string[]) =>
      dispatch({ type: "restore", activeId, unseen }),
    []
  );
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const value = useMemo<CapabilityContextValue>(
    () => ({
      ...state,
      activate,
      markUnseen,
      setFullscreen,
      restore,
      reset,
    }),
    [state, activate, markUnseen, setFullscreen, restore, reset]
  );

  return (
    <CapabilityContext.Provider value={value}>
      {children}
    </CapabilityContext.Provider>
  );
}

export function useCapabilities(): CapabilityContextValue {
  const ctx = useContext(CapabilityContext);
  if (!ctx) {
    throw new Error("useCapabilities must be used within a CapabilityProvider");
  }
  return ctx;
}
