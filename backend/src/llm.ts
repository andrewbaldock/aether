import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "./models";
import { buildSystemPrompt } from "./prompt";
import { buildTools, executeTool, type ToolDefinition } from "./tools";

// The LLM connector — a Platform seam. The route calls `createClient().complete()`
// and never names a provider. Swapping Claude for Gemini/Ollama later means adding
// a branch here, not touching the route. (Per LLM_PROVIDER; Claude is the only one
// implemented for now.)

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

function createClaudeClient(
  tools: ToolDefinition[],
  systemPrompt: string,
  selectedModel?: string
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

  function apiParams(messages: ApiMessage[]) {
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
      ...(cachedTools.length > 0 ? { tools: cachedTools } : {}),
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

      while (true) {
        iteration++;
        if (iteration > 1) await onLoopStart?.(iteration);

        // Per-turn accumulators — reset each iteration.
        const pendingTools = new Map<
          number,
          { id: string; name: string; inputChunks: string[] }
        >();
        const textBlocks: { type: "text"; text: string }[] = [];
        let currentText = "";
        let stopReason: string | null = null;

        // for await ensures each onToken call is awaited before the next token
        // arrives — writeSSE errors surface instead of being silently dropped.
        for await (const event of getClient().messages.stream(
          apiParams(history)
        )) {
          if (event.type === "content_block_start") {
            if (event.content_block.type === "tool_use") {
              pendingTools.set(event.index, {
                id: event.content_block.id,
                name: event.content_block.name,
                inputChunks: [],
              });
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
          }
        }

        // Truncated by the output budget. Any pending tool_use JSON is partial
        // and unparseable — don't try to parse it (that would throw and kill the
        // turn silently). Fail loudly so the cause is visible, not a frozen UI.
        if (stopReason === "max_tokens") {
          throw new Error(
            "The model hit its output limit before finishing (stop_reason=max_tokens). " +
              "Raise ANTHROPIC_MAX_TOKENS or ask for a smaller result."
          );
        }

        // No tool calls — stream is complete.
        if (stopReason !== "tool_use" || pendingTools.size === 0) {
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
          const result = executeTool(tool.name, input);
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

// Factory keyed off LLM_PROVIDER. Defaults to Claude. Throws on an unknown
// provider rather than silently doing the wrong thing. `graphMode` gates the
// Knowledge Graph tool + its prompt guidance — called per request, so each turn
// gets exactly the right tool surface.
export function createClient(opts: {
  graphMode: boolean;
  model?: string;
}): LlmClient {
  const provider = process.env.LLM_PROVIDER ?? "claude";
  switch (provider) {
    case "claude":
      return createClaudeClient(
        buildTools(opts),
        buildSystemPrompt(opts),
        opts.model
      );
    default:
      throw new Error(
        `Unknown LLM_PROVIDER: "${provider}" (expected "claude")`
      );
  }
}
