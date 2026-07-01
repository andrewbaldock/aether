import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getAnthropicClient } from "./anthropicClient";
import { closeTruncatedJson, parseBestEffort } from "./bestEffortJson";
import { DEFAULT_MODEL, type Provider, providerForModel } from "./models";
import {
  type ClarifyResult,
  type CompositionPlan,
  planPreamble,
  planTurn,
} from "./planner";
import { buildSystemPrompt } from "./prompt";
import {
  buildTools,
  correctionDirective,
  executeTool,
  ICON_VOCABULARY,
  isDegenerate,
  STREAMABLE_RENDER_TOOLS,
  type ToolDefinition,
  toOpenAITools,
  toolResultStatus,
} from "./tools";

// Per-turn cap on in-loop self-corrections. One graded retry on a degenerate
// render is plenty for the demo (and never past MAX_ITERATIONS); more would risk
// ping-ponging on a genuinely empty answer. Env-overridable like the other caps.
const MAX_CORRECTIONS = Number(process.env.LLM_MAX_CORRECTIONS) || 1;

// ── Test-only SDK injection seam ────────────────────────────────────────────
// The two clients construct their SDK lazily (see each getClient()). In tests we
// inject fakes here instead of mocking the SDK modules, because Bun's `mock.module`
// is process-GLOBAL and order-dependent (ownership.test.ts documents the same
// hazard) — module mocks collide across files in a full-suite run. A plain function
// hook is immune to import ordering: it's read at getClient() call time. Undefined
// in production, so the real SDKs are used. Set via the exported setters below.
let testAnthropicFactory: ((apiKey: string) => Anthropic) | undefined;
let testOpenAIFactory:
  | ((opts: { apiKey: string; baseURL: string }) => OpenAI)
  | undefined;

/** Test-only: inject a fake Anthropic client factory (or pass undefined to reset). */
export function __setAnthropicFactoryForTests(
  f: ((apiKey: string) => Anthropic) | undefined
): void {
  testAnthropicFactory = f;
}
/** Test-only: inject a fake OpenAI-compat client factory (or pass undefined to reset). */
export function __setOpenAIFactoryForTests(
  f: ((opts: { apiKey: string; baseURL: string }) => OpenAI) | undefined
): void {
  testOpenAIFactory = f;
}
// Test-only alias to the real createClient. llm.test.ts calls THIS rather than
// `createClient` because ownership.test.ts mock.module-overrides the `createClient`
// export (process-global) with a no-op route stub; this differently-named export
// survives ownership's `...realLlm` spread, so the loop tests reach the real factory
// regardless of suite order. (Defined at the bottom of the file, after createClient.)

// The LLM connector — a Platform seam. The route calls `createClient().complete()`
// and never names a provider. The factory picks the client from the chosen model's
// provider (see ./models): Claude → the Anthropic SDK; Google / DeepSeek / Mistral
// → one shared OpenAI-compatible client (they all speak /chat/completions).

// An ephemeral file the user attached to a turn — an image or a PDF, carried
// inline as base64. Not persisted: only the just-sent user turn carries these
// (the frontend never re-sends them on follow-ups), and the DB stores text only.
// `kind` maps to the Anthropic block type: "image" → image block, "document" →
// document block (PDF). `mediaType` is the IANA type (image/png, application/pdf).
export interface Attachment {
  kind: "image" | "document";
  mediaType: string;
  data: string; // base64, no data: URI prefix
}

// One message in the conversation, as the connector sees it. This is the wire
// shape the frontend sends — independent of any provider's SDK types.
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // Optional transcript stand-in for a user turn. When present, `content` is what
  // the model sees while `displayText` is what gets persisted/shown — letting the
  // UI send a long fill instruction without surfacing it in the conversation. The
  // model never receives this field (the SDK mappers project to {role, content}).
  displayText?: string;
  // Ephemeral image/PDF attachments for THIS turn (last user message only). Folded
  // into the Anthropic content blocks alongside the text; ignored by the
  // OpenAI-compat clients for now (Claude-only feature). Never persisted.
  attachments?: Attachment[];
}

// The streaming callbacks, as one struct (named, not 9 positional args). Adding a new
// callback is a non-breaking optional field here — no positional-slot churn across the
// interface + both client implementations + the route call site.
export interface StreamCallbacks {
  onToken: (token: string) => Promise<void>;
  onDone: () => Promise<void>;
  onToolStart?: (name: string, input: unknown) => Promise<void>;
  onToolResult?: (name: string, result: string) => Promise<void>;
  // Fired repeatedly while a STREAMABLE render tool's input JSON streams in, then
  // once more with isComplete=true when the block closes. `partialJson` is the
  // raw, possibly-incomplete tool input accumulated so far — the same string that
  // will become the tool_result, just early. Lets the frontend paint a growing
  // widget spec instead of waiting for the whole block. Render tools only; data
  // tools never fire this (their result comes from a fetch, not the model text).
  onToolPartial?: (
    name: string,
    partialJson: string,
    isComplete: boolean
  ) => Promise<void>;
  // Fired at the top of the agent loop for the second iteration onward — i.e.
  // each time tool results are fed back and the model is called again. Lets the
  // frontend visualise the loop re-entering. Iteration 1 is implied by the
  // request itself, so it is not signalled here.
  onLoopStart?: (iteration: number) => Promise<void>;
  // Display-only status blurb for the activity indicator, fired at points the
  // loop would otherwise be silent (before the first call, on loop re-entry,
  // while wrapping up). Cosmetic — it carries no tool semantics and is
  // superseded the moment a token / tool_start / tool_result arrives.
  onStatus?: (message: string) => Promise<void>;
  // Fired once, pre-loop, when the planner produces an abstract composition plan
  // for this turn (complex turns only). Carries WHICH capabilities + how they
  // relate — never coordinates. The host forwards it as the `plan` SSE event;
  // Bigsail consumes it. Absent on simple turns (the planner is gated).
  onPlan?: (plan: CompositionPlan) => Promise<void>;
  // Fired once, pre-loop, when the planner decides the turn is thin-but-explodable
  // and asks ONE clarifying question INSTEAD of composing. When this fires, the
  // turn ends WITHOUT entering the agent loop: the question streams as the
  // assistant's text (via onToken) and the host forwards `clarify` as an SSE so
  // the frontend can render tappable options. Mutually exclusive with onPlan.
  onClarify?: (clarify: ClarifyResult) => Promise<void>;
}

