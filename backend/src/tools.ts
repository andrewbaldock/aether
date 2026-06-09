import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";

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

// A closed vocabulary of real lucide-react icon names (PascalCase) the model may
// choose from for a node. Left open-ended, the model confidently invents
// plausible-but-nonexistent names (e.g. "VinylRecord", "MicrophoneStand"), which
// the frontend then has to discard. Constraining it to this curated set — every
// name verified to exist in lucide — means almost every suggestion resolves to a
// real icon. Spread across the entity types (person/place/org/event/concept) and
// common subjects (science, arts, music, tech, nature, history). Extend freely,
// but only with names confirmed to exist in lucide-react.
export const ICON_VOCABULARY = [
  // People / roles
  "User",
  "Users",
  "Crown",
  "Drama",
  "Mic",
  "Music",
  "Brush",
  "Palette",
  "PenTool",
  "Camera",
  "Film",
  "Gavel",
  "GraduationCap",
  "Stethoscope",
  // Science / ideas
  "Atom",
  "FlaskConical",
  "Microscope",
  "Dna",
  "Brain",
  "Lightbulb",
  "Calculator",
  "Sigma",
  "Telescope",
  "Orbit",
  "Rocket",
  // Places / structures
  "MapPin",
  "Landmark",
  "Building2",
  "Church",
  "Castle",
  "Mountain",
  "TreePine",
  "Globe",
  "Waves",
  "Tent",
  // Orgs / things
  "Briefcase",
  "Factory",
  "Cpu",
  "CircuitBoard",
  "Server",
  "Cog",
  "Banknote",
  "ShoppingBag",
  // Works / media / events
  "BookOpen",
  "Newspaper",
  "Scroll",
  "Trophy",
  "Medal",
  "Flag",
  "Calendar",
  "Swords",
  "Sword",
  "Star",
  "Heart",
  "Zap",
] as const;

// Gated tool, offered only when Knowledge Graph mode is on. It carries structured
// entity/relationship data to the frontend over the existing tool_result SSE seam —
// the executor just echoes the input back, so the wire payload IS the graph data.
export const BUILD_KNOWLEDGE_GRAPH_TOOL: ToolDefinition = {
  name: "build_knowledge_graph",
  description:
    "Extract the key entities and relationships from the conversation so far and emit them as a knowledge graph. Call this whenever new entities or links emerge. Only send NEW or CHANGED entities/relationships each call — the frontend merges additively, never resets. AVOID DUPLICATES: an entity already in the graph must keep the EXACT same id you first gave it — never coin a second slug for the same thing. Before adding an entity, assume it may already exist and reuse its id. If two nodes for the same real-world thing do slip in, use `merge` to collapse them. Use `remove` to delete nodes and their links.",
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
              description:
                "A stable, canonical slug from the entity's COMMON name: lowercase ASCII, hyphen-separated, no articles/titles/honorifics. Use the shortest name people normally use — 'marie-curie' (not 'marie-sklodowska-curie'), 'louvre' (not 'the-louvre-museum'), 'us-army'. Reuse the EXACT same id every time you reference this entity again; never invent a new slug for an entity already in the graph.",
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
              enum: [...ICON_VOCABULARY],
              description:
                "Optional. The single best-matching icon for THIS specific entity, chosen ONLY from the allowed list — e.g. 'Atom' for a physicist, 'FlaskConical' for a chemist, 'Landmark' for a monument, 'Crown' for a monarch, 'BookOpen' for a novel, 'Rocket' for a space program. Do NOT invent icon names outside the list. If none fits well, omit this field and a generic type icon is used.",
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
      remove: {
        type: "array",
        items: { type: "string" },
        description:
          "ids of entities to remove from the graph (and their links)",
      },
      merge: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from: {
              type: "string",
              description: "id of the node to absorb (will be removed)",
            },
            into: {
              type: "string",
              description: "id of the node to keep (all links re-pointed here)",
            },
          },
          required: ["from", "into"],
        },
        description:
          "collapse duplicate nodes — re-points all links from `from` to `into`, then removes `from`",
      },
    },
    required: ["entities", "relationships"],
  },
};

