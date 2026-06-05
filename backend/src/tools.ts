import type Anthropic from "@anthropic-ai/sdk";

export type ToolDefinition = Anthropic.Messages.Tool;

// Always-on tools, available regardless of mode.
export const BASE_TOOLS: ToolDefinition[] = [
  {
    name: "get_current_datetime",
    description:
      "Returns the current date and time in ISO 8601 format (UTC). Use when the user asks what time or date it is, or when you need the current date/time for any calculation.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

// Gated tool, offered only when Knowledge Graph mode is on. It carries structured
// entity/relationship data to the frontend over the existing tool_result SSE seam —
// the executor just echoes the input back, so the wire payload IS the graph data.
export const BUILD_KNOWLEDGE_GRAPH_TOOL: ToolDefinition = {
  name: "build_knowledge_graph",
  description:
    "Extract the key entities and relationships from the conversation so far and emit them as a knowledge graph. Call this whenever new entities or links emerge. Only send NEW or CHANGED entities/relationships each call — the frontend merges additively, never resets.",
  input_schema: {
    type: "object",
    properties: {
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "stable slug, e.g. 'marie-curie'",
            },
            label: { type: "string", description: "display name" },
            type: {
              type: "string",
              enum: ["person", "place", "concept", "org", "event"],
            },
            wikipediaTitle: {
              type: "string",
              description:
                "exact Wikipedia article title for summary lookup, if one exists",
            },
            icon: {
              type: "string",
              description:
                "Optional. The single best-matching lucide-react icon name in PascalCase that visually represents THIS specific entity — e.g. 'Atom' for a physicist, 'FlaskConical' for a chemist, 'Landmark' for a monument, 'Crown' for a monarch, 'BookOpen' for a novel, 'Rocket' for a space program. Pick the most evocative real lucide icon you know; if none fits well, omit it and a generic type icon is used.",
            },
          },
          required: ["id", "label", "type"],
        },
      },
      relationships: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from: { type: "string", description: "source entity id" },
            to: { type: "string", description: "target entity id" },
            label: {
              type: "string",
              description: "short relationship label, e.g. 'discovered'",
            },
          },
          required: ["from", "to"],
        },
      },
    },
    required: ["entities", "relationships"],
  },
};

// The tool list for a turn. Knowledge Graph mode adds the graph tool; everything
// else is always present.
export function buildTools(opts: { graphMode: boolean }): ToolDefinition[] {
  return opts.graphMode
    ? [...BASE_TOOLS, BUILD_KNOWLEDGE_GRAPH_TOOL]
    : BASE_TOOLS;
}

export function executeTool(name: string, input: unknown): string {
  switch (name) {
    case "get_current_datetime":
      return new Date().toISOString();
    case "build_knowledge_graph":
      // Echo the structured input straight back. This same string is both the
      // tool_result the frontend parses into the graph AND the result fed back to
      // Claude — fine, since it's a faithful record of what was emitted.
      return JSON.stringify(input);
    default:
      throw new Error(`Unknown tool: "${name}"`);
  }
}