export interface LlmClient {
  complete(messages: ChatMessage[]): Promise<string>;
  // `opts.clarified` is true when this turn is the answer to a prior clarifier —
  // threaded into the planner so it won't clarify again (no interrogation loops).
  stream(
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    opts?: { clarified?: boolean }
  ): Promise<void>;
}

// Internal type alias — the Anthropic SDK's MessageParam. The public ChatMessage
// uses plain strings; internally the agent loop needs structured content blocks
// once tool_use / tool_result blocks appear.
type ApiMessage = Anthropic.Messages.MessageParam;

// Hard ceiling on agent-loop iterations, shared by both clients. The loop stops
// naturally when the model stops calling tools; this is the backstop for when it
// doesn't — two tools ping-ponging, or a model that keeps calling one — so a turn
// can't bill unbounded. On the FINAL allowed iteration we re-call the model with
// NO tools, forcing a plain text answer that closes the turn cleanly (degrade, not
// throw). Env-overridable like the token budgets. Kept modest: real turns settle
// in 1–3 iterations; anything past ~6 is a loop, not progress.
const MAX_ITERATIONS = Number(process.env.LLM_MAX_ITERATIONS) || 6;

// ── Shared agent-loop helpers ──────────────────────────────────────────────
// The two clients (Claude / OpenAI-compat) run the SAME agent loop with different
// wire formats. These small helpers hold the wire-format-independent logic so it
// lives in ONE place and can't drift between the clients.

// The outcome of the gated planner pre-pass, for the stream entry point to act on:
// - "preamble": fold this steering string into the conversation and run the loop.
// - "clarify":  DON'T run the loop — ask one expanding question and end the turn.
// - "none":     plain ReAct (no plan, no clarifier).
type PrePassOutcome =
  | { kind: "preamble"; preamble: string }
  | { kind: "clarify"; clarify: ClarifyResult }
  | { kind: "none" };

// The planner pre-pass, gated. ONE Haiku call judges the turn and yields one of:
// a composition plan (emit it → `plan` SSE / Bigsail, return a steering preamble),
// a clarifier (a thin-but-explodable turn → ask one question first, see
// PrePassOutcome "clarify"), or nothing (plain ReAct). Best-effort — any failure
// degrades to "none". `clarified` is true when this turn is itself a clarifier
// answer, suppressing a second clarifier (no interrogation loops). The preamble is
// appended to the conversation prefix ONCE by the caller (not per iteration), so
// the cached system/tools prefix is untouched and (on Claude) it rides the
// conversation cache on iterations 2+.
// How many trailing messages of the conversation the planner sees, and how much of
// each. The planner is a cheap Haiku call that runs on most turns, so we keep this
// compact (light-budget demo): enough recent context to judge what the turn is
// REALLY about, not the whole transcript.
const PLANNER_CONTEXT_TURNS = 6;
const PLANNER_MSG_CHARS = 400;

// Compose the planner's view of a turn: the compact recent conversation tail plus
// the latest request, folded into one prompt. The planner MUST see context or it
// misjudges fruitfulness — e.g. an empty-tool "Update" sends a generic "build the
// best chart about what we've been discussing", and with no history the planner
// thinks nothing's been discussed and clarifies wrongly. With the tail it sees the
// real subject and composes (or clarifies only when there's genuinely nothing).
//
// `clarified` reframes it: the latest message is then a terse answer to a prior
// clarifier ("Demons"), so we tell the planner to compose for what they ultimately
// want using the exchange — not the one-word reply alone.
function buildPlannerInput(
  messages: ChatMessage[],
  clarified: boolean
): string {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  // biome-ignore lint/style/noNonNullAssertion: lastUserIdx, when >= 0, is an index found in the loop above and is provably in-bounds
  const latest = lastUserIdx >= 0 ? messages[lastUserIdx]!.content : "";
  // Prior context = everything before the latest user turn, capped + truncated.
  const prior = (lastUserIdx >= 0 ? messages.slice(0, lastUserIdx) : messages)
    .slice(-PLANNER_CONTEXT_TURNS)
    .map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      const text = m.content.slice(0, PLANNER_MSG_CHARS);
      return `${role}: ${text}`;
    })
    .join("\n");

  // No prior context at all → the planner judges the latest message on its own (the
  // genuinely-thin case the clarifier is FOR).
  if (!prior) return latest;

  if (clarified) {
    return `The user is answering a clarifying question. Plan a rich composition for what they ultimately want.\n\nConversation so far:\n${prior}\n\nTheir answer: ${latest}`;
  }
  return `Plan a composition for the latest request, judged in the context of the conversation so far. If the latest request is a generic "build from what we've discussed", use that conversation as the subject — do NOT treat it as having no topic.\n\nConversation so far:\n${prior}\n\nLatest request: ${latest}`;
}

async function runPlannerPrePass(
  messages: ChatMessage[],
  onPlan?: (plan: CompositionPlan) => Promise<void>,
  clarified?: boolean
): Promise<PrePassOutcome> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return { kind: "none" };
  // Gate on the raw latest message; let the Haiku call see the context-enriched view.
  const plannerInput = buildPlannerInput(messages, clarified === true);
  const result = await planTurn(lastUser.content, {
    clarified,
    prompt: plannerInput,
  });
  if (!result) return { kind: "none" };
  if (result.kind === "clarify")
    return { kind: "clarify", clarify: result.clarify };
  await onPlan?.(result.plan);
  return { kind: "preamble", preamble: planPreamble(result.plan) };
}

