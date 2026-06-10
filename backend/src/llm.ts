import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { DEFAULT_MODEL, type Provider, providerForModel } from "./models";
import { buildSystemPrompt } from "./prompt";
import {
  buildTools,
  executeTool,
  type ToolDefinition,
  toOpenAITools,
} from "./tools";

// The LLM connector — a Platform seam. The route calls `createClient().complete()`
// and never names a provider. The factory picks the client from the chosen model's
// provider (see ./models): Claude → the Anthropic SDK; Google / DeepSeek / Mistral
// → one shared OpenAI-compatible client (they all speak /chat/completions).

// One message in the conversation, as the connector sees it. This is the wire
// shape the frontend sends — independent of any provider's SDK types.
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmClient {
  complete(messages: ChatMessage[]): Promise<string>;
  stream(
    messages: ChatMessage[],
    onToken: (token: string) => Promise<void>,
    onDone: () => Promise<void>,
    onToolStart?: (name: string, input: unknown) => Promise<void>,
    onToolResult?: (name: string, result: string) => Promise<void>,
    // Fired at the top of the agent loop for the second iteration onward — i.e.
    // each time tool results are fed back and the model is called again. Lets the
    // frontend visualise the loop re-entering. Iteration 1 is implied by the
    // request itself, so it is not signalled here.
    onLoopStart?: (iteration: number) => Promise<void>
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
  const maxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS) || 4096;

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
      const apiMessages: ApiMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
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
      onLoopStart
    ) {
      // The agent loop: call the API, handle tool_use if the model requests it,
      // feed results back, and repeat until the model produces a terminal response.
      const history: ApiMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Counts trips through the loop. Iteration 1 is the initial call; every
      // increment past that means tool results were fed back and we're calling
      // the model again.
      let iteration = 0;

      // Per-turn token totals across every loop iteration. The point of logging
      // these is to make prompt caching *visible*: on iteration 1 the prefix is
      // written to cache (cacheCreation > 0); on iterations 2+ the growing prefix
      // should be read from cache (cacheRead large, cacheCreation ~0). A healthy
      // read/creation ratio is the proof the cache breakpoints are paying off.
      let turnInput = 0;
      let turnOutput = 0;
      let turnCacheRead = 0;
      let turnCacheCreation = 0;

      while (true) {
        iteration++;
        if (iteration > 1) await onLoopStart?.(iteration);

        // On the final allowed iteration, call without tools so the model must
        // answer in text — the loop closes cleanly instead of requesting another
        // tool it can't run. (Equality, not >: the previous iteration's tool
        // results are already in history, so this call produces the final reply.)
        const atCap = iteration >= MAX_ITERATIONS;

        // Per-turn accumulators — reset each iteration.
        const pendingTools = new Map<
          number,
          { id: string; name: string; inputChunks: string[] }
        >();
        const textBlocks: { type: "text"; text: string }[] = [];
        let currentText = "";
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
              await onToken(event.delta.text);
              currentText += event.delta.text;
            } else if (event.delta.type === "input_json_delta") {
              // Accumulate partial JSON — parse only when the block is complete.
              pendingTools
                .get(event.index)
                ?.inputChunks.push(event.delta.partial_json);
            }
          } else if (event.type === "content_block_stop") {
            if (currentText) {
              textBlocks.push({ type: "text", text: currentText });
              currentText = "";
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

        // Truncated by the output budget. Any pending tool_use JSON is partial
        // and unparseable — don't try to parse it (that would throw and kill the
        // turn silently). Fail loudly so the cause is visible, not a frozen UI.
        if (stopReason === "max_tokens") {
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

        // Execute each tool and collect results.
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
        for (const [, tool] of pendingTools) {
          const input = JSON.parse(
            tool.inputChunks.join("") || "{}"
          ) as unknown;
          await onToolStart?.(tool.name, input);
          const result = await executeTool(tool.name, input, sessionId);
          await onToolResult?.(tool.name, result);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: result,
          });
        }

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
      onLoopStart
    ) {
      // The agent loop — identical control flow to the Claude client, parsing
      // OpenAI chunk deltas instead of Anthropic stream events.
      const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
        messages.map((m) => ({ role: m.role, content: m.content }));

      let iteration = 0;

      while (true) {
        iteration++;
        if (iteration > 1) await onLoopStart?.(iteration);

        // Final allowed iteration: send no tools so the model must answer in text
        // and the loop closes cleanly (the cap). Mirrors the Claude client.
        const atCap = iteration >= MAX_ITERATIONS;

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
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                argChunks: tc.function?.arguments
                  ? [tc.function.arguments]
                  : [],
                thoughtSignature: sig,
              });
            }
          }

          if (choice.finish_reason) finishReason = choice.finish_reason;
        }

        // Output budget exhausted — mirrors the Claude client's max_tokens guard.
        // Any pending tool JSON is partial; fail loudly rather than parse garbage.
        if (finishReason === "length") {
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

        for (const tool of sortedTools) {
          const input = JSON.parse(tool.argChunks.join("") || "{}") as unknown;
          await onToolStart?.(tool.name, input);
          const result = await executeTool(tool.name, input, sessionId);
          await onToolResult?.(tool.name, result);
          history.push({
            role: "tool",
            tool_call_id: tool.id,
            content: result,
          });
        }
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
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 32,
      system:
        "You name conversations. Given the user's first message, reply with a " +
        "concise title of at most 5 words that captures its topic. No quotes, no " +
        "punctuation at the end, no preamble — just the title.",
      messages: [{ role: "user", content: firstMessage }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    // Strip stray wrapping quotes the model sometimes adds, and bound the length
    // so a runaway reply can't become an oversized title.
    const cleaned = text.replace(/^["']|["']$/g, "").trim();
    return cleaned.length > 0 ? cleaned.slice(0, 60) : null;
  } catch (err) {
    console.error("generateTitle failed:", err);
    return null;
  }
}
