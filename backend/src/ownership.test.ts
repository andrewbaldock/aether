import { beforeAll, describe, expect, it, mock } from "bun:test";
// The REAL pure merge helper. Imported by value so the ./db mock below can
// re-export it unchanged — Bun's mock.module is process-global and would
// otherwise leak a fake mergeWidgetSnapshot into widgetMerge.test.ts.
import { mergeWidgetSnapshot as realMergeWidgetSnapshot } from "./db";

// Route-level authorization tests for the session-mutation endpoints (finding #1:
// every write must be scoped to the caller's user_id; reads stay open so shared
// links still work). These DON'T touch a real database — they mock the db layer so
// the test runs fast, needs no secrets, and works in CI. What they actually guard
// is the ROUTE WIRING that unit tests can't see and that's easy to drop in a
// refactor: does each mutating route extract the caller (X-User-Id), pass it to the
// owner-checked db call, map a NotOwnerError to 403, and reject a missing caller
// with 401 — while leaving reads unauthenticated?
//
// The mock mirrors real ownership semantics: the write helpers throw NotOwnerError
// unless the caller id matches the session's owner. So a route that forgets to pass
// the caller (or passes the wrong thing) fails here.

// Recreate the real NotOwnerError shape so `instanceof` checks in index.ts match.
class NotOwnerError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} not found or not owned by caller`);
    this.name = "NotOwnerError";
  }
}

const OWNER = "owner-user";
const FOREIGN = "foreign-user";
const SESSION_ID = "11111111-1111-1111-1111-111111111111";

// A mutating helper succeeds only when the caller owns the session.
function ownerGuarded(ownerId: string) {
  if (ownerId !== OWNER) throw new NotOwnerError(SESSION_ID);
}

// Mock ./db BEFORE importing ./index so the route handlers bind to these. Only the
// functions the tested routes touch need real behaviour; the rest are no-op stubs
// so the module loads.
mock.module("./db", () => ({
  NotOwnerError,
  // owner-checked writes: last arg is the caller id
  updateSessionTitle: mock(async (_id: string, _t: string, owner: string) =>
    ownerGuarded(owner)
  ),
  updateSessionGraphMode: mock(
    async (_id: string, _m: boolean, owner: string) => ownerGuarded(owner)
  ),
  updateSessionModel: mock(async (_id: string, _m: string, owner: string) =>
    ownerGuarded(owner)
  ),
  updateSessionUiState: mock(async (_id: string, _p: unknown, owner: string) =>
    ownerGuarded(owner)
  ),
  updateSessionGraphData: mock(
    async (_id: string, _g: unknown, owner: string) => ownerGuarded(owner)
  ),
  updateSessionWidgetData: mock(
    async (_id: string, _w: unknown, owner: string) => ownerGuarded(owner)
  ),
  deleteSession: mock(async (_id: string, owner: string) => ownerGuarded(owner)),
  deleteMessages: mock(async (_id: string, _ids: string[], owner: string) =>
    ownerGuarded(owner)
  ),
  // open reads + helpers the routes/module need
  getSession: mock(async () => ({ id: SESSION_ID, user_id: OWNER })),
  getMessages: mock(async () => []),
  getSessionGraph: mock(async () => null),
  getSessionWidgets: mock(async () => null),
  isSessionOwner: mock(async (_id: string, owner: string) => owner === OWNER),
  // Re-export the REAL pure merge fn so the global mock doesn't break
  // widgetMerge.test.ts (which imports it from ./db).
  mergeWidgetSnapshot: realMergeWidgetSnapshot,
  createSession: mock(async () => ({ id: SESSION_ID })),
  listSessions: mock(async () => []),
  forkSession: mock(async () => ({ id: SESSION_ID })),
  saveMessage: mock(async () => "msg-id"),
  updateSessionTitleIfEmpty: mock(async () => {}),
  // Pulled in transitively by sibling modules (appState, tools); stubbed so the
  // mocked ./db module is a complete stand-in and those imports resolve.
  getDb: mock(() => {
    throw new Error("getDb should not be called in ownership tests");
  }),
  getUnsplashSearchCount: mock(async () => 0),
  bumpUnsplashSearchCount: mock(async () => {}),
}));

// index.ts also imports these; stub so the module loads (routes under test don't call them).
mock.module("./health", () => ({
  checkHealth: mock(async () => ({})),
  checkProviders: mock(async () => ({})),
}));
mock.module("./llm", () => ({
  createClient: mock(() => ({ stream: mock(async () => {}) })),
  generateTitle: mock(async () => null),
}));

let server: { fetch: (req: Request) => Response | Promise<Response> };

beforeAll(async () => {
  // Import AFTER mocks are registered.
  server = (await import("./index")).default;
});

function req(
  method: string,
  path: string,
  opts: { caller?: string; body?: unknown } = {}
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.caller) headers["X-User-Id"] = opts.caller;
  return Promise.resolve(
    server.fetch(
      new Request(`http://localhost${path}`, {
        method,
        headers,
        ...(opts.body !== undefined
          ? { body: JSON.stringify(opts.body) }
          : {}),
      })
    )
  );
}

// Every mutating route, exercised the same three ways.
const mutations: { name: string; method: string; path: string; body?: unknown }[] =
  [
    {
      name: "PATCH session (rename)",
      method: "PATCH",
      path: `/api/sessions/${SESSION_ID}`,
      body: { title: "new title" },
    },
    {
      name: "DELETE session",
      method: "DELETE",
      path: `/api/sessions/${SESSION_ID}`,
    },
    {
      name: "DELETE messages",
      method: "DELETE",
      path: `/api/sessions/${SESSION_ID}/messages`,
      body: { ids: ["a"] },
    },
    {
      name: "PUT graph",
      method: "PUT",
      path: `/api/sessions/${SESSION_ID}/graph`,
      body: { nodes: [], links: [] },
    },
    {
      name: "PUT widgets",
      method: "PUT",
      path: `/api/sessions/${SESSION_ID}/widgets`,
      body: { table: null, chart: null, timeline: null },
    },
    {
      name: "POST repair-prompts",
      method: "POST",
      path: `/api/sessions/${SESSION_ID}/repair-prompts`,
      body: {},
    },
  ];

describe("session writes require ownership", () => {
  for (const m of mutations) {
    it(`${m.name}: owner → not 401/403`, async () => {
      const res = await req(m.method, m.path, { caller: OWNER, body: m.body });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it(`${m.name}: foreign caller → 403`, async () => {
      const res = await req(m.method, m.path, { caller: FOREIGN, body: m.body });
      expect(res.status).toBe(403);
    });

    it(`${m.name}: no X-User-Id → 401`, async () => {
      const res = await req(m.method, m.path, { body: m.body });
      expect(res.status).toBe(401);
    });
  }
});

describe("reads stay open (sharing must keep working)", () => {
  // A foreign caller (or none at all) can still READ a session and its data —
  // that's how a shared /c/:id link is opened and then forked. If any of these
  // start returning 401/403, sharing is broken.
  const reads = [
    `/api/sessions/${SESSION_ID}`,
    `/api/sessions/${SESSION_ID}/messages`,
    `/api/sessions/${SESSION_ID}/graph`,
    `/api/sessions/${SESSION_ID}/widgets`,
  ];
  for (const path of reads) {
    it(`GET ${path}: foreign caller → not 401/403`, async () => {
      const res = await req("GET", path, { caller: FOREIGN });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  }
});