// End a turn as a clarifier WITHOUT running the agent loop: stream the question as
// the assistant's text (so it lands in the transcript like any reply), fire
// onClarify (→ `clarify` SSE, carrying the tappable options), then close the turn.
// Shared by both clients so the early-exit can't drift between them.
async function emitClarifyTurn(
  clarify: ClarifyResult,
  onToken: (token: string) => Promise<void>,
  onDone: () => Promise<void>,
  onClarify?: (clarify: ClarifyResult) => Promise<void>
): Promise<void> {
  await onToken(clarify.question);
  await onClarify?.(clarify);
  await onDone();
}

// Status emitted at the top of each iteration, filling dead-air windows. Iteration
// 1's "Thinking it through…" covers the longest gap (pre-first-token); 2+ signals
// the loop re-entering after tool results. atCap signals the forced text close.
async function emitIterationStatus(
  iteration: number,
  atCap: boolean,
  onLoopStart?: (iteration: number) => Promise<void>,
  onStatus?: (message: string) => Promise<void>
): Promise<void> {
  if (iteration > 1) {
    await onLoopStart?.(iteration);
    await onStatus?.("Reviewing what came back…");
  } else {
    await onStatus?.("Thinking it through…");
  }
  if (atCap) await onStatus?.("Wrapping up…");
}

// Self-correction, applied to a whole batch of tool results from one iteration.
// If a result is degenerate (empty rows/data/items), append a corrective directive
// to the content the MODEL sees (not the one the frontend parsed) so it self-heals
// next iteration. The budget (MAX_CORRECTIONS) is spent PER ITERATION, not per
// tool: when a correction pass is allowed, ALL degenerate tools in the batch get
// the directive — otherwise tool ordering would decide which empty panel gets
// healed in a composed (multi-tool) answer, the headline use case. Returns the
// (possibly augmented) model-facing string for each result, in input order, plus
// whether this batch consumed a correction pass.
function applySelfCorrection(
  results: { name: string; result: string }[],
  correctionCount: number,
  iteration: number
): { modelResults: string[]; consumedCorrection: boolean } {
  const canCorrect = correctionCount < MAX_CORRECTIONS;
  let consumedCorrection = false;
  const modelResults = results.map(({ name, result }) => {
    if (canCorrect && isDegenerate(name, result)) {
      consumedCorrection = true;
      console.log(
        `[self-correct] iter=${iteration} tool=${name} degenerate → corrective retry ${correctionCount + 1}/${MAX_CORRECTIONS}`
      );
      return result + correctionDirective(name);
    }
    return result;
  });
  return { modelResults, consumedCorrection };
}

// Map a ChatMessage to an Anthropic MessageParam, folding any attachments into
// content blocks. With no attachments, content stays a plain string (the common
// path). With attachments, content becomes a block array: media blocks first,
// then the text block (Anthropic's convention — the question reads after what it's
// about). Only user turns carry attachments; assistant turns pass through as text.
function toApiMessage(m: ChatMessage): ApiMessage {
  if (!m.attachments || m.attachments.length === 0) {
    return { role: m.role, content: m.content };
  }
  const mediaBlocks: Anthropic.Messages.ContentBlockParam[] = m.attachments.map(
    (a) =>
      a.kind === "image"
        ? {
            type: "image",
            source: {
              type: "base64",
              media_type:
                a.mediaType as Anthropic.Messages.Base64ImageSource["media_type"],
              data: a.data,
            },
          }
        : {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: a.data,
            },
          }
  );
  // A text block must follow even when content is empty-ish: an image/PDF with no
  // prose still needs the turn to be non-empty, and the model reads better with the
  // question last. Drop the text block only if content is truly empty.
  const blocks: Anthropic.Messages.ContentBlockParam[] = m.content
    ? [...mediaBlocks, { type: "text", text: m.content }]
    : mediaBlocks;
  return { role: m.role, content: blocks };
}

// ── The shared agent loop ───────────────────────────────────────────────────
// Both providers run the SAME loop; only the wire format differs. The loop consumes
// a NORMALIZED event stream (LoopEvent) from a per-provider WireAdapter and never
// sees an Anthropic or OpenAI SDK type — so the subtle, bug-prone pieces (streaming,
// the 120ms partial throttle, the max_tokens salvage + degeneracy guard, the
// iteration cap + final-no-tools degrade, self-correction) live in ONE place.

// One normalized event from a provider's stream. A superset union: `server_tool_*`
// is Claude-only (web_search), the OpenAI adapter simply never emits it. The loop
// keys on the event KIND, never on the provider — so no `provider === …` branch.
type LoopEvent =
  // A text token to stream to the user.
  | { kind: "text"; text: string }
  // A client-side tool_use began (loop will run executeTool when it stops).
  | { kind: "tool_start"; index: number; id: string; name: string }
  // A fragment of a tool's input JSON (accumulated; throttled to the client if streamable).
  | { kind: "tool_delta"; index: number; json: string }
  // A provider-specific opaque token to carry on the assistant message for THIS tool
  // (Gemini's thought_signature; undefined for everyone else).
  | { kind: "tool_meta"; index: number; thoughtSignature?: string }
  // A server-side tool (Claude web_search) began — forward to onToolStart, NO executeTool.
  | { kind: "server_tool_start"; name: string }
  // A server-side tool result — forward to onToolResult, NO executeTool.
  | { kind: "server_tool_result"; name: string; content: string }
  // Per-call usage (input/output token counts + the Anthropic cache split; zeros elsewhere).
  | {
      kind: "usage";
      inputTokens: number;
      outputTokens: number;
      cacheRead: number;
      cacheCreation: number;
    }
  // The model call ended; `reason` is normalized across providers.
  | {
      kind: "stop";
      reason: "end" | "tool_use" | "max_tokens" | "malformed_tool";
    };

