import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt";

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
    onDone: () => Promise<void>
  ): Promise<void>;
}

// A current, fast, inexpensive Claude model — good default for a first slice.
// Override with ANTHROPIC_MODEL; bump to an Opus model when quality matters more.
const DEFAULT_MODEL = "claude-sonnet-4-6";

function createClaudeClient(): LlmClient {
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

  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  function baseParams(messages: ChatMessage[]) {
    return {
      model,
      max_tokens: 1024,
      system: [
        {
          type: "text" as const,
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages,
    };
  }

  return {
    async complete(messages) {
      const response = await getClient().messages.create(baseParams(messages));

      // Concatenate every text block; ignore any non-text blocks (none yet, but
      // tool_use blocks would appear here once tools land).
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (!text) throw new Error("Model returned no text content");
      return text;
    },

    async stream(messages, onToken, onDone) {
      // for await ensures each onToken call is awaited before the next token
      // arrives — writeSSE errors surface instead of being silently dropped.
      for await (const event of getClient().messages.stream(
        baseParams(messages)
      )) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          await onToken(event.delta.text);
        }
      }
      await onDone();
    },
  };
}

// Factory keyed off LLM_PROVIDER. Defaults to Claude. Throws on an unknown
// provider rather than silently doing the wrong thing.
export function createClient(): LlmClient {
  const provider = process.env.LLM_PROVIDER ?? "claude";
  switch (provider) {
    case "claude":
      return createClaudeClient();
    default:
      throw new Error(
        `Unknown LLM_PROVIDER: "${provider}" (expected "claude")`
      );
  }
}
