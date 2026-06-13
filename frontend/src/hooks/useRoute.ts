type Route =
  | { type: "home" }
  | { type: "conversation"; sessionId: string }
  // Dev-only deep link to the Screenshots admin page. Parsed unconditionally (the
  // arm is cheap), but only ever produced for a URL the dev-gated tab can reach —
  // in prod nothing navigates here and the widget isn't registered, so a manual
  // /screenshots visit just falls through to the empty-renderer message.
  | { type: "screenshots" };

export function parseRoute(pathname: string): Route {
  const match = pathname.match(/^\/c\/([^/]+)$/);
  if (match?.[1]) return { type: "conversation", sessionId: match[1] };
  if (/^\/screenshots\/?$/.test(pathname)) return { type: "screenshots" };
  return { type: "home" };
}

// Pushes a new URL and notifies all useRoute subscribers. pushState alone
// doesn't fire popstate, so we dispatch it manually.
export function navigate(path: string): void {
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
