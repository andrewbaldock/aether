import { QueryClientProvider } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initAnalytics } from "./lib/analytics";
import { queryClient } from "./lib/queryClient";
import { initVitals } from "./lib/vitals";

// Dev-only: a service worker registered by a past `vite preview` on this origin
// keeps serving its precached (stale) bundle even though `vite dev` has the SW
// disabled — the "my local app won't update" trap. Proactively unregister any SW
// and drop its caches so a stale one can't outlive a dev session. No-op in prod
// (the real PWA SW must live) and when nothing is registered. Takes effect on the
// next load after the first cleanup.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister();
  });
  if ("caches" in window) {
    void caches.keys().then((keys) => {
      for (const key of keys) void caches.delete(key);
    });
  }
}

// Error reporting. No-op when VITE_SENTRY_DSN is unset (local dev), so the
// ErrorBoundary below still renders the fallback but nothing is sent.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
  });
}

// Product analytics + web-vitals. Identify with the anonymous per-browser id
// (same localStorage key apiFetch reads) so events tie together across sessions.
const userId = (() => {
  try {
    return localStorage.getItem("aether_user_id") ?? "";
  } catch {
    return "";
  }
})();
initAnalytics(userId);
initVitals();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

// Minimal crash fallback — Aether had no error boundary at all, so an uncaught
// render error used to white-screen the whole app. Now it degrades to a message
// with a reload, and the error is captured (when Sentry is configured).
function AppCrashFallback() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-surface px-6 text-center">
      <p className="text-content">Something went wrong.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md border border-border px-4 py-2 text-sm text-content-muted transition-colors hover:border-content-muted hover:text-content"
      >
        Reload
      </button>
    </div>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<AppCrashFallback />}>
      <QueryClientProvider client={queryClient}>
        <App />
        <SpeedInsights />
        <Analytics />
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>
);