// A pending client-side tool call, accumulated across deltas within one iteration.
interface PendingTool {
  id: string;
  name: string;
  inputChunks: string[];
  thoughtSignature?: string;
  streamable: boolean;
  lastPartialAt: number;
}

// What the loop needs from a provider. `M` is the provider's message type — opaque to
// the loop; the adapter owns building/appending it.
interface WireAdapter<M> {
  // Stream one model call over the running history. `withTools` is false on the
  // capped final iteration (force a text answer). Yields normalized LoopEvents.
  stream(history: M[], opts: { withTools: boolean }): AsyncIterable<LoopEvent>;
  // Append the assistant turn (its text + the tool_use calls it made) followed by the
  // tool results, in this provider's message shape, to `history`. `modelResults` is the
  // possibly-self-corrected result string per tool, in the same order as `tools`.
  appendToolRound(
    history: M[],
    assistantText: string,
    tools: PendingTool[],
    modelResults: string[]
  ): void;
}

// The provider-agnostic agent loop. Returns when the model stops calling tools, the
// salvage path fires, or the iteration cap forces a text close. Mirrors exactly what
// the two clients used to do inline.
async function runAgentLoop<M>(
  adapter: WireAdapter<M>,
  history: M[],
  sessionId: string | undefined,
  callbacks: {
    onToken: (token: string) => Promise<void>;
    onDone: () => Promise<void>;
    onToolStart?: (name: string, input: unknown) => Promise<void>;
    onToolResult?: (name: string, result: string) => Promise<void>;
    onToolPartial?: (
      name: string,
      partialJson: string,
      isComplete: boolean
    ) => Promise<void>;
    onLoopStart?: (iteration: number) => Promise<void>;
    onStatus?: (message: string) => Promise<void>;
  }
): Promise<void> {
  const {
    onToken,
    onDone,
    onToolStart,
    onToolResult,
    onToolPartial,
    onLoopStart,
    onStatus,
  } = callbacks;

  let iteration = 0;
  let correctionCount = 0;
  let turnInput = 0;
  let turnOutput = 0;
  let turnCacheRead = 0;
  let turnCacheCreation = 0;
  // Whether any prior iteration streamed text this turn (for the inter-iteration
  // paragraph-break separator — see the original inline comment).
  let turnEmittedText = false;

  while (true) {
    iteration++;
    const atCap = iteration >= MAX_ITERATIONS;
    await emitIterationStatus(iteration, atCap, onLoopStart, onStatus);

    const pendingTools = new Map<number, PendingTool>();
    let assistantText = "";
    // First text token of THIS iteration not yet streamed (used once, to insert the
    // separator before iteration 2+ text that follows earlier iterations' text).
    let iterationTextStarted = false;
    let stopReason:
      | "end"
      | "tool_use"
      | "max_tokens"
      | "malformed_tool"
      | null = null;

    for await (const ev of adapter.stream(history, { withTools: !atCap })) {
      if (ev.kind === "text") {
        // Separate this iteration's text from a previous iteration's: prefix a
        // paragraph break on the FIRST text token here if earlier text exists and
        // this one doesn't already start with whitespace.
        if (!iterationTextStarted && turnEmittedText && !/^\s/.test(ev.text)) {
          await onToken("\n\n");
          assistantText += "\n\n";
        }
        iterationTextStarted = true;
        turnEmittedText = true;
        await onToken(ev.text);
        assistantText += ev.text;
      } else if (ev.kind === "tool_start") {
        pendingTools.set(ev.index, {
          id: ev.id,
          name: ev.name,
          inputChunks: [],
          streamable: STREAMABLE_RENDER_TOOLS.has(ev.name),
          lastPartialAt: 0,
        });
      } else if (ev.kind === "tool_delta") {
        const t = pendingTools.get(ev.index);
        if (t) {
          t.inputChunks.push(ev.json);
          if (t.streamable && onToolPartial) {
            const now = Date.now();
            if (now - t.lastPartialAt >= 120) {
              t.lastPartialAt = now;
              // Salvage the in-flight snapshot to valid JSON before emitting, so the
              // widget can paint NOW instead of waiting for the whole tool to finish.
              // The raw mid-stream accumulation is unbalanced ({"images":[{...},{...)
              // and the frontend parsers are strict JSON.parse, so every raw partial
              // failed to parse and nothing dripped — widgets only appeared once the
              // final (complete) partial landed. closeTruncatedJson rewinds to the
              // last COMPLETED element and balances the brackets, so the partial
              // carries every fully-streamed row/image/point and grows each tick.
              // Skipped until the first element completes (parseBestEffort undefined).
              const closed = closeTruncatedJson(t.inputChunks.join(""));
              if (parseBestEffort(closed) !== undefined) {
                await onToolPartial(t.name, closed, false);
              }
            }
          }
        }
      } else if (ev.kind === "tool_meta") {
        const t = pendingTools.get(ev.index);
        if (t && ev.thoughtSignature) t.thoughtSignature = ev.thoughtSignature;
      } else if (ev.kind === "server_tool_start") {
        await onToolStart?.(ev.name, {});
      } else if (ev.kind === "server_tool_result") {
        await onToolResult?.(ev.name, ev.content);
      } else if (ev.kind === "usage") {
        turnInput += ev.inputTokens;
        turnOutput += ev.outputTokens;
        turnCacheRead += ev.cacheRead;
        turnCacheCreation += ev.cacheCreation;
        console.log(
          `[usage] iter=${iteration} input=${ev.inputTokens} output=${ev.outputTokens} cache_read=${ev.cacheRead} cache_creation=${ev.cacheCreation}`
        );
      } else if (ev.kind === "stop") {
        stopReason = ev.reason;
      }
    }

    // Final (complete) partial for each streamable tool — the widget gets the full,
    // now-closed input. (The authoritative onToolResult still fires post-execute.)
    for (const tool of pendingTools.values()) {
      if (tool.streamable && onToolPartial) {
        await onToolPartial(tool.name, tool.inputChunks.join(""), true);
      }
    }

    // Gemini surfaces a failed tool call as this stop reason — make it visible.
    if (stopReason === "malformed_tool") {
      throw new Error(
        "The model produced a malformed tool call (finish_reason=MALFORMED_FUNCTION_CALL)."
      );
    }

    // Truncated by the output budget. Try to SALVAGE a streamable render tool's
    // partial input; only throw when nothing salvageable remains.
    if (stopReason === "max_tokens") {
      console.warn(
        `[max_tokens] iter=${iteration} truncated; attempting salvage of ${pendingTools.size} pending tool(s)`
      );
      let salvaged = false;
      for (const [, tool] of pendingTools) {
        if (!tool.streamable) continue;
        const closed = closeTruncatedJson(tool.inputChunks.join(""));
        if (parseBestEffort(closed) === undefined) continue;
        if (isDegenerate(tool.name, closed)) continue;
        await onToolPartial?.(tool.name, closed, true);
        salvaged = true;
      }
      if (salvaged) {
        await onStatus?.("That ran long — showing what came through.");
        await onDone();
        return;
      }
      throw new Error(
        "The model hit its output limit before finishing. " +
          "Raise the token budget or ask for a smaller result."
      );
    }

    // No tool calls — the stream is complete. Log the per-turn totals.
    if (stopReason !== "tool_use" || pendingTools.size === 0) {
      console.log(
        `[usage] turn total: iterations=${iteration} input=${turnInput} output=${turnOutput} cache_read=${turnCacheRead} cache_creation=${turnCacheCreation}`
      );
      await onDone();
      return;
    }

    // Execute each tool in input order (Map preserves insertion order).
    const tools = [...pendingTools.values()];
    const executed: { id: string; name: string; result: string }[] = [];
    for (const tool of tools) {
      const input = JSON.parse(tool.inputChunks.join("") || "{}") as unknown;
      await onToolStart?.(tool.name, input);
      const result = await executeTool(tool.name, input, sessionId);
      await onToolResult?.(tool.name, result);
      const countStatus = toolResultStatus(tool.name, result);
      if (countStatus) await onStatus?.(countStatus);
      executed.push({ id: tool.id, name: tool.name, result });
    }

    // One self-correction pass per turn, healing EVERY degenerate result in the batch.
    const { modelResults, consumedCorrection } = applySelfCorrection(
      executed,
      correctionCount,
      iteration
    );
    if (consumedCorrection) correctionCount++;

    adapter.appendToolRound(history, assistantText, tools, modelResults);
    // Continue the loop — call the model again with the updated history.
  }
}

