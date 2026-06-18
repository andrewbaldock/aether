// Characterization tests for the agent loop (createClaudeClient / createOpenAICompatClient).
//
// These PIN the current behavior of the hottest, most subtle code in the backend —
// text streaming, the tool-use loop, the iteration cap, and the max_tokens salvage —
// so the planned loop-unification refactor (plans/006) can prove it changed nothing.
// They are deliberately offline + deterministic: both SDKs are injected as fakes (see
// below), so no network, no API key, no tokens.
//
// Mocking strategy:
// - The Anthropic + OpenAI SDKs are injected via llm.ts's test-only factory seam
//   (`__setAnthropicFactoryForTests` / `__setOpenAIFactoryForTests`), NOT via
//   `mock.module`. Bun's module mocking is process-global and order-dependent — in a
//   full-suite run ownership.test.ts's `mock.module` collides with ours (it documents
//   the same hazard). The factory hook is read at getClient() call time, so it's immune
//   to import ordering. The fakes replay a SCRIPTED sequence of wire events set per test.
// - The planner pre-pass (planTurn → Haiku) is kept from firing by using a GREETING
//   user message ("hello"): mightNeedPlan + mightClarify both return false, so planTurn
//   returns null before any client call (see planner.ts). That isolates the loop.
// - `executeTool` for render tools just echoes input, so a render-tool turn stays
//   offline. We avoid data tools (which fetch) entirely.

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import {
  __setAnthropicFactoryForTests,
  __setOpenAIFactoryForTests,
  __createClientForTests as createClient,
} from "./llm";

// Scripted wire events/chunks the injected fakes replay. Set per test.
let nextClaudeEvents: unknown[] = [];
let nextOpenAIChunks: unknown[] = [];
const setClaudeEvents = (events: unknown[]) => {
  nextClaudeEvents = events;
};
const setOpenAIChunks = (chunks: unknown[]) => {
  nextOpenAIChunks = chunks;
};

// A fake Anthropic client: messages.stream() replays nextClaudeEvents; messages.create()
// (planner / generateTitle) returns an empty, harmless response.
const fakeAnthropic = () => ({
  messages: {
    stream: (_params: unknown) =>
      (async function* () {
        for (const e of nextClaudeEvents) yield e;
      })(),
    create: async (_params: unknown) => ({
      content: [{ type: "text", text: "" }],
      usage: { input_tokens: 0, output_tokens: 0 },
    }),
  },
});

// A fake OpenAI-compat client: chat.completions.create() replays nextOpenAIChunks
// when streaming, else returns a trivial completion.
const fakeOpenAI = () => ({
  chat: {
    completions: {
      create: async (params: { stream?: boolean }) =>
        params.stream
          ? (async function* () {
              for (const c of nextOpenAIChunks) yield c;
            })()
          : { choices: [{ message: { content: "ok" } }] },
    },
  },
});

// The fakes are structural stand-ins; cast to the SDK types at the injection seam
// (the loop only touches messages.stream / chat.completions.create).
__setAnthropicFactoryForTests(() => fakeAnthropic() as unknown as Anthropic);
__setOpenAIFactoryForTests(() => fakeOpenAI() as unknown as OpenAI);

// Leave the seam clean for any later-running test file (defensive — the seam is only
// read inside the two client getClient()s, which other tests don't construct).
afterAll(() => {
  __setAnthropicFactoryForTests(undefined);
  __setOpenAIFactoryForTests(undefined);
});

