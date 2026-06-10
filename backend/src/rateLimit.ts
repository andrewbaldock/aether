import { incrementCounter } from "./appState";

// App-wide hourly rate limiting for outbound image-search APIs, shared across
// every Fly instance via the app_state counter store. Unsplash's demo tier caps
// the whole APP (not per user) at 50 requests/hour, so the counter must be
// global — an in-memory counter would undercount across machines and overshoot.
//
// Fixed-window strategy: one counter per (source, UTC hour). The window resets
// implicitly because the next hour uses a new key. We leave a safety margin
// below the real ceiling so a little clock skew or a burst can't tip us over.

// Only Unsplash needs an app-wide cap: its demo tier enforces a hard 50 req/hr
// across the whole app. Wikimedia is keyless with no per-app quota, so it isn't
// rate-limited here (gating the only keyless source would risk blanking the
// feature on a counter hiccup). Add sources here as their own hard caps appear.
type Source = "unsplash";

// Budget set BELOW the provider's real cap (50/hr) to leave headroom for clock
// skew and bursts.
const HOURLY_BUDGET: Record<Source, number> = {
  unsplash: 45,
};

function hourBucket(now = new Date()): string {
  // e.g. "2026-06-10T15" — year-month-day-hour in UTC.
  return now.toISOString().slice(0, 13);
}

// Atomically claim one unit of `source`'s hourly budget. Returns true if the
// request is within budget (caller may proceed), false if the hour is spent.
//
// Fails CLOSED: if the shared counter is unreachable, we return false so we
// never risk exceeding a provider's policy. For optional sources (Unsplash)
// that just means falling back to the keyless source — safe, not user-visible.
export async function tryConsume(source: Source): Promise<boolean> {
  const budget = HOURLY_BUDGET[source];
  const key = `ratelimit:${source}:${hourBucket()}`;
  try {
    const used = await incrementCounter(key, 1);
    return used <= budget;
  } catch (err) {
    console.error(`rateLimit.tryConsume(${source}) failed:`, err);
    return false;
  }
}