function createClaudeClient(
  tools: ToolDefinition[],
  systemPrompt: string,
  selectedModel?: string,
  // Conversation id, threaded to executeTool so per-conversation tool limits
  // (e.g. the Unsplash search cap) can be scoped to this session. Undefined for
  // ephemeral/unpersisted chats.
  sessionId?: string
): LlmClient {
  // Build the SDK client lazily on first use, not at construction time. This lets
  // the server start (and /api/health respond) without a key set — only an actual
  // chat turn requires ANTHROPIC_API_KEY.
  let anthropic: Anthropic | undefined;
  function getClient(): Anthropic {
    if (!anthropic) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY is not set (add it to backend/.env)"
        );
      }
      anthropic = testAnthropicFactory
        ? testAnthropicFactory(apiKey)
        : new Anthropic({ apiKey });
    }
    return anthropic;
  }

  // Resolution order: the per-request model the user picked (already validated
  // against the allowlist by the route) → the ANTHROPIC_MODEL env override → the
  // built-in default.
  const model = selectedModel ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  // Output budget. 1024 is too tight once tools are in play: a single
  // build_knowledge_graph call can emit a large JSON entity dump and get
  // truncated (stop_reason "max_tokens"), leaving a partial tool_use that can't
  // be parsed and a turn that produces no usable output. Override with
  // ANTHROPIC_MAX_TOKENS.
  const maxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS) || 8192;

  // Tools are static for the life of this client (graphMode is fixed per
  // request). Mark the LAST tool with cache_control so the whole tool block —
  // re-sent on every agent-loop iteration — is read from cache after the first
  // call. One breakpoint covers all preceding tools.
  const cachedTools: ToolDefinition[] =
    tools.length > 0
      ? tools.map((t, i) =>
          i === tools.length - 1
            ? { ...t, cache_control: { type: "ephemeral" as const } }
            : t
        )
      : tools;

  // Return a copy of the history with a cache breakpoint on the last message's
  // last content block. Across agent-loop iterations the conversation prefix
  // (prior tool_use / tool_result turns) is then read from cache instead of
  // re-tokenised. We copy rather than mutate so `history` stays marker-free and
  // we never accumulate more than the allowed cache breakpoints.
  function withConversationCache(messages: ApiMessage[]): ApiMessage[] {
    const last = messages[messages.length - 1];
    if (!last) return messages;
    const out = messages.slice();
    const blocks: Anthropic.Messages.ContentBlockParam[] =
      typeof last.content === "string"
        ? [{ type: "text", text: last.content }]
        : last.content.map((b) => ({ ...b }));
    const tail = blocks[blocks.length - 1];
    if (tail) {
      blocks[blocks.length - 1] = {
        ...tail,
        cache_control: { type: "ephemeral" as const },
      } as Anthropic.Messages.ContentBlockParam;
    }
    out[out.length - 1] = { ...last, content: blocks };
    return out;
  }

  // `withoutTools` drops the tool block entirely — used on the final iteration of
  // the agent loop (the cap) so the model is forced to answer in text instead of
  // requesting yet another tool call.
  function apiParams(messages: ApiMessage[], withoutTools = false) {
    return {
      model,
      max_tokens: maxTokens,
      system: [
        {
          type: "text" as const,
          text: systemPrompt,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: withConversationCache(messages),
      ...(cachedTools.length > 0 && !withoutTools
        ? { tools: cachedTools }
        : {}),
    };
  }

  return {
    async complete(messages) {
      const apiMessages: ApiMessage[] = messages.map(toApiMessage);
      const response = await getClient().messages.create(
        apiParams(apiMessages)
      );

      // Concatenate every text block; ignore any non-text blocks (none yet, but
      // tool_use blocks would appear here once tools land).
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (!text) throw new Error("Model returned no text content");
      return text;
    },

    async stream(messages, callbacks, opts) {
      const {
        onToken,
        onDone,
        onToolStart,
        onToolResult,
        onToolPartial,
        onLoopStart,
        onStatus,
        onPlan,
        onClarify,
      } = callbacks;
      const clarified = opts?.clarified;
      // toApiMessage folds any attachments on the last user turn into content blocks.
      const history: ApiMessage[] = messages.map(toApiMessage);

      // Conditional planner pre-pass (gated). It yields a steering preamble (run the
      // loop), a clarifier (end the turn asking ONE question — no loop), or nothing.
      const prePass = await runPlannerPrePass(messages, onPlan, clarified);
      if (prePass.kind === "clarify") {
        await emitClarifyTurn(prePass.clarify, onToken, onDone, onClarify);
        return;
      }
      // Preamble appended ONCE to the conversation prefix, so the cached
      // system/tools prefix is untouched and it rides the conversation cache on
      // iterations 2+. See runPlannerPrePass.
      if (prePass.kind === "preamble")
        history.push({ role: "user", content: prePass.preamble });

      // The Anthropic wire adapter: translate the SDK's stream into LoopEvents and
      // build Anthropic-shaped history. Everything Anthropic-specific (event taxonomy,
      // the cache_read/creation usage split, server-side web_search, the
      // ContentBlockParam history shape) lives HERE; the shared loop sees none of it.
      const adapter: WireAdapter<ApiMessage> = {
        stream: (hist, { withTools }) =>
          (async function* (): AsyncIterable<LoopEvent> {
            for await (const event of getClient().messages.stream(
              apiParams(hist, !withTools)
            )) {
              if (event.type === "message_start") {
                const u = event.message.usage;
                yield {
                  kind: "usage",
                  inputTokens: u.input_tokens ?? 0,
                  outputTokens: 0,
                  cacheRead: u.cache_read_input_tokens ?? 0,
                  cacheCreation: u.cache_creation_input_tokens ?? 0,
                };
              } else if (event.type === "content_block_start") {
                const b = event.content_block;
                if (b.type === "tool_use") {
                  yield {
                    kind: "tool_start",
                    index: event.index,
                    id: b.id,
                    name: b.name,
                  };
                } else if (b.type === "server_tool_use") {
                  yield { kind: "server_tool_start", name: b.name };
                } else if (b.type === "web_search_tool_result") {
                  yield {
                    kind: "server_tool_result",
                    name: "web_search",
                    content: JSON.stringify(b.content),
                  };
                }
              } else if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta") {
                  yield { kind: "text", text: event.delta.text };
                } else if (event.delta.type === "input_json_delta") {
                  yield {
                    kind: "tool_delta",
                    index: event.index,
                    json: event.delta.partial_json,
                  };
                }
              } else if (event.type === "message_delta") {
                // Output token count is cumulative-final on message_delta.
                yield {
                  kind: "usage",
                  inputTokens: 0,
                  outputTokens: event.usage.output_tokens ?? 0,
                  cacheRead: 0,
                  cacheCreation: 0,
                };
                const r = event.delta.stop_reason;
                yield {
                  kind: "stop",
                  reason:
                    r === "tool_use"
                      ? "tool_use"
                      : r === "max_tokens"
                        ? "max_tokens"
                        : "end",
                };
              }
            }
          })(),
        appendToolRound: (hist, assistantText, toolList, modelResults) => {
          const assistantContent: Anthropic.Messages.ContentBlockParam[] = [
            ...(assistantText
              ? [{ type: "text" as const, text: assistantText }]
              : []),
            ...toolList.map((t) => ({
              type: "tool_use" as const,
              id: t.id,
              name: t.name,
              input: JSON.parse(t.inputChunks.join("") || "{}"),
            })),
          ];
          hist.push({ role: "assistant", content: assistantContent });
          const toolResults: Anthropic.Messages.ToolResultBlockParam[] =
            toolList.map((t, i) => ({
              type: "tool_result",
              tool_use_id: t.id,
              content: modelResults[i] as string,
            }));
          hist.push({ role: "user", content: toolResults });
        },
      };

      await runAgentLoop(adapter, history, sessionId, {
        onToken,
        onDone,
        onToolStart,
        onToolResult,
        onToolPartial,
        onLoopStart,
        onStatus,
      });
    },
  };
}