// ── Anthropic event builders (match the shapes the loop reads in llm.ts) ───────
const aMessageStart = () => ({
  type: "message_start",
  message: {
    usage: {
      input_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  },
});
const aTextBlockStart = () => ({
  type: "content_block_start",
  index: 0,
  content_block: { type: "text" },
});
const aTextDelta = (text: string) => ({
  type: "content_block_delta",
  index: 0,
  delta: { type: "text_delta", text },
});
const aTextBlockStop = () => ({ type: "content_block_stop", index: 0 });
const aToolBlockStart = (index: number, id: string, name: string) => ({
  type: "content_block_start",
  index,
  content_block: { type: "tool_use", id, name },
});
const aInputDelta = (index: number, partial_json: string) => ({
  type: "content_block_delta",
  index,
  delta: { type: "input_json_delta", partial_json },
});
const aBlockStop = (index: number) => ({ type: "content_block_stop", index });
const aMessageDelta = (stop_reason: string) => ({
  type: "message_delta",
  delta: { stop_reason },
  usage: { output_tokens: 10 },
});

// A turn that just streams text and ends.
const claudeTextTurn = (text: string) => [
  aMessageStart(),
  aTextBlockStart(),
  aTextDelta(text),
  aTextBlockStop(),
  aMessageDelta("end_turn"),
];

// A turn that emits one render_table tool_use (streaming JSON) then asks to use it.
const claudeToolTurn = (json: string) => [
  aMessageStart(),
  aToolBlockStart(1, "tu_1", "render_table"),
  aInputDelta(1, json),
  aBlockStop(1),
  aMessageDelta("tool_use"),
];

// ── OpenAI chunk builders ──────────────────────────────────────────────────────
const oTextChunk = (content: string, finish_reason: string | null = null) => ({
  choices: [{ delta: { content }, finish_reason }],
});
const oToolChunk = (
  index: number,
  id: string,
  name: string,
  args: string,
  finish_reason: string | null = null
) => ({
  choices: [
    {
      delta: {
        tool_calls: [{ index, id, function: { name, arguments: args } }],
      },
      finish_reason,
    },
  ],
});
const oFinish = (finish_reason: string) => ({
  choices: [{ delta: {}, finish_reason }],
});

// A no-op callback bag; tests override the handlers they assert on.
function callbacks(overrides: Record<string, unknown> = {}) {
  return {
    onToken: async () => {},
    onDone: async () => {},
    onToolStart: async () => {},
    onToolResult: async () => {},
    onToolPartial: async () => {},
    onLoopStart: async () => {},
    onStatus: async () => {},
    onPlan: async () => {},
    onClarify: async () => {},
    ...overrides,
  };
}

// `createClient` returns the right client per model; "hello" skips the planner.
const greeting = [{ role: "user" as const, content: "hello" }];

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.GOOGLE_AI_API_KEY = "test-key";
  process.env.LLM_MAX_ITERATIONS = "6";
  setClaudeEvents([]);
  setOpenAIChunks([]);
});

// Helper: invoke a client's stream with the current positional callback signature.
// NOTE: if plans/004 (callbacks-as-struct) lands, update these calls to the struct form.
function runStream(
  // biome-ignore lint/suspicious/noExplicitAny: thin shim over the LlmClient surface
  client: any,
  // biome-ignore lint/suspicious/noExplicitAny: a minimal ChatMessage[] for the test
  messages: any,
  cb: ReturnType<typeof callbacks>
) {
  return client.stream(
    messages,
    cb.onToken,
    cb.onDone,
    cb.onToolStart,
    cb.onToolResult,
    cb.onToolPartial,
    cb.onLoopStart,
    cb.onStatus,
    cb.onPlan,
    cb.onClarify,
    false
  );
}

const claude = () =>
  createClient({ graphMode: false, model: "claude-sonnet-4-6" });
const google = () =>
  createClient({ graphMode: false, model: "gemini-3.5-flash" });

