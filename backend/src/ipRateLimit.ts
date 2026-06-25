import { incrementCounter } from "./appState";

// Per-IP hourly cap on POST /api/chat — the only thing between an anonymous
// caller and unbounded LLM spend (the chat proxy is open + unauthenticated).
// Same fixed-window scheme as rateLimit.ts, shared across Fly instances via the
// app_state counter so the cap holds no matter which machine serves the request.
//
// Budget is a spend backstop, not a correctness gate. Set very high so it never
// bites a real user / demo (heavy testing was tripping the old 60/hr cap, which
// 429'd new conversations before the model ran — they came back empty and untitled).
// It still caps a truly runaway script eventually; a hard provider-side spend cap is
// the real ceiling. ponytail: one knob — lower it again if the open endpoint gets abused.
export const CHAT_HOURLY_BUDGET = 100_000;

function hourBucket(now = new Date()): string {
  // e.g. "2026-06-22T15" — year-month-day-hour in UTC. Next hour = new key =
  // fresh counter, so the window resets implicitly with no TTL to manage.
  return now.toISOString().slice(0, 13);
}

// Atomically claim one unit of this IP's hourly chat budget. Returns true if the
// caller may proceed, false if the hour is spent.
//
// Fails OPEN (returns true) on a counter error: unlike rateLimit.ts (Unsplash),
// chat has no safe fallback, so failing closed would 429 every legitimate user on
// a DB hiccup — worse than the brief over-spend a counter outage could allow.
// ponytail: fails open by design; if abuse gets past this, add Turnstile/a shared
// secret in front rather than flipping to fail-closed.
export async function tryConsumeChat(ip: string): Promise<boolean> {
  const key = `ratelimit:chat:${ip}:${hourBucket()}`;
  try {
    const used = await incrementCounter(key, 1);
    return used <= CHAT_HOURLY_BUDGET;
  } catch (err) {
    console.error(`ipRateLimit.tryConsumeChat(${ip}) failed, allowing:`, err);
    return true;
  }
}