// Per-provider connection details for the OpenAI-compatible providers. They all
// expose an OpenAI-shaped /chat/completions endpoint, so one client implementation
// covers all three — only the base URL and key differ. Keys are read lazily (see
// below), so a missing key only fails a turn that actually uses that provider.
const OPENAI_COMPAT: Record<
  Exclude<Provider, "claude">,
  { baseURL: string; apiKeyEnv: string; label: string }
> = {
  google: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKeyEnv: "GOOGLE_AI_API_KEY",
    label: "Google AI",
  },
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    label: "DeepSeek",
  },
  mistral: {
    baseURL: "https://api.mistral.ai/v1",
    apiKeyEnv: "MISTRAL_API_KEY",
    label: "Mistral",
  },
};

// A client for any OpenAI-compatible provider (Google / DeepSeek / Mistral). Same
// LlmClient contract and same agent loop as the Claude client — the only real
// difference is the wire format: a head `system` message instead of a top-level
// param, OpenAI's `function` tool envelope, and streamed `tool_calls` deltas
// (arguments accumulated by index, mirroring the Claude path's inputChunks buffer).
// No prompt caching — that's Anthropic-specific; these providers either cache
// server-side (DeepSeek) or don't take the markers.
function createOpenAICompatClient(
  provider: Exclude<Provider, "claude">,
  tools: ToolDefinition[],
  systemPrompt: string,
  selectedModel: string,
  // See createClaudeClient: conversation id for per-conversation tool limits.
  sessionId?: string
): LlmClient {
  const cfg = OPENAI_COMPAT[provider];

  // Lazy SDK init, same as the Claude client: the server (and /api/health) can run
  // without this provider's key set — only a chat turn using it needs the key.
  let openai: OpenAI | undefined;
  function getClient(): OpenAI {
    if (!openai) {
      const apiKey = process.env[cfg.apiKeyEnv];
      if (!apiKey) {
        throw new Error(
          `${cfg.apiKeyEnv} is not set (add it to backend/.env to use ${cfg.label} models)`
        );
      }
      openai = testOpenAIFactory
        ? testOpenAIFactory({ apiKey, baseURL: cfg.baseURL })
        : new OpenAI({ apiKey, baseURL: cfg.baseURL });
    }
    return openai;
  }

  const maxTokens = Number(process.env.LLM_MAX_TOKENS) || 4096;
  const openaiTools = tools.length > 0 ? toOpenAITools(tools) : undefined;

  // Prepend the system prompt as the head message — OpenAI's equivalent of
  // Anthropic's top-level `system` param.
  function toApiMessages(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return [{ role: "system", content: systemPrompt }, ...messages];
  }

  return {
    async complete(messages) {
      const response = await getClient().chat.completions.create({
        model: selectedModel,
        max_tokens: maxTokens,
        messages: toApiMessages(
          messages.map((m) => ({ role: m.role, content: m.content }))
        ),
        ...(openaiTools ? { tools: openaiTools } : {}),
      });
      const text = response.choices[0]?.message?.content ?? "";
      if (!text) throw new Error("Model returned no text content");
      return text;
    },

    async stream(messages, callbacks, opts) {
      const {
        onToken,
        onDone,
        onToolStart,
        onToolResult,
        onToolPartial,
        onLoopStart,
        onStatus,
        onPlan,
        onClarify,
      } = callbacks;
      const clarified = opts?.clarified;
      const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        messages.map((m) => ({ role: m.role, content: m.content }));

      // Conditional planner pre-pass (gated), same as the Claude client. The plan
      // is appended to history as an extra user message; there's no prompt cache
      // here, so this just steers the model. The planner itself always runs on
      // Haiku, so non-Claude conversations still get planning + the `plan` event —
      // and the clarifier early-exit.
      const prePass = await runPlannerPrePass(messages, onPlan, clarified);
      if (prePass.kind === "clarify") {
        await emitClarifyTurn(prePass.clarify, onToken, onDone, onClarify);
        return;
      }
      if (prePass.kind === "preamble")
        history.push({ role: "user", content: prePass.preamble });

      // The OpenAI-compat wire adapter. Everything OpenAI-shaped (chunk taxonomy, the
      // function-tool envelope, Gemini's thought_signature + finish_reason quirks, the
      // N-separate-`tool`-messages history shape) lives HERE; the shared loop sees only
      // normalized LoopEvents. Streamed `tool_calls` deltas: the first for an index
      // carries id+name (→ tool_start), the rest carry argument fragments (→ tool_delta).
      const adapter: WireAdapter<OpenAI.Chat.Completions.ChatCompletionMessageParam> =
        {
          stream: (hist, { withTools }) =>
            (async function* (): AsyncIterable<LoopEvent> {
              const started = new Set<number>();
              let sawTool = false;
              let finishReason: string | null = null;
              const stream = await getClient().chat.completions.create({
                model: selectedModel,
                max_tokens: maxTokens,
                stream: true,
                messages: toApiMessages(hist),
                ...(openaiTools && withTools ? { tools: openaiTools } : {}),
              });
              for await (const chunk of stream) {
                const choice = chunk.choices[0];
                if (!choice) continue;
                const delta = choice.delta;
                if (delta?.content) yield { kind: "text", text: delta.content };
                for (const tc of delta?.tool_calls ?? []) {
                  sawTool = true;
                  const sig = (
                    tc as {
                      extra_content?: {
                        google?: { thought_signature?: string };
                      };
                    }
                  ).extra_content?.google?.thought_signature;
                  if (!started.has(tc.index)) {
                    started.add(tc.index);
                    // Synthesize a stable id when Gemini omits one (two empty ids
                    // would be indistinguishable → mis-bound results / 400).
                    yield {
                      kind: "tool_start",
                      index: tc.index,
                      id: tc.id || `call_${tc.index}`,
                      name: tc.function?.name ?? "",
                    };
                  }
                  if (tc.function?.arguments)
                    yield {
                      kind: "tool_delta",
                      index: tc.index,
                      json: tc.function.arguments,
                    };
                  if (sig)
                    yield {
                      kind: "tool_meta",
                      index: tc.index,
                      thoughtSignature: sig,
                    };
                }
                if (choice.finish_reason) finishReason = choice.finish_reason;
              }
              // OpenAI carries no per-call usage on the stream by default; report zeros.
              yield {
                kind: "usage",
                inputTokens: 0,
                outputTokens: 0,
                cacheRead: 0,
                cacheCreation: 0,
              };
              // Map finish_reason → normalized stop. CRITICAL: continue on the PRESENCE
              // of tool calls, not on finish_reason — Gemini reports "stop" even while
              // emitting a tool call (a known OpenAI-compat bug). So a tool seen ⇒
              // "tool_use" regardless of finishReason. `length`/malformed map straight.
              const reason:
                | "end"
                | "tool_use"
                | "max_tokens"
                | "malformed_tool" =
                finishReason === "length"
                  ? "max_tokens"
                  : finishReason === "MALFORMED_FUNCTION_CALL"
                    ? "malformed_tool"
                    : sawTool
                      ? "tool_use"
                      : "end";
              yield { kind: "stop", reason };
            })(),
          appendToolRound: (hist, assistantText, toolList, modelResults) => {
            // Sort by the tool's index is implicit — runAgentLoop preserves Map insertion
            // order, which is index order as the adapter emitted tool_start. Re-attach
            // Gemini's thought_signature on each call for multi-turn continuity.
            hist.push({
              role: "assistant",
              content: assistantText || null,
              tool_calls: toolList.map((t) => ({
                id: t.id,
                type: "function",
                function: {
                  name: t.name,
                  arguments: t.inputChunks.join("") || "{}",
                },
                ...(t.thoughtSignature
                  ? {
                      extra_content: {
                        google: { thought_signature: t.thoughtSignature },
                      },
                    }
                  : {}),
              })),
            });
            // OpenAI uses N separate `tool` messages (vs Anthropic's one user message
            // with N tool_result blocks).
            toolList.forEach((t, i) => {
              hist.push({
                role: "tool",
                tool_call_id: t.id,
                content: modelResults[i] as string,
              });
            });
          },
        };

      await runAgentLoop(adapter, history, sessionId, {
        onToken,
        onDone,
        onToolStart,
        onToolResult,
        onToolPartial,
        onLoopStart,
        onStatus,
      });
    },
  };
}

