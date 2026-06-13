import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Light/dark theme, persisted across reloads. The `.dark` class on <html> drives
// every semantic colour token (see index.css). A pre-paint script in index.html
// seeds that class so there's no flash; this provider keeps it in sync after mount.
//
// SCOPE (future): theme is a USER preference — when real accounts land (Google
// sign-in, backlog) it moves to a user_preferences table and follows you across
// devices, alongside font face (see useAppearance). localStorage today because
// the only identity is a per-browser anonymous UUID, so there's nothing to sync to.
type Theme = "light" | "dark";

const STORAGE_KEY = "aether-theme";

// Resolve the boot-time theme exactly like the index.html pre-paint script, so
// React state matches the class already on <html> and we never re-flip on mount.
function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Apply to <html> and persist whenever the theme changes. Idempotent, so the
  // StrictMode double-run in dev is harmless. Also swap the favicon so the tab
  // icon's background matches the app theme (mirrors the seed in index.html).
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(STORAGE_KEY, theme);
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) {
      icon.href = theme === "dark" ? "/favicon.svg" : "/favicon-light.svg";
    }
  }, [theme]);

  // Follow live OS changes, but only while the user hasn't made an explicit
  // choice (once they toggle, STORAGE_KEY is set and we stop following).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setThemeState(e.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    []
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggle, setTheme }),
    [theme, toggle, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
