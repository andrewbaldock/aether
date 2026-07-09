import posthog from "posthog-js";

// Product analytics — the "instrument feature usage / verify feature success"
// layer. One thin wrapper around posthog-js so event names are a typed union
// (no stringly-typed sprinkles) and every call is a guaranteed no-op when the
// key is absent (local dev, or before an env is configured) — it never throws.

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

let enabled = false;

// Called once at startup (main.tsx). `userId` is the anonymous per-browser id
// (same localStorage UUID apiFetch sends as X-User-Id) so a person's events tie
// together across sessions and map cleanly to the real auth id later. Empty on a
// first-ever visit — PostHog assigns an anonymous distinct_id until identify runs
// on the next load.
export function initAnalytics(userId: string): void {
  if (!KEY || enabled) return;
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: "identified_only",
    capture_pageview: true,
    autocapture: true,
  });
  if (userId) posthog.identify(userId);
  enabled = true;
}

// The high-signal feature events, each tied to a success metric (see the plan's
// feature → metric → signal table). Keep this list small and deliberate — add an
// event only when a specific question needs it.
export type AnalyticsEvent =
  | "conversation_started"
  | "message_sent"
  | "model_changed"
  | "tool_rendered"
  | "knowledge_graph_built"
  | "starter_prompt_clicked"
  | "clarify_answered";

export function track(
  event: AnalyticsEvent,
  props?: Record<string, unknown>
): void {
  if (!enabled) return;
  posthog.capture(event, props);
}

// Web-vitals sample (fed from lib/vitals.ts). Separate from the feature events so
// the union above stays about product usage, not performance.
export function trackVital(name: string, value: number): void {
  if (!enabled) return;
  posthog.capture("web_vital", { name, value });
}
