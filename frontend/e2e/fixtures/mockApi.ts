import { test as base, type Page, type Route } from "@playwright/test";
import { graphTurn, type SseEvent, sseBody, tableTurn, textTurn } from "./sse";

// The whole E2E + screenshot strategy hinges on this: a clean, composable mock of
// every `/api/*` route, installed at the network layer via page.route. No backend
// process, no LLM tokens, deterministic. The Hono backend never runs during E2E.
//
// Usage:
//   import { test, expect } from "./fixtures/mockApi";
//   test("...", async ({ page, mockApi }) => { ... });
// The `mockApi` fixture installs sane defaults on every route before the test body.
// To override one route (force an error, an empty list, a custom stream), call the
// helpers on it inside the test BEFORE the action that triggers the request.

const DEFAULT_MODELS = [
  {
    id: "claude-sonnet-4-6",
    provider: "claude",
    label: "Sonnet 4.6",
    blurb: "Balanced — the default",
    available: true,
  },
  {
    id: "claude-opus-4-8",
    provider: "claude",
    label: "Opus 4.8",
    blurb: "Most capable",
    available: true,
  },
];

// A single canned session so the sidebar has something to render. Shape matches
// the frontend `Session` interface (useSessionList.ts).
function sampleSession(overrides: Partial<MockSession> = {}): MockSession {
  const now = new Date().toISOString();
  return {
    id: "sess-1",
    user_id: "e2e-user",
    title: "Sample conversation",
    graph_mode: false,
    model: "claude-sonnet-4-6",
    ui_state: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

interface MockSession {
  id: string;
  user_id: string;
  title: string | null;
  graph_mode: boolean;
  model: string | null;
  ui_state: unknown;
  created_at: string;
  updated_at: string;
}

// The controller handed to tests as the `mockApi` fixture.
export class MockApi {
  // The events the NEXT /api/chat turn will stream. Tests can swap this to drive a
  // text turn, a render-tool turn, an error, etc.
  private chatEvents: SseEvent[] = textTurn();
  private chatDone = true;
  // Delay before the chat body is fulfilled. Defaults to a small value so the
  // turn lands AFTER the session-creation widget-load settles — mirroring reality
  // (a network turn is slower than a local state load) and avoiding a race where
  // the widget-persistence bridge's clear-on-session-change wipes a tool_result
  // that arrived in the same tick.
  private chatDelayMs = 150;
  // When set, the chat route blocks on this promise instead of fulfilling —
  // simulating a turn that's still streaming. The test resolves it (via the
  // returned release fn) to let the request finish. Used for the stop/abort path.
  private chatHold: Promise<void> | null = null;
  private sessions: MockSession[] = [sampleSession()];

  constructor(private readonly page: Page) {}

  // NB: these are intentionally NOT named use* — that prefix trips Biome's
  // react-hooks lint (useHookAtTopLevel) even though they're plain methods.

  /** Make the next chat turn stream a plain text reply. */
  streamText(text?: string) {
    this.chatEvents = textTurn(text);
    this.chatDone = true;
  }

  /** Make the next chat turn stream a render_table round trip. */
  streamTable() {
    this.chatEvents = tableTurn();
    this.chatDone = true;
  }

  /** Make the next chat turn stream a build_knowledge_graph round trip. */
  streamGraph() {
    this.chatEvents = graphTurn();
    this.chatDone = true;
  }

  /** Drive the chat stream with an arbitrary event list. `done` controls the [DONE] terminator. */
  streamEvents(events: SseEvent[], opts: { done?: boolean } = {}) {
    this.chatEvents = events;
    this.chatDone = opts.done ?? true;
  }

  /**
   * Hold the next chat turn open (the request never completes) so the UI sits in
   * its streaming state — used to exercise the stop/abort control. Returns a
   * `release` fn the test calls to let the hung request finish during teardown.
   */
  holdChat(): () => void {
    let release = () => {};
    this.chatHold = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  /** Replace the session list (e.g. set [] to test the empty state). */
  setSessions(sessions: MockSession[]) {
    this.sessions = sessions;
  }

  /** Install all default route handlers. Called once by the fixture. */
  async install() {
    await this.page.route("**/api/**", (route) => this.dispatch(route));
  }

  /** Pre-load a scenario for the screenshot capture (which has no test body). */
  scenario(kind: "text" | "table") {
    if (kind === "table") this.streamTable();
    else this.streamText();
  }

  private async dispatch(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    // --- chat: the SSE stream ---
    if (path === "/api/chat" && method === "POST") {
      // Held open for the stop/abort test until the test releases it.
      if (this.chatHold) await this.chatHold;
      else if (this.chatDelayMs > 0) {
        await new Promise((r) => setTimeout(r, this.chatDelayMs));
      }
      return route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: sseBody(this.chatEvents, { done: this.chatDone }),
      });
    }

    // --- static service routes ---
    if (path === "/api/health") return json(route, { ok: true });
    if (path === "/api/health/full") return json(route, healthFull());
    if (path === "/api/models") return json(route, { models: DEFAULT_MODELS });

    // --- session collection ---
    if (path === "/api/sessions" && method === "GET") {
      return json(route, this.sessions);
    }
    if (path === "/api/sessions" && method === "POST") {
      // Lazy session creation on first send. Return a fresh untitled session.
      const created = sampleSession({ id: `sess-${Date.now()}`, title: null });
      this.sessions = [created, ...this.sessions];
      return json(route, created);
    }

    // --- single session: /api/sessions/:id and its subresources ---
    const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)(\/.*)?$/);
    if (sessionMatch) {
      const sub = sessionMatch[2];
      if (sub === "/messages") return json(route, []);
      if (sub === "/graph") return json(route, { nodes: [], links: [] });
      if (sub === "/widgets") {
        return json(route, {
          table: null,
          chart: null,
          timeline: null,
          images: null,
        });
      }
      // Bare /api/sessions/:id — GET returns the session; PATCH (rename / model /
      // graph_mode) and DELETE mutate the in-memory store so the follow-up
      // re-fetch (react-query invalidates on settle) reflects the change rather
      // than reverting the optimistic UI write. These are named regression paths.
      const id = sessionMatch[1];
      if (method === "GET") {
        const found = this.sessions.find((s) => s.id === id);
        return json(route, found ?? sampleSession({ id }));
      }
      if (method === "PATCH") {
        const patch = (req.postDataJSON() ?? {}) as Partial<MockSession>;
        this.sessions = this.sessions.map((s) =>
          s.id === id ? { ...s, ...patch } : s
        );
        return json(route, { ok: true });
      }
      if (method === "DELETE") {
        this.sessions = this.sessions.filter((s) => s.id !== id);
        return json(route, { ok: true });
      }
      if (method === "POST")
        return json(route, sampleSession({ id: `fork-${Date.now()}` }));
    }

    // Anything unmatched: succeed with an empty object rather than hanging, so a
    // forgotten route never wedges a test on a pending request.
    return json(route, {});
  }
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Static all-green health/full payload (HealthWidget's shape). Keeps the Health
// admin page populated in screenshots without a live probe.
function healthFull() {
  const okCheck = { ok: true, configured: true, latencyMs: 42 };
  return {
    supabase: { ok: true, latencyMs: 30 },
    providers: {
      claude: okCheck,
      google: okCheck,
      deepseek: { ok: false, configured: false, latencyMs: 0 },
      mistral: { ok: false, configured: false, latencyMs: 0 },
    },
    dataSources: {
      wikidata: okCheck,
      wikidataSearch: okCheck,
      worldBank: okCheck,
      wikipedia: okCheck,
      openalex: okCheck,
      wikimedia: okCheck,
      unsplash: { ok: false, configured: false, latencyMs: 0 },
    },
  };
}

// The test object every spec imports. Extends Playwright's base test with a
// `mockApi` fixture that installs the default routes automatically.
export const test = base.extend<{ mockApi: MockApi }>({
  mockApi: async ({ page }, use) => {
    const api = new MockApi(page);
    await api.install();
    await use(api);
  },
});

export { expect } from "@playwright/test";
