import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Typography preferences: text size and font face. Both persist across reloads
// and are applied to <html> — font-size scales every rem-based Tailwind size at
// once, and --font-body swaps the body font everywhere it's referenced (see
// index.css `body`). A pre-paint script in index.html seeds both so there's no
// flash; this provider keeps them in sync after mount. Mirrors the shape of
// useTheme so the two read the same.
//
// SCOPE (future): when real accounts land (Google sign-in, backlog), FONT FACE
// becomes a USER preference (a user_preferences table, follows you across
// devices) alongside theme. TEXT SIZE stays DEVICE-local (localStorage) — a
// phone and a 27" monitor want different sizes. Everything is localStorage today
// because the only identity is a per-browser anonymous UUID, so there's nothing
// to sync to yet.

export type TextSize = "xs" | "sm" | "md" | "lg";
export type FontFace = "system" | "geist" | "georgia" | "lora";

const SIZE_KEY = "aether-text-size";
const FONT_KEY = "aether-font-face";

const DEFAULT_SIZE: TextSize = "md";
const DEFAULT_FONT: FontFace = "system";

// Root font-size per step. Tailwind's text-* utilities are rem-based, so scaling
// the <html> font-size scales the whole app proportionally. md is the browser
// default (16px) so the unset/default experience is unchanged.
export const TEXT_SIZE_PX: Record<TextSize, number> = {
  xs: 14,
  sm: 15,
  md: 16,
  lg: 18,
};

// The font stack each choice maps to. system/georgia need no network; geist/lora
// are loaded in index.html. Body text only — the brand font (font-display) is
// untouched.
export const FONT_STACK: Record<FontFace, string> = {
  system:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  geist: '"Geist", ui-sans-serif, system-ui, sans-serif',
  georgia: 'Georgia, Cambria, "Times New Roman", Times, serif',
  lora: '"Lora", Georgia, Cambria, "Times New Roman", Times, serif',
};

function getInitialSize(): TextSize {
  const stored = localStorage.getItem(SIZE_KEY);
  if (stored === "xs" || stored === "sm" || stored === "md" || stored === "lg")
    return stored;
  return DEFAULT_SIZE;
}

function getInitialFont(): FontFace {
  const stored = localStorage.getItem(FONT_KEY);
  if (
    stored === "system" ||
    stored === "geist" ||
    stored === "georgia" ||
    stored === "lora"
  )
    return stored;
  return DEFAULT_FONT;
}

interface AppearanceContextValue {
  textSize: TextSize;
  setTextSize: (s: TextSize) => void;
  fontFace: FontFace;
  setFontFace: (f: FontFace) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [textSize, setSizeState] = useState<TextSize>(getInitialSize);
  const [fontFace, setFontState] = useState<FontFace>(getInitialFont);

  // Apply to <html> and persist. Idempotent, so StrictMode's double-run in dev
  // is harmless. Matches the pre-paint script in index.html.
  useEffect(() => {
    document.documentElement.style.fontSize = `${TEXT_SIZE_PX[textSize]}px`;
    localStorage.setItem(SIZE_KEY, textSize);
  }, [textSize]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--font-body",
      FONT_STACK[fontFace]
    );
    localStorage.setItem(FONT_KEY, fontFace);
  }, [fontFace]);

  const setTextSize = useCallback((s: TextSize) => setSizeState(s), []);
  const setFontFace = useCallback((f: FontFace) => setFontState(f), []);

  const value = useMemo<AppearanceContextValue>(
    () => ({ textSize, setTextSize, fontFace, setFontFace }),
    [textSize, setTextSize, fontFace, setFontFace]
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance must be used within an AppearanceProvider");
  }
  return ctx;
}
