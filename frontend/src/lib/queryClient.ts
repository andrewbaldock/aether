import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

// Central data layer + self-diagnostics for every /api call.
//
// All non-streaming requests route through `apiFetch` and TanStack Query, so error
// handling, retries (which ride out Fly's cold-start 502s), and caching live in one
// place instead of being copy-pasted across hooks. The cache `onError` handlers turn
// the old cryptic "HTTP 502" into a plain-English reason that says whether we're in
// dev or prod and what to actually do about it.

const isDev = import.meta.env.DEV;

// Where /api actually goes, for logging. We always fetch relative `/api/...`:
//  • dev  — Vite proxies /api → http://localhost:8000 (vite.config.ts)
//  • prod — Vercel rewrites /api/* → the Fly backend at the edge (vercel.json)
const API_TARGET = isDev
  ? "Vite proxy → http://localhost:8000 (local backend)"
  : "Vercel edge → https://aether-ab-api.fly.dev (Fly)";

export function describeEnv(): string {
  return `mode=${import.meta.env.MODE} (${isDev ? "DEV" : "PROD"}) · API: ${API_TARGET}`;
}

// An /api response that came back but wasn't ok. Carries enough to diagnose.
export class ApiError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly body: string
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = "ApiError";
  }
}

// A failed fetch with no response at all (backend down, DNS, CORS, connection refused).
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError; // fetch throws TypeError on network failure
}

// The anonymous per-browser user id, read from the same localStorage key that
// useUserId owns. apiFetch attaches it as X-User-Id so the backend can enforce
// ownership on mutating routes (only the owner may edit/delete a session; reads
// stay open so a shared /c/:id link can still be opened and forked). This is the
// SINGLE place that turns "who is the caller" into a request header — when Google
// sign-in lands, swap this for the verified token (Authorization: Bearer) and the
// rest of the data layer is unchanged. Returns "" before the id is ever set
// (first paint), which the backend treats as unauthenticated.
const USER_ID_STORAGE_KEY = "aether_user_id";
function currentUserId(): string {
  try {
    return localStorage.getItem(USER_ID_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

// The single fetch used by every query/mutation. Relative /api URLs only.
export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  // Merge X-User-Id into whatever headers the caller passed (Content-Type etc.).
  const uid = currentUserId();
  const headers = new Headers(init?.headers);
  if (uid) headers.set("X-User-Id", uid);
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(path, res.status, body);
  }
  // Every backend endpoint currently returns a JSON body (writes reply `{ ok: true }`),
  // but tolerate an empty body defensively so a future 204/no-content response can't
  // throw on JSON.parse("").
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// Turn any thrown error into an actionable, environment-aware explanation.
function explain(err: unknown): string {
  if (isNetworkError(err)) {
    return isDev
      ? "Backend unreachable — is the local backend running? `cd backend && bun run dev` (expects :8000)."
      : "Backend unreachable — the Fly app may be down or mid cold-start; the request will be retried.";
  }
  if (err instanceof ApiError) {
    if (err.status === 502 || err.status === 503 || err.status === 504) {
      return isDev
        ? `${err.status} from local backend — it may have crashed or be restarting. Check the backend terminal.`
        : `${err.status} from Fly — backend down or cold-starting (aether-ab-api); retrying.`;
    }
    return `${err.status} from ${err.url}${err.body ? ` — ${err.body.slice(0, 200)}` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}

// Shared logger so query + mutation failures read identically. Exported for the
// few imperative fetches that don't go through the query/mutation cache (e.g. the
// graph persistence bridge's debounced save).
export function logApiError(scope: string, err: unknown): void {
  console.error(`[aether/api] ${scope} failed — ${explain(err)}`, {
    env: describeEnv(),
    error: err,
  });
}

// Don't retry a genuine 4xx (it won't get better); do retry network/5xx up to 3×
// so a Fly cold start resolves on its own.
function shouldRetry(failureCount: number, err: unknown): boolean {
  if (failureCount >= 3) return false;
  if (err instanceof ApiError) return err.status >= 500;
  return isNetworkError(err);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) =>
      logApiError(`query ${String(query.queryKey)}`, err),
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) =>
      logApiError(
        `mutation ${String(mutation.options.mutationKey ?? "")}`,
        err
      ),
  }),
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      staleTime: 30_000,
    },
    mutations: {
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});

// One-time startup banner so every reload tells you what mode you're in and where
// /api is pointed — the first thing to check when data won't load.
console.info(`[aether] ${describeEnv()}`);
