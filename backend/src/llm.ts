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

export interface LlmClient {
  complete(messages: ChatMessage[]): Promise<string>;
  stream(
    messages: ChatMessage[],
    onToken: (token: string) => Promise<void>,
    onDone: () => Promise<void>,
    onToolStart?: (name: string, input: unknown) => Promise<void>,
    onToolResult?: (name: string, result: string) => Promise<void>,
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
    ) => Promise<void>,
    // Fired at the top of the agent loop for the second iteration onward — i.e.
    // each time tool results are fed back and the model is called again. Lets the
    // frontend visualise the loop re-entering. Iteration 1 is implied by the
    // request itself, so it is not signalled here.
    onLoopStart?: (iteration: number) => Promise<void>,
    // Display-only status blurb for the activity indicator, fired at points the
    // loop would otherwise be silent (before the first call, on loop re-entry,
    // while wrapping up). Cosmetic — it carries no tool semantics and is
    // superseded the moment a token / tool_start / tool_result arrives.
    onStatus?: (message: string) => Promise<void>,
    // Fired once, pre-loop, when the planner produces an abstract composition plan
    // for this turn (complex turns only). Carries WHICH capabilities + how they
    // relate — never coordinates. The host forwards it as the `plan` SSE event;
    // Bigsail consumes it. Absent on simple turns (the planner is gated).
    onPlan?: (plan: CompositionPlan) => Promise<void>,
    // Fired once, pre-loop, when the planner decides the turn is thin-but-explodable
    // and asks ONE clarifying question INSTEAD of composing. When this fires, the
    // turn ends WITHOUT entering the agent loop: the question streams as the
    // assistant's text (via onToken) and the host forwards `clarify` as an SSE so
    // the frontend can render tappable options. Mutually exclusive with onPlan.
    onClarify?: (clarify: ClarifyResult) => Promise<void>,
    // True when this turn is the answer to a prior clarifier — threaded into the
    // planner so it won't clarify again (no interrogation loops).
    clarified?: boolean
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
    if (messages[i]!.role === "user") {
      lastUserIdx = i;
      break;
    }
  }
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
      anthropic = new Anthropic({ apiKey });
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

    async stream(
      messages,
      onToken,
      onDone,
      onToolStart,
      onToolResult,
      onToolPartial,
      onLoopStart,
      onStatus,
      onPlan,
      onClarify,
      clarified
    ) {
      // The agent loop: call the API, handle tool_use if the model requests it,
      // feed results back, and repeat until the model produces a terminal response.
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

      // Counts trips through the loop. Iteration 1 is the initial call; every
      // increment past that means tool results were fed back and we're calling
      // the model again.
      let iteration = 0;

      // In-loop self-correction counter for this turn (see MAX_CORRECTIONS).
      let correctionCount = 0;

      // Per-turn token totals across every loop iteration. The point of logging
      // these is to make prompt caching *visible*: on iteration 1 the prefix is
      // written to cache (cacheCreation > 0); on iterations 2+ the growing prefix
      // should be read from cache (cacheRead large, cacheCreation ~0). A healthy
      // read/creation ratio is the proof the cache breakpoints are paying off.
      let turnInput = 0;
      let turnOutput = 0;
      let turnCacheRead = 0;
      let turnCacheCreation = 0;

      // Whether any prior iteration streamed assistant text this turn. The frontend
      // appends every text token raw (m.text + content), so when iteration 1 ends
      // "…all sources at once." and iteration 2 opens "Now let me…", they collide as
      // "…at once.Now let me…". When a later iteration emits its FIRST text token and
      // a previous one already did, we prefix a paragraph break so the thoughts read
      // as separate. Within a single iteration tokens still concatenate untouched.
      let turnEmittedText = false;

      while (true) {
        iteration++;
        // On the final allowed iteration, call without tools so the model must
        // answer in text — the loop closes cleanly instead of requesting another
        // tool it can't run. (Equality, not >: the previous iteration's tool
        // results are already in history, so this call produces the final reply.)
        const atCap = iteration >= MAX_ITERATIONS;
        await emitIterationStatus(iteration, atCap, onLoopStart, onStatus);

        // Per-turn accumulators — reset each iteration. `lastPartialAt` throttles
        // the onToolPartial stream (one SSE frame per ~120ms per tool, not one per
        // token); `streamable` caches the STREAMABLE_RENDER_TOOLS check per block.
        const pendingTools = new Map<
          number,
          {
            id: string;
            name: string;
            inputChunks: string[];
            streamable: boolean;
            lastPartialAt: number;
          }
        >();
        const textBlocks: { type: "text"; text: string }[] = [];
        let currentText = "";
        // First text token of THIS iteration not yet streamed. Used once, to insert
        // a separator before iteration 2+ text that follows earlier iterations' text.
        let iterationTextStarted = false;
        let stopReason: string | null = null;
        // Usage for THIS iteration. message_start carries the input-side counts
        // (including cache_read/cache_creation); message_delta carries the final
        // output token count. We read both off the stream rather than discarding
        // the SDK's usage metadata.
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let cacheCreationTokens = 0;

        // for await ensures each onToken call is awaited before the next token
        // arrives — writeSSE errors surface instead of being silently dropped.
        for await (const event of getClient().messages.stream(
          apiParams(history, atCap)
        )) {
          if (event.type === "message_start") {
            // Input-side usage is final at message_start: prompt tokens plus the
            // cache split (read vs. creation). Output is still 0 here — it lands
            // in message_delta below.
            const u = event.message.usage;
            inputTokens = u.input_tokens ?? 0;
            cacheReadTokens = u.cache_read_input_tokens ?? 0;
            cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
          } else if (event.type === "content_block_start") {
            if (event.content_block.type === "tool_use") {
              pendingTools.set(event.index, {
                id: event.content_block.id,
                name: event.content_block.name,
                inputChunks: [],
                streamable: STREAMABLE_RENDER_TOOLS.has(
                  event.content_block.name
                ),
                lastPartialAt: 0,
              });
            } else if (event.content_block.type === "server_tool_use") {
              // Server-side tool starting (e.g. web_search) — fire onToolStart so
              // the UI shows the activity indicator. No host-side execution needed.
              await onToolStart?.(event.content_block.name, {});
            } else if (event.content_block.type === "web_search_tool_result") {
              // Web search completed — fire onToolResult so the UI clears the
              // activity indicator. The result is handled server-side by Anthropic.
              await onToolResult?.(
                "web_search",
                JSON.stringify(event.content_block.content)
              );
            } else if (event.content_block.type === "text") {
              currentText = "";
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              // Separate this iteration's text from a previous iteration's: prefix a
              // paragraph break on the FIRST text token here if earlier text exists
              // and this one doesn't already start with whitespace. Streamed to the
              // client and kept in currentText so history matches what the user saw.
              if (
                !iterationTextStarted &&
                turnEmittedText &&
                !/^\s/.test(event.delta.text)
              ) {
                await onToken("\n\n");
                currentText += "\n\n";
              }
              iterationTextStarted = true;
              turnEmittedText = true;
              await onToken(event.delta.text);
              currentText += event.delta.text;
            } else if (event.delta.type === "input_json_delta") {
              // Accumulate partial JSON. For a streamable render tool, also forward
              // the snapshot-so-far (throttled) so the widget paints as it streams.
              // We parse only when the block is complete (below / after the loop).
              const t = pendingTools.get(event.index);
              if (t) {
                t.inputChunks.push(event.delta.partial_json);
                if (t.streamable && onToolPartial) {
                  const now = Date.now();
                  const snapshot = t.inputChunks.join("");
                  // Skip empty snapshots (the very first delta can fire before any
                  // JSON has accumulated) — nothing to paint from "".
                  if (snapshot && now - t.lastPartialAt >= 120) {
                    t.lastPartialAt = now;
                    await onToolPartial(t.name, snapshot, false);
                  }
                }
              }
            }
          } else if (event.type === "content_block_stop") {
            if (currentText) {
              textBlocks.push({ type: "text", text: currentText });
              currentText = "";
            }
            // Final partial for a streamable tool: the full, now-complete input.
            // (The authoritative onToolResult still fires post-execute below.)
            const done = pendingTools.get(event.index);
            if (done?.streamable && onToolPartial) {
              await onToolPartial(done.name, done.inputChunks.join(""), true);
            }
          } else if (event.type === "message_delta") {
            stopReason = event.delta.stop_reason ?? null;
            // Output token count is cumulative-final on message_delta.
            outputTokens = event.usage.output_tokens ?? 0;
          }
        }

        // Roll this iteration into the per-turn totals and log it. cacheRead high
        // with cacheCreation ~0 on iterations 2+ is the cache working across the
        // agent loop; iteration 1 is where the prefix gets written (creation > 0).
        turnInput += inputTokens;
        turnOutput += outputTokens;
        turnCacheRead += cacheReadTokens;
        turnCacheCreation += cacheCreationTokens;
        console.log(
          `[usage] iter=${iteration} model=${model} input=${inputTokens} output=${outputTokens} cache_read=${cacheReadTokens} cache_creation=${cacheCreationTokens}`
        );

        // Truncated by the output budget. The pending tool_use JSON is partial.
        // Rather than throw away the whole turn, try to SALVAGE: if a streamable
        // render tool's partial input can be best-effort closed and parsed, emit it
        // as a final tool_partial so the widget keeps what streamed, and finish the
        // turn with a soft status instead of the hard red error. Only throw when
        // there's nothing salvageable at all (e.g. truncated plain text, no widget).
        if (stopReason === "max_tokens") {
          console.warn(
            `[max_tokens] iter=${iteration} truncated; attempting salvage of ${pendingTools.size} pending tool(s)`
          );
          let salvaged = false;
          for (const [, tool] of pendingTools) {
            if (!tool.streamable) continue;
            const closed = closeTruncatedJson(tool.inputChunks.join(""));
            if (parseBestEffort(closed) === undefined) continue;
            // Parsing isn't enough: closeTruncatedJson happily turns `{"rows":[`
            // into a valid-but-EMPTY `{"rows":[]}`. Emitting that would show a
            // blank widget under a "showing what came through" status — worse than
            // the honest error. Only count a salvage that retained real content
            // (reusing the same degeneracy test the self-correction loop uses).
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
            "The model hit its output limit before finishing (stop_reason=max_tokens). " +
              "Raise ANTHROPIC_MAX_TOKENS or ask for a smaller result."
          );
        }

        // No tool calls — stream is complete. Log the per-turn totals: the
        // read/creation ratio across all iterations is the cache's bottom line.
        if (stopReason !== "tool_use" || pendingTools.size === 0) {
          console.log(
            `[usage] turn total: iterations=${iteration} input=${turnInput} output=${turnOutput} cache_read=${turnCacheRead} cache_creation=${turnCacheCreation}`
          );
          await onDone();
          return;
        }

        // Build the assistant message with all content blocks for history.
        // Must include both text blocks (if any) and tool_use blocks.
        const assistantContent: Anthropic.Messages.ContentBlockParam[] = [
          ...textBlocks,
          ...Array.from(pendingTools.values()).map((t) => ({
            type: "tool_use" as const,
            id: t.id,
            name: t.name,
            input: JSON.parse(t.inputChunks.join("") || "{}"),
          })),
        ];
        history.push({ role: "assistant", content: assistantContent });

        // Execute each tool and collect results (in input order, preserved by the
        // Map's insertion order).
        const executed: { id: string; name: string; result: string }[] = [];
        for (const [, tool] of pendingTools) {
          const input = JSON.parse(
            tool.inputChunks.join("") || "{}"
          ) as unknown;
          await onToolStart?.(tool.name, input);
          const result = await executeTool(tool.name, input, sessionId);
          await onToolResult?.(tool.name, result);
          // Honest "got N results…" status, superseding the frontend's scripted
          // progress with a real count the instant the fetch resolves (data tools
          // only; null/skipped otherwise).
          const countStatus = toolResultStatus(tool.name, result);
          if (countStatus) await onStatus?.(countStatus);
          executed.push({ id: tool.id, name: tool.name, result });
        }

        // Self-correction across the whole batch (see applySelfCorrection): one
        // correction pass per turn, but it heals EVERY degenerate result in the
        // batch, not just the first by tool order.
        const { modelResults, consumedCorrection } = applySelfCorrection(
          executed,
          correctionCount,
          iteration
        );
        if (consumedCorrection) correctionCount++;

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] =
          executed.map((t, i) => ({
            type: "tool_result",
            tool_use_id: t.id,
            content: modelResults[i] as string,
          }));

        history.push({ role: "user", content: toolResults });
        // Continue the loop — call the API again with updated history.
      }
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
      openai = new OpenAI({ apiKey, baseURL: cfg.baseURL });
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

    async stream(
      messages,
      onToken,
      onDone,
      onToolStart,
      onToolResult,
      onToolPartial,
      onLoopStart,
      onStatus,
      onPlan,
      onClarify,
      clarified
    ) {
      // The agent loop — identical control flow to the Claude client, parsing
      // OpenAI chunk deltas instead of Anthropic stream events.
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

      let iteration = 0;
      // In-loop self-correction counter for this turn (see MAX_CORRECTIONS).
      let correctionCount = 0;
      // See the Claude client: separates iteration 2+ text from earlier iterations'
      // text so "…at once." + "Now let me…" don't collide into "…at once.Now let me…".
      let turnEmittedText = false;

      while (true) {
        iteration++;
        // Final allowed iteration: send no tools so the model must answer in text
        // and the loop closes cleanly (the cap). Mirrors the Claude client.
        const atCap = iteration >= MAX_ITERATIONS;
        await emitIterationStatus(iteration, atCap, onLoopStart, onStatus);

        // Per-turn accumulators. Tool calls arrive as deltas keyed by index; we
        // collect id/name/argument-fragments until the chunk stream ends, then
        // parse the assembled JSON (partial JSON mid-stream is unparseable). We
        // also capture Gemini's per-tool-call `thought_signature` (carried in a
        // non-standard `extra_content.google` field) so it can be echoed back in
        // the assistant message — Gemini needs it for multi-turn continuity.
        const pendingTools = new Map<
          number,
          {
            id: string;
            name: string;
            argChunks: string[];
            thoughtSignature?: string;
            streamable: boolean;
            lastPartialAt: number;
          }
        >();
        let assistantText = "";
        let finishReason: string | null = null;

        const stream = await getClient().chat.completions.create({
          model: selectedModel,
          max_tokens: maxTokens,
          stream: true,
          messages: toApiMessages(history),
          ...(openaiTools && !atCap ? { tools: openaiTools } : {}),
        });

        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          if (!choice) continue;
          const delta = choice.delta;

          if (delta?.content) {
            // First text of this iteration following earlier iterations' text: insert
            // a paragraph break unless it already opens with whitespace (mirrors the
            // Claude client). Kept in assistantText so history matches the stream.
            if (
              assistantText === "" &&
              turnEmittedText &&
              !/^\s/.test(delta.content)
            ) {
              await onToken("\n\n");
              assistantText += "\n\n";
            }
            turnEmittedText = true;
            await onToken(delta.content);
            assistantText += delta.content;
          }

          // Tool-call fragments. The first delta for an index carries id + name;
          // subsequent ones carry argument string fragments to concatenate.
          for (const tc of delta?.tool_calls ?? []) {
            const sig = (
              tc as {
                extra_content?: { google?: { thought_signature?: string } };
              }
            ).extra_content?.google?.thought_signature;
            const existing = pendingTools.get(tc.index);
            if (existing) {
              if (tc.function?.arguments)
                existing.argChunks.push(tc.function.arguments);
              if (sig) existing.thoughtSignature = sig;
            } else {
              pendingTools.set(tc.index, {
                // The id ties the assistant `tool_calls[].id` to its `tool`
                // result's `tool_call_id`. OpenAI/DeepSeek/Mistral always send a
                // non-empty id, but Gemini's OpenAI-compat endpoint can omit it —
                // and two calls both defaulting to "" become indistinguishable on
                // the wire (the provider can't tell which result answers which
                // call → 400 / mis-bind). Synthesize a unique, stable id from the
                // call's index when absent; it flows to both the assistant entry
                // and the result entry below, keeping the pair tied together.
                id: tc.id || `call_${tc.index}`,
                name: tc.function?.name ?? "",
                argChunks: tc.function?.arguments
                  ? [tc.function.arguments]
                  : [],
                thoughtSignature: sig,
                streamable: STREAMABLE_RENDER_TOOLS.has(
                  tc.function?.name ?? ""
                ),
                lastPartialAt: 0,
              });
            }
            // Forward the growing render-tool spec (throttled) so the widget paints
            // as it streams — same as the Claude client. OpenAI has no per-tool stop
            // event, so the final (isComplete) partial is emitted post-loop below.
            const t = pendingTools.get(tc.index);
            if (t?.streamable && onToolPartial) {
              const now = Date.now();
              if (now - t.lastPartialAt >= 120) {
                t.lastPartialAt = now;
                await onToolPartial(t.name, t.argChunks.join(""), false);
              }
            }
          }

          if (choice.finish_reason) finishReason = choice.finish_reason;
        }

        // Output budget exhausted — mirrors the Claude client's max_tokens guard,
        // including the salvage path: best-effort close any streamable render tool's
        // partial input and keep what streamed instead of throwing the whole turn.
        if (finishReason === "length") {
          let salvaged = false;
          for (const [, tool] of pendingTools) {
            if (!tool.streamable) continue;
            const closed = closeTruncatedJson(tool.argChunks.join(""));
            if (parseBestEffort(closed) === undefined) continue;
            // Parsing isn't enough: closeTruncatedJson happily turns `{"rows":[`
            // into a valid-but-EMPTY `{"rows":[]}`. Emitting that would show a
            // blank widget under a "showing what came through" status — worse than
            // the honest error. Only count a salvage that retained real content
            // (reusing the same degeneracy test the self-correction loop uses).
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
            "The model hit its output limit before finishing (finish_reason=length). " +
              "Raise LLM_MAX_TOKENS or ask for a smaller result."
          );
        }

        // Gemini surfaces a failed tool call as this finish_reason rather than an
        // error — make it visible instead of returning a confusing empty turn.
        if (finishReason === "MALFORMED_FUNCTION_CALL") {
          throw new Error(
            "The model produced a malformed tool call (finish_reason=MALFORMED_FUNCTION_CALL)."
          );
        }

        // Loop when there are tool calls to run — keyed on the presence of pending
        // tool calls, NOT on finish_reason. Gemini's OpenAI-compatible endpoint has
        // a known bug where it reports finish_reason "stop" (not "tool_calls") even
        // while emitting a tool call in streaming mode; trusting finish_reason would
        // drop the call and end the turn empty. (OpenAI/DeepSeek/Mistral report
        // "tool_calls" correctly; checking pendingTools works for all of them.)
        if (pendingTools.size === 0) {
          await onDone();
          return;
        }

        // Push the assistant message carrying the tool_calls, then one `tool`
        // message per result (OpenAI uses N separate tool messages, vs Anthropic's
        // single user message with N tool_result blocks). Re-attach Gemini's
        // thought_signature on each call so multi-turn continuity is preserved.
        const sortedTools = [...pendingTools.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, t]) => t);

        history.push({
          role: "assistant",
          content: assistantText || null,
          tool_calls: sortedTools.map((t) => ({
            id: t.id,
            type: "function",
            function: { name: t.name, arguments: t.argChunks.join("") || "{}" },
            ...(t.thoughtSignature
              ? {
                  extra_content: {
                    google: { thought_signature: t.thoughtSignature },
                  },
                }
              : {}),
          })),
        });

        // Final (complete) partial for each streamable tool — the analogue of the
        // Claude client's content_block_stop emit. OpenAI gives no per-tool stop, so
        // we do it here once the full arg stream is assembled.
        for (const tool of sortedTools) {
          if (tool.streamable && onToolPartial)
            await onToolPartial(tool.name, tool.argChunks.join(""), true);
        }

        const executed: { id: string; name: string; result: string }[] = [];
        for (const tool of sortedTools) {
          const input = JSON.parse(tool.argChunks.join("") || "{}") as unknown;
          await onToolStart?.(tool.name, input);
          const result = await executeTool(tool.name, input, sessionId);
          await onToolResult?.(tool.name, result);
          // Honest count status, same as the Claude client.
          const countStatus = toolResultStatus(tool.name, result);
          if (countStatus) await onStatus?.(countStatus);
          executed.push({ id: tool.id, name: tool.name, result });
        }

        // Self-correction across the whole batch, same as the Claude client (see
        // applySelfCorrection for rationale).
        const { modelResults, consumedCorrection } = applySelfCorrection(
          executed,
          correctionCount,
          iteration
        );
        if (consumedCorrection) correctionCount++;

        executed.forEach((t, i) => {
          history.push({
            role: "tool",
            tool_call_id: t.id,
            content: modelResults[i] as string,
          });
        });
        // Continue the loop — call the API again with the updated history.
      }
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
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 64,
      system:
        "You name conversations. Given the user's first message, reply with ONLY " +
        'a JSON object: {"title": <concise title, at most 5 words, capturing the ' +
        'topic, no end punctuation>, "icon": <the single best-matching icon for the ' +
        "topic, chosen ONLY from this list: " +
        ICON_VOCABULARY.join(", ") +
        ">}. Pick the closest fit from that list — do not invent names outside it. " +
        "No preamble, no code fences — just the JSON.",
      messages: [{ role: "user", content: firstMessage }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    // Parse the JSON object; strip any stray code fences first. Best-effort —
    // a malformed reply falls through to the caller's truncated-message fallback.
    const jsonText = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(jsonText) as { title?: unknown; icon?: unknown };
    const rawTitle = typeof parsed.title === "string" ? parsed.title : "";
    const cleaned = rawTitle.replace(/^["']|["']$/g, "").trim();
    if (cleaned.length === 0) return null;
    const icon =
      typeof parsed.icon === "string" && parsed.icon.trim().length > 0
        ? parsed.icon.trim().slice(0, 40)
        : null;
    return { title: cleaned.slice(0, 60), icon };
  } catch (err) {
    console.error("generateTitle failed:", err);
    return null;
  }
}
