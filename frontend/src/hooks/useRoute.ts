type Route = { type: "home" } | { type: "conversation"; sessionId: string };

export function parseRoute(pathname: string): Route {
  const match = pathname.match(/^\/c\/([^/]+)$/);
  if (match?.[1]) return { type: "conversation", sessionId: match[1] };
  return { type: "home" };
}

// Pushes a new URL and notifies all useRoute subscribers. pushState alone
// doesn't fire popstate, so we dispatch it manually.
export function navigate(path: string): void {
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