// Factory: picks the client from the chosen model's provider. Defaults to Claude
// (DEFAULT_MODEL's provider) when no model is named. Throws on an unknown provider
// rather than silently doing the wrong thing. `graphMode` gates the Knowledge
// Graph tool + its prompt guidance — called per request, so each turn gets exactly
// the right tool surface. Provider is threaded into buildTools so Claude-only
// server-side tools (web_search) are gated correctly.
export function createClient(opts: {
  graphMode: boolean;
  model?: string;
  // Conversation id, threaded down to executeTool for per-conversation tool
  // limits (e.g. the Unsplash search cap). Undefined for unpersisted chats.
  sessionId?: string;
}): LlmClient {
  const provider = providerForModel(opts.model);
  const toolOpts = { ...opts, provider };
  switch (provider) {
    case "claude":
      return createClaudeClient(
        buildTools(toolOpts),
        buildSystemPrompt(opts),
        opts.model,
        opts.sessionId
      );
    case "google":
    case "deepseek":
    case "mistral":
      return createOpenAICompatClient(
        provider,
        buildTools(toolOpts),
        buildSystemPrompt(opts),
        // provider is non-undefined here, so the model resolved in the allowlist;
        // fall back to DEFAULT_MODEL only to satisfy the type (won't happen for
        // these cases, since DEFAULT_MODEL is a Claude model).
        opts.model ?? DEFAULT_MODEL,
        opts.sessionId
      );
    default:
      throw new Error(
        `No provider for model "${opts.model ?? DEFAULT_MODEL}" (not in the allowlist)`
      );
  }
}

