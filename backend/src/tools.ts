import type Anthropic from "@anthropic-ai/sdk";

export type ToolDefinition = Anthropic.Messages.Tool;

export const TOOLS: ToolDefinition[] = [
  {
    name: "get_current_datetime",
    description:
      "Returns the current date and time in ISO 8601 format (UTC). Use when the user asks what time or date it is, or when you need the current date/time for any calculation.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

export function executeTool(name: string, _input: unknown): string {
  switch (name) {
    case "get_current_datetime":
      return new Date().toISOString();
    default:
      throw new Error(`Unknown tool: "${name}"`);
  }
}