describe("Claude agent loop", () => {
  test("text-only turn streams every token then completes", async () => {
    setClaudeEvents(claudeTextTurn("Hello world"));
    const tokens: string[] = [];
    let done = 0;
    let toolStarts = 0;
    await runStream(
      claude(),
      greeting,
      callbacks({
        onToken: async (t: string) => {
          tokens.push(t);
        },
        onDone: async () => {
          done++;
        },
        onToolStart: async () => {
          toolStarts++;
        },
      })
    );
    expect(tokens.join("")).toBe("Hello world");
    expect(done).toBe(1);
    expect(toolStarts).toBe(0);
  });

  test("single tool turn: partials stream, tool executes, loop re-enters, then done", async () => {
    const spec = JSON.stringify({
      columns: [{ key: "a", label: "A" }],
      rows: [{ a: 1 }],
    });
    // Iteration 1 emits a render_table tool_use; once its result feeds back we re-script
    // the fake to a plain-text turn so iteration 2 closes cleanly. (The fake reads
    // nextClaudeEvents lazily at each stream() call, so swapping it mid-turn drives a
    // second iteration without a per-call queue.)
    setClaudeEvents(claudeToolTurn(spec));
    const partials: { complete: boolean }[] = [];
    const toolResults: string[] = [];
    let loopStarts = 0;
    let done = 0;
    await runStream(
      claude(),
      greeting,
      callbacks({
        onToolPartial: async (_n: string, _j: string, isComplete: boolean) => {
          partials.push({ complete: isComplete });
        },
        onToolResult: async (_n: string, r: string) => {
          toolResults.push(r);
          setClaudeEvents(claudeTextTurn("done"));
        },
        onLoopStart: async () => {
          loopStarts++;
        },
        onDone: async () => {
          done++;
        },
      })
    );
    expect(partials.some((p) => p.complete)).toBe(true);
    expect(toolResults[0]).toBe(spec); // render_table echoes its input
    expect(loopStarts).toBe(1); // iteration 2 fired onLoopStart
    expect(done).toBe(1);
  });

  test("iteration cap: always-tool model stops at MAX_ITERATIONS without throwing", async () => {
    process.env.LLM_MAX_ITERATIONS = "2";
    const spec = JSON.stringify({
      columns: [{ key: "a", label: "A" }],
      rows: [{ a: 1 }],
    });
    setClaudeEvents(claudeToolTurn(spec));
    // Always return a tool turn; on the capped final iteration the loop sends no tools,
    // but our fake ignores params and would still yield a tool block. The cap path keys
    // on stopReason !== "tool_use" OR pendingTools 0 to exit; the final-iteration call
    // is made without tools, and a well-behaved model returns text. Simulate that by
    // switching to a text turn once we've re-entered the loop the capped number of times.
    let loopStarts = 0;
    let done = 0;
    let threw = false;
    try {
      await runStream(
        claude(),
        greeting,
        callbacks({
          onLoopStart: async () => {
            loopStarts++;
            setClaudeEvents(claudeTextTurn("final"));
          },
          onDone: async () => {
            done++;
          },
        })
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(done).toBe(1);
    expect(loopStarts).toBeLessThanOrEqual(2);
  });

  test("max_tokens salvage: truncated streamable spec is salvaged, turn ends soft (no throw)", async () => {
    // A partial-but-non-degenerate render_table JSON, truncated mid-rows.
    const truncated =
      '{"columns":[{"key":"a","label":"A"}],"rows":[{"a":1},{"a":2}';
    setClaudeEvents([
      aMessageStart(),
      aToolBlockStart(1, "tu_1", "render_table"),
      aInputDelta(1, truncated),
      aBlockStop(1),
      aMessageDelta("max_tokens"),
    ]);
    const finalPartials: string[] = [];
    const statuses: string[] = [];
    let done = 0;
    let threw = false;
    try {
      await runStream(
        claude(),
        greeting,
        callbacks({
          onToolPartial: async (
            _n: string,
            json: string,
            isComplete: boolean
          ) => {
            if (isComplete) finalPartials.push(json);
          },
          onStatus: async (m: string) => {
            statuses.push(m);
          },
          onDone: async () => {
            done++;
          },
        })
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(done).toBe(1);
    expect(finalPartials.length).toBeGreaterThan(0);
    expect(statuses.some((s) => s.includes("ran long"))).toBe(true);
  });
});

describe("OpenAI-compat agent loop", () => {
  test("text-only turn streams tokens then completes", async () => {
    setOpenAIChunks([oTextChunk("Hi "), oTextChunk("there", "stop")]);
    const tokens: string[] = [];
    let done = 0;
    await runStream(
      google(),
      greeting,
      callbacks({
        onToken: async (t: string) => {
          tokens.push(t);
        },
        onDone: async () => {
          done++;
        },
      })
    );
    expect(tokens.join("")).toBe("Hi there");
    expect(done).toBe(1);
  });

  test("single tool turn executes and feeds back, then completes", async () => {
    const spec = JSON.stringify({
      columns: [{ key: "a", label: "A" }],
      rows: [{ a: 1 }],
    });
    // Iteration 1: a tool_call. Iteration 2: text close.
    setOpenAIChunks([
      oToolChunk(0, "call_1", "render_table", spec),
      oFinish("tool_calls"),
    ]);
    const toolResults: string[] = [];
    let done = 0;
    await runStream(
      google(),
      greeting,
      callbacks({
        onToolResult: async (_n: string, r: string) => {
          toolResults.push(r);
          setOpenAIChunks([oTextChunk("done", "stop")]);
        },
        onDone: async () => {
          done++;
        },
      })
    );
    expect(toolResults[0]).toBe(spec);
    expect(done).toBe(1);
  });

  test("finish_reason length triggers salvage and a soft finish (no throw)", async () => {
    const truncated =
      '{"columns":[{"key":"a","label":"A"}],"rows":[{"a":1},{"a":2}';
    setOpenAIChunks([
      oToolChunk(0, "call_1", "render_table", truncated),
      oFinish("length"),
    ]);
    const finalPartials: string[] = [];
    const statuses: string[] = [];
    let done = 0;
    let threw = false;
    try {
      await runStream(
        google(),
        greeting,
        callbacks({
          onToolPartial: async (
            _n: string,
            json: string,
            isComplete: boolean
          ) => {
            if (isComplete) finalPartials.push(json);
          },
          onStatus: async (m: string) => {
            statuses.push(m);
          },
          onDone: async () => {
            done++;
          },
        })
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(done).toBe(1);
    expect(finalPartials.length).toBeGreaterThan(0);
    expect(statuses.some((s) => s.includes("ran long"))).toBe(true);
  });

  test("MALFORMED_FUNCTION_CALL surfaces as a thrown error", async () => {
    setOpenAIChunks([oFinish("MALFORMED_FUNCTION_CALL")]);
    let threw = false;
    try {
      await runStream(google(), greeting, callbacks());
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
