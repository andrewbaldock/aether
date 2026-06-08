import { useSyncExternalStore } from "react";

// Mobile = below Tailwind's `md` breakpoint (768px). Kept in one place so the
// shell branch and any future responsive logic agree on the threshold.
const QUERY = "(max-width: 767px)";

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

// Server snapshot: assume desktop (no window). The client snapshot corrects it
// on hydration; this app is client-only anyway, so it never actually fires.
function getServerSnapshot(): boolean {
  return false;
}

// Re-renders the caller whenever the viewport crosses the mobile breakpoint
// (resize, device rotation). matchMedia avoids the resize-event spam of reading
// window.innerWidth directly.
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
