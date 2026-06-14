import { useSyncExternalStore } from "react";

// The app has exactly two route families that share one capability column:
//
//   • workspace — a tool view, optionally scoped to a conversation. The view is a
//     capability id (or null = home base, the default). sessionId is null on the
//     home screen and set once a conversation exists. Four URL shapes:
//         /                 home,         home-base view
//         /:view            home,         a tool tab (empty, no conversation)
//         /c/:id            conversation, home-base view
//         /c/:id/:view      conversation, a tool tab
//     An explicit :view ALWAYS wins — the tab shows even with no content. A bare
//     /c/:id (view=null) defers to the conversation's saved default.
//
//   • admin — an app-level utility page (Welcome, Settings, Health), flat and
//     conversation-agnostic. Screenshots is dev-only: parsed unconditionally (the
//     arm is cheap) but only reachable via the dev-gated tab; in prod the widget
//     isn't registered so a manual /screenshots visit shows the empty renderer.
//
// These are mutually exclusive — the column shows a workspace view OR an admin
// page, never both — which is why one URL drives both.
type Route =
  | { type: "workspace"; sessionId: string | null; view: string | null }
  | { type: "admin"; id: AdminPageId };

// The admin pages addressable by path. The route id IS the widget id, so
// activate(route.id) just works.
export type AdminPageId = "welcome" | "settings" | "health" | "screenshots";

const ADMIN_PATHS: Record<AdminPageId, string> = {
  welcome: "/welcome",
  settings: "/settings",
  health: "/health",
  screenshots: "/screenshots",
};
const ADMIN_IDS: Record<string, AdminPageId> = Object.fromEntries(
  (Object.keys(ADMIN_PATHS) as AdminPageId[]).map((id) => [ADMIN_PATHS[id], id])
);

// Capability id ↔ URL slug for the :view segment. Home base (bigsail) is the
// DEFAULT view and has no slug — it's the bare / or /c/:id, never a segment. Every
// other capability is addressable; ids that aren't URL-friendly get a short slug,
// the rest map to themselves. This set is the source of truth for which bare
// segments parse as a view (vs. falling through to home) — VIEW_SLUGS.test.ts
// asserts it matches the real catalog so a new capability can't silently 404.
const HOME_BASE_VIEW_ID = "bigsail";
const VIEW_ID_TO_SLUG: Record<string, string> = {
  "knowledge-graph": "graph",
  table: "table",
  chart: "chart",
  timeline: "timeline",
  images: "images",
};
const SLUG_TO_VIEW_ID: Record<string, string> = Object.fromEntries(
  Object.entries(VIEW_ID_TO_SLUG).map(([id, slug]) => [slug, id])
);

// Capability id → URL slug, or null for home base / unknown ids (no segment).
export function viewSlug(id: string): string | null {
  if (id === HOME_BASE_VIEW_ID) return null;
  return VIEW_ID_TO_SLUG[id] ?? null;
}

// URL slug → capability id, or null if the slug isn't a known view (so the parser
// rejects junk segments to home base instead of inventing a phantom view).
function slugToViewId(slug: string): string | null {
  return SLUG_TO_VIEW_ID[slug] ?? null;
}

// The canonical path for a workspace location: a view (capability id, null = home
// base) optionally scoped to a session. Covers all four workspace URL shapes — the
// single way navigation forms a URL, so callers never hand-build paths.
//   viewPath(null, null)        → "/"
//   viewPath(null, "chart")     → "/chart"
//   viewPath("abc", null)       → "/c/abc"
//   viewPath("abc", "chart")    → "/c/abc/chart"
export function viewPath(
  sessionId: string | null,
  view: string | null
): string {
  const slug = view ? viewSlug(view) : null;
  const base = sessionId ? `/c/${sessionId}` : "";
  const tail = slug ? `/${slug}` : "";
  return base + tail || "/";
}

// Whether a capability id names an admin/utility page.
export function isAdminPageId(id: string): id is AdminPageId {
  return id in ADMIN_PATHS;
}

export function parseRoute(pathname: string): Route {
  const normalised = pathname.replace(/\/$/, "") || "/";

  // Admin pages: flat, exact match.
  const adminId = ADMIN_IDS[normalised];
  if (adminId) return { type: "admin", id: adminId };

  // Conversation, optionally at a tool view: /c/:id or /c/:id/:view.
  const convo = normalised.match(/^\/c\/([^/]+)(?:\/([^/]+))?$/);
  if (convo?.[1]) {
    return {
      type: "workspace",
      sessionId: convo[1],
      view: convo[2] ? slugToViewId(convo[2]) : null,
    };
  }

  // Bare tool view on the home screen: /:view (a single known view slug).
  const bare = normalised.match(/^\/([^/]+)$/);
  if (bare?.[1]) {
    const view = slugToViewId(bare[1]);
    if (view) return { type: "workspace", sessionId: null, view };
  }

  // Anything else (home, or an unrecognised path) → home, default view.
  return { type: "workspace", sessionId: null, view: null };
}

// Subscribe to history navigation (back/forward + our own navigate()).
function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

// Reactive view of the current route. Re-renders subscribers on popstate (which
// navigate() dispatches manually, see below). The snapshot is the raw pathname —
// cheap and referentially stable while the URL is unchanged, so useSyncExternalStore
// won't loop — and callers parseRoute() it themselves.
export function useRoute(): Route {
  const pathname = useSyncExternalStore(
    subscribe,
    () => location.pathname,
    () => "/"
  );
  return parseRoute(pathname);
}

// Pushes a new URL and notifies all useRoute subscribers. pushState alone
// doesn't fire popstate, so we dispatch it manually. No-op if the path is already
// current, so syncing the URL to state never stacks duplicate history entries.
export function navigate(path: string): void {
  if (location.pathname === path) return;
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Like navigate(), but REPLACES the current history entry instead of pushing a new
// one. Used for tool-tab switches within a conversation: the URL tracks the active
// tab (so it's always shareable) without filling the back stack with every click —
// Back still leaves the conversation as a whole, not the last tab.
export function replaceRoute(path: string): void {
  if (location.pathname === path) return;
  history.replaceState(history.state, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Admin pages are pure URL navigations: opening one is a real history push, and
// "turning it off" is browser-back. We stamp the entries WE push with a sentinel
// in history.state so closeAdminPage() can tell whether stepping back lands on
// another app page (safe to back()) or would exit the app (fall back to home).
const ADMIN_NAV_MARKER = "aether-admin-nav";

// Open an admin page. A plain pushState (not navigate()) so we can attach the
// marker; we still fire popstate so useRoute subscribers re-render.
export function openAdminPage(id: AdminPageId): void {
  const path = ADMIN_PATHS[id];
  if (location.pathname === path) return;
  history.pushState({ [ADMIN_NAV_MARKER]: true }, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// "Turn off" an admin page. If we pushed this entry ourselves there's a prior app
// entry to return to, so history.back() restores exactly where the user came from
// (a conversation, home, or another page). Otherwise — the admin page was the
// first thing loaded (deep link / refresh), so back() would leave the app — we
// navigate to a sensible home instead.
export function closeAdminPage(homePath: string): void {
  if (history.state?.[ADMIN_NAV_MARKER]) {
    history.back();
  } else {
    navigate(homePath);
  }
}
