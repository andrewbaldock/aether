import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTheme } from "../../../theme/useTheme";

// Theme Lab overrides: live edits to the color tokens, persisted to localStorage
// and applied by writing the intermediate custom properties (--accent, --surface,
// …) inline onto <html>. Because every utility resolves through var(--accent) and
// an inline style beats both the :root and .dark stylesheet rules on the same
// element, one setProperty re-themes the whole app with no React re-render.
//
// Overrides are stored PER MODE ({ light, dark }) because the palette differs
// between them — applying one flat set would clobber the other on theme toggle.
// The apply effect re-runs on theme change and swaps to the active mode's set.
//
// SCOPE: localStorage only (like theme/font — see useAppearance). No zero-flash
// pre-paint script yet, so a hard reload flashes the committed defaults for a
// frame before overrides apply.
// ponytail: skip pre-paint; add an index.html seed like useTheme's if the flash bugs.

type Mode = "light" | "dark";
export type Overrides = Record<Mode, Record<string, string>>;

const KEY = "aether-token-overrides";

function getInitial(): Overrides {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.light && parsed?.dark) return parsed;
    }
  } catch {
    // Malformed blob — fall through to empty.
  }
  return { light: {}, dark: {} };
}

interface TokenLabContextValue {
  theme: Mode;
  // The active mode's overrides — what the page edits and displays.
  overrides: Record<string, string>;
  setToken: (name: string, value: string) => void;
  clearToken: (name: string) => void;
  resetAll: () => void;
  // Both modes, for the "Copy CSS" export.
  all: Overrides;
}

const TokenLabContext = createContext<TokenLabContextValue | null>(null);

export function TokenLabProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [all, setAll] = useState<Overrides>(getInitial);

  // Apply the active mode's overrides to <html> and persist. Re-runs on theme
  // change (swapping which set is live) and on any edit. We remove-then-set every
  // token name that appears in EITHER mode, so switching light→dark never leaves a
  // light override stuck inline.
  useEffect(() => {
    const root = document.documentElement;
    const active = all[theme];
    const names = new Set([
      ...Object.keys(all.light),
      ...Object.keys(all.dark),
    ]);
    for (const name of names) {
      const value = active[name];
      if (value) root.style.setProperty(`--${name}`, value);
      else root.style.removeProperty(`--${name}`);
    }
    localStorage.setItem(KEY, JSON.stringify(all));
  }, [all, theme]);

  const setToken = useCallback(
    (name: string, value: string) => {
      setAll((o) => ({ ...o, [theme]: { ...o[theme], [name]: value } }));
    },
    [theme]
  );

  const clearToken = useCallback(
    (name: string) => {
      setAll((o) => {
        const next = { ...o[theme] };
        delete next[name];
        return { ...o, [theme]: next };
      });
    },
    [theme]
  );

  const resetAll = useCallback(() => setAll({ light: {}, dark: {} }), []);

  const value = useMemo<TokenLabContextValue>(
    () => ({ theme, overrides: all[theme], setToken, clearToken, resetAll, all }),
    [theme, all, setToken, clearToken, resetAll]
  );

  return (
    <TokenLabContext.Provider value={value}>
      {children}
    </TokenLabContext.Provider>
  );
}

export function useTokenLab(): TokenLabContextValue {
  const ctx = useContext(TokenLabContext);
  if (!ctx) {
    throw new Error("useTokenLab must be used within a TokenLabProvider");
  }
  return ctx;
}
