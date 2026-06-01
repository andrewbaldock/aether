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
  // Send the full conversation, get the assistant's text reply. Non-streaming
  // for now — streaming is a later commit.
  complete(messages: ChatMessage[]): Promise<string>;
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

  return {
    async complete(messages) {
      const response = await getClient().messages.create({
        model,
        max_tokens: 1024,
        // System prompt as a content block with cache_control so the (stable)
        // prefix is cached across turns — cheaper and faster as it grows.
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
      });

      // Concatenate every text block; ignore any non-text blocks (none yet, but
      // tool_use blocks would appear here once tools land).
      // Note: stop_reason "max_tokens" means the reply was truncated — visible as
      // a sentence cut off mid-word. Raise max_tokens or stream (Commit 4) to fix.
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (!text) throw new Error("Model returned no text content");
      return text;
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