// --- Render tools ----------------------------------------------------------
// Always-on tools that emit a self-contained render spec the frontend draws as a
// widget. Each echoes its input straight back (executeTool below), so the wire
// payload IS the spec — same seam as build_knowledge_graph, but each call carries
// a complete spec (no additive merge on the frontend). Schemas are kept TERSE:
// they live in the cached tool prefix, so brevity keeps the cache write small and
// the model's output compact.

export const RENDER_TABLE_TOOL: ToolDefinition = {
  name: "render_table",
  description:
    "Render data as a sortable table beside the chat. Call when an answer is naturally tabular (comparisons, lists with attributes, structured records). Keep it compact.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "optional table title" },
      columns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "row field name" },
            label: { type: "string", description: "column header" },
            type: { type: "string", enum: ["text", "number", "date"] },
          },
          required: ["key", "label"],
        },
      },
      rows: {
        type: "array",
        items: { type: "object" },
        description: "one object per row, keyed by column key",
      },
    },
    required: ["columns", "rows"],
  },
};

export const RENDER_CHART_TOOL: ToolDefinition = {
  name: "render_chart",
  description:
    "Render data as a chart beside the chat. Call when an answer is naturally quantitative (trends, distributions, comparisons over a dimension). Keep series and data compact.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "optional chart title" },
      type: { type: "string", enum: ["line", "bar", "area", "pie"] },
      data: {
        type: "array",
        items: { type: "object" },
        description: "one object per data point, keyed by xKey and series keys",
      },
      xKey: {
        type: "string",
        description: "field name for the x-axis / category",
      },
      series: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "data field to plot" },
            label: { type: "string" },
            color: { type: "string", description: "optional hex color" },
          },
          required: ["key"],
        },
      },
    },
    required: ["type", "data", "xKey", "series"],
  },
};

// NOT YET WIRED: the timeline widget (frontend) isn't built, so this tool is
// kept defined but deliberately left OUT of RENDER_TOOLS below — advertising it
// would let the model emit a render_timeline call that nothing renders. Add it
// back to RENDER_TOOLS when the Timeline widget lands (commit 6).
export const RENDER_TIMELINE_TOOL: ToolDefinition = {
  name: "render_timeline",
  description:
    "Render events on an interactive timeline beside the chat. Call when an answer is naturally chronological (histories, sequences, schedules). Use ISO dates.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "optional timeline title" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            content: { type: "string", description: "event label" },
            start: { type: "string", description: "ISO date/datetime" },
            end: { type: "string", description: "optional ISO end (a range)" },
            group: { type: "string", description: "optional group id" },
          },
          required: ["id", "content", "start"],
        },
      },
      groups: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            content: { type: "string", description: "group label" },
          },
          required: ["id", "content"],
        },
        description: "optional swimlane groups items reference by group id",
      },
    },
    required: ["items"],
  },
};

// The render tools, always present in every turn's tool list. RENDER_TIMELINE_TOOL
// is intentionally omitted until its frontend widget exists (see note above).
const RENDER_TOOLS: ToolDefinition[] = [RENDER_TABLE_TOOL, RENDER_CHART_TOOL];

// The tool list for a turn. Render tools + base are always present; Knowledge
// Graph mode adds the graph tool.
export function buildTools(opts: { graphMode: boolean }): ToolDefinition[] {
  const tools = [...BASE_TOOLS, ...RENDER_TOOLS];
  return opts.graphMode ? [...tools, BUILD_KNOWLEDGE_GRAPH_TOOL] : tools;
}

// Translate our tool definitions (Anthropic's {name, description, input_schema})
// into OpenAI's function-tool envelope. The JSON Schema body is identical between
// the two formats — only the wrapper differs — so input_schema passes through as
// `parameters` untouched. Used by the OpenAI-compatible client (Gemini / DeepSeek
// / Mistral) so all providers share one tool vocabulary and one executeTool().
export function toOpenAITools(
  tools: ToolDefinition[]
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

export function executeTool(name: string, input: unknown): string {
  switch (name) {
    case "get_current_datetime":
      return new Date().toISOString();
    case "build_knowledge_graph":
    case "render_table":
    case "render_chart":
    case "render_timeline":
      // Echo the structured input straight back. This same string is both the
      // tool_result the frontend parses into a widget spec AND the result fed back
      // to the model — fine, since it's a faithful record of what was emitted.
      return JSON.stringify(input);
    default:
      throw new Error(`Unknown tool: "${name}"`);
  }
}