// Test-only alias (see note by the factory setters above). Same function as
// `createClient`; a distinct export name so it survives a sibling test's
// process-global `mock.module("./llm")` override of `createClient`.
export const __createClientForTests = createClient;

// A dirt-cheap micro-agent that names a conversation in a few words from its first
// message. One-shot Haiku — no tools, no streaming, no agent loop — so it's the
// cheapest call we make, fired once per new session. Always uses Haiku regardless
// of the conversation's selected model (titling shouldn't burn Opus tokens). The
// caller treats this as best-effort: on any failure it returns null and the caller
// falls back to the truncated first message, so a bad key or rate limit never
// blocks the turn.
export async function generateTitle(
  firstMessage: string
): Promise<{ title: string; icon: string | null } | null> {
  const client = getAnthropicClient();
  if (!client) return null;
  try {
    // Forced tool_use: making `icon` a required, enum-constrained field is the only
    // reliable way to stop Haiku silently omitting it — a free-text JSON prompt left
    // it optional in practice, so ~85% of sessions came back icon-less (and there's
    // no icon fallback, unlike the title). tool_choice pins this single tool, so the
    // reply is always a structured tool_use block — no JSON.parse / fence-stripping.
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 128,
      tools: [
        {
          name: "name_conversation",
          description:
            "Record a concise title and the best-matching topic icon for a conversation.",
          input_schema: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description:
                  "Concise title, at most 5 words, capturing the topic. No end punctuation.",
              },
              icon: {
                type: "string",
                enum: [...ICON_VOCABULARY],
                description:
                  "The single best-matching icon for the topic. Always pick the closest fit from the list — never omit.",
              },
            },
            required: ["title", "icon"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "name_conversation" },
      messages: [{ role: "user", content: firstMessage }],
    });
    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const input = (call?.input ?? {}) as { title?: unknown; icon?: unknown };
    const cleaned =
      typeof input.title === "string"
        ? input.title.replace(/^["']|["']$/g, "").trim()
        : "";
    if (cleaned.length === 0) return null;
    // The schema `enum` is guidance, NOT enforcement — Haiku can still return a
    // name outside ICON_VOCABULARY (it has handed back "Cat", "Tv", "Balloon"...).
    // The frontend renders only vocabulary names, so anything off-list is dead on
    // arrival — drop it to null here and let the caller's lotus fallback show,
    // rather than persist an icon string that silently never renders.
    const raw = typeof input.icon === "string" ? input.icon.trim() : "";
    const icon = (ICON_VOCABULARY as readonly string[]).includes(raw)
      ? raw
      : null;
    return { title: cleaned.slice(0, 60), icon };
  } catch (err) {
    console.error("generateTitle failed:", err);
    return null;
  }
}
