import Anthropic from "@anthropic-ai/sdk";

// One shared Anthropic SDK client for the process, created lazily on first use.
//
// The main chat path memoizes its own client inside createClaudeClient, but the
// cheap Haiku micro-agents — generateTitle (once per new session) and planTurn
// (most turns) — used to `new Anthropic()` on every call, spinning up a fresh
// connection pool each time. planTurn especially runs hot. This getter gives them
// a single reusable client instead.
//
// Memoized on the API key so a key change between calls (only really happens in
// tests) rebuilds the client rather than silently reusing a stale one. Returns
// null when no key is set — both callers already treat a missing key as
// best-effort "skip" (return null), so the server still boots and /api/health
// responds without ANTHROPIC_API_KEY.
let cached: { key: string; client: Anthropic } | null = null;

export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!cached || cached.key !== apiKey) {
    cached = { key: apiKey, client: new Anthropic({ apiKey }) };
  }
  return cached.client;
}
