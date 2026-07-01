import { Tooltip } from "../shell/Tooltip";
import { useTheme } from "./useTheme";

// Sun/moon theme switch. Shows the icon for the current theme (moon = dark,
// sun = light). Lives in the sidebar footer, next to the site link (or, in
// the collapsed rail, stacked above the expand toggle).
export function ThemeToggle({
  side = "top",
  className = "ml-auto -mr-1.5",
}: {
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <Tooltip label={label} side={side} className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="shrink-0 rounded-md border border-transparent p-1.5 text-content-muted transition-colors hover:border-border hover:bg-elevated hover:text-neon-pink"
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </button>
    </Tooltip>
  );
}

// Sun glyph — shown in light mode (the current theme).
function SunIcon() {
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

// Moon glyph — shown in dark mode (the current theme).
function MoonIcon() {
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
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
