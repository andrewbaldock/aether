import { getDb } from "./db";

// Generic cross-instance shared state, backed by the `app_state` table (see
// sql/001_app_state.sql). Aether can run on more than one Fly machine, so
// anything that must be consistent across every instance lives here instead of
// in process memory: rate-limit counters today, future global flags / locks /
// announcement banners tomorrow.
//
// Three primitives:
//   getState<T>(key)            — read a value (null if unset)
//   setState(key, value)        — upsert a value
//   incrementCounter(key, by)   — ATOMIC add, returns the new total
//
// Use incrementCounter (not getState + setState) for counters: a read-modify-
// write from the app would race across concurrent requests / machines and lose
// increments. The increment happens in one statement inside Postgres.

export async function getState<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await getDb()
    .from("app_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`getState(${key}): ${error.message}`);
  return (data?.value as T | undefined) ?? null;
}

export async function setState(key: string, value: unknown): Promise<void> {
  const { error } = await getDb()
    .from("app_state")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(`setState(${key}): ${error.message}`);
}

// Atomically add `by` to the counter at `key` and return the new total. Backed
// by the increment_app_counter RPC so concurrent callers can't lose counts.
export async function incrementCounter(key: string, by = 1): Promise<number> {
  const { data, error } = await getDb().rpc("increment_app_counter", {
    p_key: key,
    p_delta: by,
  });
  if (error) throw new Error(`incrementCounter(${key}): ${error.message}`);
  return Number(data ?? 0);
}
