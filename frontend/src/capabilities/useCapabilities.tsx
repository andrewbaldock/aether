import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import type { Widget } from "./registry";

// The capability column's shared state. Both the agent (via tools, later) and the user
// (clicks) drive these same actions — this is the platform's first plugin seam.
interface CapabilityState {
  widgets: Widget[];
  activeId: string | null;
  isFullscreen: boolean;
  // Increments on every EXPLICIT open/activate (a user or agent gesture to bring
  // a widget forward), but NOT on `ensure` (a silent background mount). Lets the
  // mobile shell surface its full-screen overlay on real intent without racing
  // mount timing or diffing activeId. Pure signal; desktop ignores it.
  openTick: number;
  // Widget ids that have received new content the user hasn't looked at yet — a
  // tab updated in the background (or while another tab / the help page was on
  // top). The tab bar shows a glowing dot for each. Cleared when the tab becomes
  // active; never set for the already-active tab (you're looking at it).
  unseen: string[];
}

type Action =
  | { type: "open"; widget: Widget }
  | { type: "ensure"; widget: Widget }
  | { type: "close"; id: string }
  | { type: "activate"; id: string }
  | { type: "markUnseen"; id: string }
  | { type: "setFullscreen"; value: boolean }
  | { type: "closeAll" };

const initialState: CapabilityState = {
  widgets: [],
  activeId: null,
  isFullscreen: false,
  openTick: 0,
  unseen: [],
};

function reducer(state: CapabilityState, action: Action): CapabilityState {
  switch (action.type) {
    case "open": {
      const exists = state.widgets.some((w) => w.id === action.widget.id);
      return {
        ...state,
        widgets: exists ? state.widgets : [...state.widgets, action.widget],
        activeId: action.widget.id,
        openTick: state.openTick + 1,
        // Opening a tab means viewing it — clear its unseen flag.
        unseen: state.unseen.filter((id) => id !== action.widget.id),
      };
    }
    // Add the widget so it's mounted and ready, but DON'T activate or surface it.
    // Used for "prepare in the background" cases (e.g. graph mode is on, so mount
    // the KG tab before data arrives) — on mobile, activating would force the
    // full-screen overlay open over an empty widget.
    case "ensure": {
      const exists = state.widgets.some((w) => w.id === action.widget.id);
      if (exists) return state;
      return {
        ...state,
        widgets: [...state.widgets, action.widget],
        // Keep activeId as-is; if nothing was active, fall back to this one so
        // the column isn't blank, but don't steal focus from an active tab.
        activeId: state.activeId ?? action.widget.id,
      };
    }
    case "close": {
      const widgets = state.widgets.filter((w) => w.id !== action.id);
      const wasActive = state.activeId === action.id;
      return {
        ...state,
        widgets,
        activeId: wasActive ? (widgets.at(-1)?.id ?? null) : state.activeId,
        isFullscreen: widgets.length === 0 ? false : state.isFullscreen,
        unseen: state.unseen.filter((id) => id !== action.id),
      };
    }
    case "activate":
      return {
        ...state,
        activeId: action.id,
        openTick: state.openTick + 1,
        // Viewing a tab clears its unseen flag.
        unseen: state.unseen.filter((id) => id !== action.id),
      };
    // Flag a tab as having new, unviewed content. No-op if it's the active tab
    // (the user is already looking at it) or already flagged.
    case "markUnseen": {
      if (action.id === state.activeId || state.unseen.includes(action.id))
        return state;
      return { ...state, unseen: [...state.unseen, action.id] };
    }
    case "setFullscreen":
      return { ...state, isFullscreen: action.value };
    case "closeAll":
      return initialState;
    default:
      return state;
  }
}

interface CapabilityContextValue extends CapabilityState {
  open: (widget: Widget) => void;
  ensure: (widget: Widget) => void;
  close: (id: string) => void;
  activate: (id: string) => void;
  markUnseen: (id: string) => void;
  setFullscreen: (value: boolean) => void;
  closeAll: () => void;
  isOpen: boolean;
}

const CapabilityContext = createContext<CapabilityContextValue | null>(null);

export function CapabilityProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const open = useCallback(
    (widget: Widget) => dispatch({ type: "open", widget }),
    []
  );
  const ensure = useCallback(
    (widget: Widget) => dispatch({ type: "ensure", widget }),
    []
  );
  const close = useCallback(
    (id: string) => dispatch({ type: "close", id }),
    []
  );
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
  const closeAll = useCallback(() => dispatch({ type: "closeAll" }), []);

  const value = useMemo<CapabilityContextValue>(
    () => ({
      ...state,
      open,
      ensure,
      close,
      activate,
      markUnseen,
      setFullscreen,
      closeAll,
      isOpen: state.widgets.length > 0,
    }),
    [state, open, ensure, close, activate, markUnseen, setFullscreen, closeAll]
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
