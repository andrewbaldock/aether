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
}

type Action =
  | { type: "open"; widget: Widget }
  | { type: "close"; id: string }
  | { type: "activate"; id: string }
  | { type: "setFullscreen"; value: boolean }
  | { type: "closeAll" };

const initialState: CapabilityState = {
  widgets: [],
  activeId: null,
  isFullscreen: false,
};

function reducer(state: CapabilityState, action: Action): CapabilityState {
  switch (action.type) {
    case "open": {
      const exists = state.widgets.some((w) => w.id === action.widget.id);
      return {
        ...state,
        widgets: exists ? state.widgets : [...state.widgets, action.widget],
        activeId: action.widget.id,
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
      };
    }
    case "activate":
      return { ...state, activeId: action.id };
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
  close: (id: string) => void;
  activate: (id: string) => void;
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
  const close = useCallback(
    (id: string) => dispatch({ type: "close", id }),
    []
  );
  const activate = useCallback(
    (id: string) => dispatch({ type: "activate", id }),
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
      close,
      activate,
      setFullscreen,
      closeAll,
      isOpen: state.widgets.length > 0,
    }),
    [state, open, close, activate, setFullscreen, closeAll]
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
