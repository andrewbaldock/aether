import { beforeAll, describe, expect, it, mock } from "bun:test";
import * as realLlm from "./llm";

// All tests for the /api/chat spend backstop live in ONE file: Bun's mock.module
// is process-global, so splitting mocks across files makes them clobber. The chat
// proxy is open + unauthenticated, so this per-IP cap is the only thing between an
// anonymous caller and unbounded LLM spend.
//
// We use the REAL limiter throughout (no ./ipRateLimit mock) and drive its verdict
// by what the counter RPC returns — so the unit tests and the route tests share
// one knob and the route genuinely exercises the wired-in limiter.

let rpcResult: number | "error" = 0; // increment_app_counter's return
let streamThrows = false; // make the model stream throw (masking test)

// real ./appState.incrementCounter → getDb().rpc("increment_app_counter").
mock.module("./db", () => ({
  getDb: () => ({
    rpc: async () =>
      rpcResult === "error"
        ? { data: null, error: { message: "app_state down" } }
        : { data: rpcResult, error: null },
  }),
  isSessionOwner: mock(async () => false),
  saveMessage: mock(async () => "msg-id"),
  updateSessionTitleIfEmpty: mock(async () => {}),
}));
mock.module("./health", () => ({
  checkHealth: mock(async () => ({})),
  checkProviders: mock(async () => ({})),
}));

const createClient = mock(() => ({
  stream: mock(async () => {
    if (streamThrows) throw new Error("SECRET-INTERNAL-DETAIL-do-not-leak");
  }),
}));
mock.module("./llm", () => ({
  ...realLlm,
  createClient,
  generateTitle: mock(async () => null),
}));

const { tryConsumeChat } = await import("./ipRateLimit");

let server: { fetch: (req: Request) => Response | Promise<Response> };
beforeAll(async () => {
  server = (await import("./index")).default;
});

function postChat(body: unknown): Promise<Response> {
  return Promise.resolve(
    server.fetch(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    )
  );
}

const VALID_BODY = { messages: [{ role: "user", content: "hi" }] };

describe("tryConsumeChat per-IP budget", () => {
  it("allows at the budget ceiling", async () => {
    rpcResult = 60; // CHAT_HOURLY_BUDGET
    expect(await tryConsumeChat("1.2.3.4")).toBe(true);
  });
  it("blocks over the budget", async () => {
    rpcResult = 61;
    expect(await tryConsumeChat("1.2.3.4")).toBe(false);
  });
  it("fails OPEN when the counter errors", async () => {
    rpcResult = "error";
    expect(await tryConsumeChat("1.2.3.4")).toBe(true);
  });
});

describe("/api/chat rate-limit wiring", () => {
  it("returns 429 and skips the model when over budget", async () => {
    rpcResult = 61; // limiter will block
    createClient.mockClear();
    const res = await postChat(VALID_BODY);
    expect(res.status).toBe(429);
    expect(createClient).not.toHaveBeenCalled();
  });
  it("proceeds (not 429) when under budget", async () => {
    rpcResult = 1;
    streamThrows = false;
    const res = await postChat(VALID_BODY);
    expect(res.status).not.toBe(429);
  });
});

describe("/api/chat error masking", () => {
  it("sends a generic error, not the raw exception", async () => {
    rpcResult = 1; // under budget, so the model path runs
    streamThrows = true;
    const res = await postChat(VALID_BODY);
    const text = await res.text();
    expect(text).not.toContain("SECRET-INTERNAL-DETAIL-do-not-leak");
    expect(text).toContain("Failed to get a reply from the model");
  });
});
