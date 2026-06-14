import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { bumpUnsplashSearchCount, getUnsplashSearchCount } from "./db";
import type { Provider } from "./models";
import { tryConsume } from "./rateLimit";
import { rememberUnsplashDownload, triggerUnsplashDownloads } from "./unsplash";

// Per-conversation cap on searches that actually return Unsplash photos. Once a
// conversation hits this, further searches fall back to Wikimedia-only (silently).
// Curbs real Unsplash usage per conversation, on top of the app-wide hourly limit.
const MAX_UNSPLASH_SEARCHES_PER_CONVERSATION = 6;

// ToolDefinition covers both regular tools (name/description/input_schema) and
// Anthropic server-side tools like WebSearchTool20260209. Using ToolUnion keeps
// the typing accurate without manual casting.
export type ToolDefinition = Anthropic.Messages.ToolUnion;

// Always-on tools, available regardless of mode.
export const BASE_TOOLS: ToolDefinition[] = [
  {
    name: "get_current_datetime",
    description:
      "Returns the current date and time in ISO 8601 format (UTC). Use when the user asks what time or date it is, or when you need the current date/time for any calculation.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_images",
    description:
      "Search the web (Wikimedia Commons + Unsplash) for real images. Returns, per result, an image url plus a provider-written description, credit, and source link. Call this FIRST whenever the user wants to see photos/pictures of something — never invent image URLs or descriptions yourself.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "what to search for" },
        count: {
          type: "number",
          description: "how many results, 1-20 (default 12)",
        },
      },
      required: ["query"],
    },
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
      orientation: {
        type: "string",
        enum: ["vertical", "horizontal"],
        description:
          "bar only; horizontal for ranked lists or long category labels. default vertical",
      },
      stacked: {
        type: "boolean",
        description:
          "bar/area with 2+ series: stack them (part-to-whole) instead of grouping side-by-side",
      },
      yLabel: {
        type: "string",
        description:
          "value-axis caption, e.g. '% of population', 'per capita', 'index (2000=100)' — use when the axis isn't a raw count",
      },
      xLabel: { type: "string", description: "optional category-axis caption" },
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
            icon: {
              type: "string",
              enum: [...ICON_VOCABULARY],
              description:
                "Optional. The single best-matching icon for THIS specific event, chosen ONLY from the allowed list — e.g. 'Swords' for a battle, 'Rocket' for a launch, 'Crown' for a coronation, 'BookOpen' for a publication, 'Flag' for a founding/declaration, 'Lightbulb' for an invention. Do NOT invent icon names outside the list. Omit if none fits well — a generic dot is shown.",
            },
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

export const RENDER_IMAGES_TOOL: ToolDefinition = {
  name: "render_images",
  description:
    "Display images in a masonry grid beside the chat. Pass only results you got back from search_images — never invent URLs or text. For each image, carry the provider's `url`, `description` (as caption), `href`, `credit`, and `source` through VERBATIM; do not paraphrase or write your own captions. Curate the best results.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "optional gallery title" },
      blurb: {
        type: "string",
        description:
          "one-sentence summary of what this gallery shows — used to seed follow-up exploration",
      },
      images: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "image URL from search_images",
            },
            caption: {
              type: "string",
              description:
                "the search result's `description` (or `title`), copied verbatim — do not write your own",
            },
            href: {
              type: "string",
              description: "the result's `href` (source page link)",
            },
            credit: {
              type: "string",
              description: "the result's `credit` (creator/photographer name)",
            },
            source: {
              type: "string",
              enum: ["wikimedia", "unsplash"],
              description: "the result's `source`",
            },
          },
          required: ["url"],
        },
      },
    },
    required: ["images"],
  },
};

const RENDER_TOOLS: ToolDefinition[] = [
  RENDER_TABLE_TOOL,
  RENDER_CHART_TOOL,
  RENDER_TIMELINE_TOOL,
  RENDER_IMAGES_TOOL,
];

// --- Open-data tools -------------------------------------------------------
// Keyless data sources that return real structured facts the model then renders
// (two-step, like search_images → render_images): the model calls one of these
// to GET data, then calls render_table / render_chart / render_timeline with the
// rows. This keeps facts grounded in real data instead of the model recalling
// them. Each slots in behind executeTool exactly like search_images, mirroring
// its fetch discipline (timeout, descriptive User-Agent, hard result cap,
// length-capped values — every row re-enters the model's context next iteration).

export const WIKIDATA_QUERY_TOOL: ToolDefinition = {
  name: "wikidata_query",
  description:
    "Run a SPARQL query against Wikidata and get back real structured facts (entities, dates, quantities, relationships) as rows. Use this for verifiable data — populations, dates, members of a group, works by a creator — instead of recalling figures yourself. Then render the rows with render_table / render_chart / render_timeline. Keep SELECT projections small and always set a LIMIT.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "a complete SPARQL SELECT query for the Wikidata Query Service. Use rdfs:label with a SERVICE wikibase:label clause for human-readable names; always include a LIMIT.",
      },
      limit: {
        type: "number",
        description: "max rows to return, 1-50 (default 25)",
      },
    },
    required: ["query"],
  },
};

export const WIKIDATA_SEARCH_TOOL: ToolDefinition = {
  name: "wikidata_search",
  description:
    "Resolve a name into its Wikidata entity or property ID (Q-number / P-number). ALWAYS call this FIRST to get the real IDs, then use them in wikidata_query — never guess or recall Q/P ids from memory, they're frequently wrong and a wrong id silently returns zero rows. Returns candidates each with a disambiguating description; pick the one whose description matches what you mean (e.g. 'Douglas Adams' the author Q42, not the engineer). Set type:'property' to look up a predicate like 'date of birth' (P569).",
  input_schema: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description:
          "the name or label to look up, e.g. 'Douglas Adams' or 'date of birth'",
      },
      type: {
        type: "string",
        enum: ["item", "property"],
        description:
          "'item' for entities (people, places, things — Q-numbers), 'property' for predicates (P-numbers). Default 'item'.",
      },
      limit: {
        type: "number",
        description: "max candidates to return, 1-10 (default 5)",
      },
    },
    required: ["search"],
  },
};

export const WORLD_BANK_TOOL: ToolDefinition = {
  name: "world_bank",
  description:
    "Fetch real economic/development time series from the keyless World Bank Open Data API — population, GDP, life expectancy, CO2, etc. — for one or more countries across years. Returns clean {country, year, value} rows ideal for render_chart / render_timeline / render_table. Use for any quantitative country/economic question instead of recalling figures.",
  input_schema: {
    type: "object",
    properties: {
      countries: {
        type: "array",
        items: { type: "string" },
        description:
          'ISO country codes (alpha-2 or alpha-3), e.g. ["FR","DE","ES"] or ["FRA","DEU"]. Required.',
      },
      indicator: {
        type: "string",
        description:
          "World Bank indicator code. Common ones: SP.POP.TOTL (population), NY.GDP.MKTP.CD (GDP US$), NY.GDP.PCAP.CD (GDP per capita), SP.DYN.LE00.IN (life expectancy), EN.ATM.CO2E.PC (CO2 per capita). Default SP.POP.TOTL.",
      },
      start: { type: "number", description: "start year (default 2010)" },
      end: { type: "number", description: "end year (default latest)" },
    },
    required: ["countries"],
  },
};

export const WIKIPEDIA_SUMMARY_TOOL: ToolDefinition = {
  name: "wikipedia_summary",
  description:
    "Fetch the lead summary (and thumbnail) of one or more Wikipedia articles by exact title from the keyless Wikipedia REST API. Returns {title, description, extract, thumbnail, url} per article — real, sourced prose, not recall. Use it to enrich entities you're already discussing: flesh out a knowledge-graph node, source a table's description column, or ground a short text answer. Pass the EXACT article titles (the same value you'd set as a node's wikipediaTitle).",
  input_schema: {
    type: "object",
    properties: {
      titles: {
        type: "array",
        items: { type: "string" },
        description:
          'Exact Wikipedia article titles, e.g. ["Aleister Crowley","Hermeticism"]. 1-10 titles.',
      },
    },
    required: ["titles"],
  },
};

export const OPENALEX_TOOL: ToolDefinition = {
  name: "openalex_search",
  description:
    "Search the keyless OpenAlex scholarly graph for real works (papers/books) or authors and get back citation-ranked results. Returns clean rows ({title, authors, year, citations, venue, url} for works; {name, works_count, cited_by_count, top_concepts, url} for authors) — ideal for render_table / render_chart (rank by citations) / render_timeline (by year). Use for any 'most influential / most cited / key works on X' question instead of recalling figures.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "what to search for, e.g. 'hermeticism' or 'Carl Jung'",
      },
      entity: {
        type: "string",
        enum: ["works", "authors"],
        description:
          "search scholarly 'works' (papers/books) or 'authors' (people). Default works.",
      },
      count: {
        type: "number",
        description: "how many results, 1-25 (default 12)",
      },
    },
    required: ["query"],
  },
};

const DATA_TOOLS: ToolDefinition[] = [
  WIKIDATA_SEARCH_TOOL,
  WIKIDATA_QUERY_TOOL,
  WORLD_BANK_TOOL,
  WIKIPEDIA_SUMMARY_TOOL,
  OPENALEX_TOOL,
];

// Anthropic server-side web search. Runs on Anthropic's infrastructure — the host
// never calls executeTool() for it. Gated to Claude only (OpenAI-compat providers
// can't use Anthropic server-side tools). max_uses=3 caps spend per turn; real
// research questions rarely need more than 2-3 searches to answer.
export const WEB_SEARCH_TOOL: Anthropic.Messages.WebSearchTool20260209 = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 3,
};

// The tool list for a turn. Render tools + base are always present; Knowledge
// Graph mode adds the graph tool; Claude provider adds server-side web search.
export function buildTools(opts: {
  graphMode: boolean;
  provider?: Provider;
}): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    ...BASE_TOOLS,
    ...DATA_TOOLS,
    ...RENDER_TOOLS,
  ];
  if (opts.graphMode) tools.push(BUILD_KNOWLEDGE_GRAPH_TOOL);
  if (opts.provider === "claude") tools.push(WEB_SEARCH_TOOL);
  return tools;
}

// Translate regular tool definitions into OpenAI's function-tool envelope. Skips
// server-side tools (no `input_schema`) — those are Claude-only and will never
// appear in a non-Claude tool list, but the filter is a safety net.
export function toOpenAITools(
  tools: ToolDefinition[]
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools
    .filter(
      (t): t is Anthropic.Messages.Tool =>
        "input_schema" in t && t.input_schema !== undefined
    )
    .map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema as Record<string, unknown>,
      },
    }));
}

// Human-readable, present-tense status labels for the activity indicator. Keyed
// by tool name; falls back to "Using {name}…" for anything not listed (e.g. a
// newly added tool). The label is display-only — it never feeds the model.
const TOOL_STATUS_LABELS: Record<string, string> = {
  get_current_datetime: "Checking the time",
  search_images: "Searching for images",
  web_search: "Searching the web",
  wikidata_search: "Looking up Wikidata ids",
  wikidata_query: "Querying Wikidata",
  world_bank: "Fetching World Bank data",
  wikipedia_summary: "Reading Wikipedia",
  openalex_search: "Searching scholarly works",
  build_knowledge_graph: "Mapping the knowledge graph",
  render_table: "Building a table",
  render_chart: "Building a chart",
  render_timeline: "Building a timeline",
  render_images: "Laying out images",
};

// A non-blank trimmed string, or null. Used to pull a display subject out of the
// model-supplied input — defensive, since the field may be missing or odd-typed.
function trimmedString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// The display subject for a tool's status: the quoted `name` plus an optional
// unquoted `extra` (e.g. "+2 more") that must sit OUTSIDE the closing quote.
type StatusSubject = { name: string; extra?: string };

// First non-blank entry of a string[] field (e.g. Wikipedia `titles`), with a
// "+N more" tail when the model passed several — so a multi-title fetch reads
// "Reading Wikipedia: “Marie Curie” +2 more…" rather than dropping the subject.
function arraySubject(v: unknown): StatusSubject | null {
  if (!Array.isArray(v)) return null;
  const names = v.map(trimmedString).filter((s): s is string => s !== null);
  const [first, ...others] = names;
  if (!first) return null;
  return {
    name: first,
    extra: others.length ? `+${others.length} more` : undefined,
  };
}

// Pull the most natural display subject out of a tool's input. Tools name their
// subject field differently (query/search/title singular; Wikipedia `titles`
// array; World Bank `countries`+`indicator`), so this normalises across them.
// Returns null when there's nothing meaningful to name.
function statusSubject(
  name: string,
  obj: Record<string, unknown>
): StatusSubject | null {
  if (name === "wikipedia_summary") return arraySubject(obj.titles);
  if (name === "world_bank") {
    const codes = Array.isArray(obj.countries)
      ? obj.countries.map(trimmedString).filter((s): s is string => s !== null)
      : [];
    if (!codes.length) return null;
    const where =
      codes.length > 2 ? `${codes.length} countries` : codes.join(", ");
    const indicator = trimmedString(obj.indicator);
    return { name: indicator ? `${indicator} — ${where}` : where };
  }
  const single =
    trimmedString(obj.query) ??
    trimmedString(obj.search) ??
    trimmedString(obj.title);
  return single ? { name: single } : null;
}

// Build the status blurb shown while a tool runs. Where the input carries a
// subject we fold it in ("Searching the web for "…"") for a more specific,
// varied message; otherwise we use the bare label. Defensive about the input
// shape since it's model-supplied — a missing/odd field just drops the suffix.
export function toolStatusLabel(name: string, input?: unknown): string {
  const base = TOOL_STATUS_LABELS[name] ?? `Using ${name}`;
  const obj =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : null;
  const subject = obj ? statusSubject(name, obj) : null;

  if (!subject) return `${base}…`;
  const tail = subject.extra ? ` ${subject.extra}` : "";
  const quoted = `“${subject.name}”${tail}`;
  // Search tools read naturally with "for"; the rest take a colon.
  const joiner =
    name === "search_images" || name === "web_search" ? " for " : ": ";
  return `${base}${joiner}${quoted}…`;
}

// An honest, human-readable "got N results" status for the slow fetch tools, or
// null when the tool has no meaningful count (or its result is unparseable). This
// is the REAL signal that supersedes the frontend's scripted progress mid-fetch —
// emitted right after the tool resolves. Defensive about result shape: anything
// odd just yields null (no false "got 0…" on a healthy-but-differently-shaped
// result). Only the data tools are handled; render_* echoes need no count.
export function toolResultStatus(
  name: string,
  resultJson: string
): string | null {
  let data: unknown;
  try {
    data = JSON.parse(resultJson);
  } catch {
    return null;
  }
  const count = (arr: unknown): number | null =>
    Array.isArray(arr) ? arr.length : null;

  let n: number | null = null;
  if (name === "wikidata_search") {
    const obj = data as Record<string, unknown>;
    n = count(obj?.results) ?? count(data);
  } else if (name === "wikidata_query") {
    // SPARQL result: { rows: [...] } (or a bare array).
    const obj = data as Record<string, unknown>;
    n = count(obj?.rows) ?? count(data);
  } else if (name === "world_bank") {
    const obj = data as Record<string, unknown>;
    n = count(obj?.series) ?? count(obj?.rows) ?? count(data);
  } else if (name === "wikipedia_summary" || name === "openalex_search") {
    const obj = data as Record<string, unknown>;
    n = count(obj?.rows) ?? count(data);
  } else if (name === "search_images") {
    const obj = data as Record<string, unknown>;
    n = count(obj?.images) ?? count(obj?.results) ?? count(data);
  }

  if (n === null || n <= 0) return null;
  const noun = name === "search_images" ? "image" : "result";
  return `Got ${n} ${noun}${n === 1 ? "" : "s"} — shaping…`;
}

export async function executeTool(
  name: string,
  input: unknown,
  sessionId?: string
): Promise<string> {
  switch (name) {
    case "get_current_datetime":
      return new Date().toISOString();
    case "search_images":
      return searchImages(input, sessionId);
    case "wikidata_search":
      return wikidataSearch(input);
    case "wikidata_query":
      return wikidataQuery(input);
    case "world_bank":
      return worldBank(input);
    case "wikipedia_summary":
      return wikipediaSummary(input);
    case "openalex_search":
      return openalexSearch(input);
    case "render_images":
      // Fire Unsplash photographer-credit pings for the photos actually being
      // rendered (API-terms compliance), then echo like the other render tools.
      fireUnsplashCreditsForRender(input);
      return JSON.stringify(input);
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

// The render tools whose tool_use input IS the widget spec verbatim (executeTool
// just echoes it). Because the result is the streamed input_json_delta and nothing
// else, we can forward the partial JSON to the frontend AS IT STREAMS and the
// widget can render a growing spec — no waiting for the whole block. Data tools
// (wikidata, world_bank, …) are NOT here: their result comes from a fetch, not the
// model's text, so there's nothing meaningful to stream mid-input.
export const STREAMABLE_RENDER_TOOLS: ReadonlySet<string> = new Set([
  "build_knowledge_graph",
  "render_table",
  "render_chart",
  "render_timeline",
  "render_images",
]);

// --- Self-correction: degenerate-result detection --------------------------
// Promotes the frontend's empty-panel escalation (useFillFromConversation) into
// the agent loop: detect when a render/data tool produced nothing usable so the
// loop can prompt the model to re-derive or bow out — once, in the same turn,
// instead of shipping an empty widget and waiting for a human to click Update.
// Pure + unit-testable; defensive about the model-supplied (or fetch-returned)
// shape — anything unparseable is treated as NOT degenerate (don't false-positive
// a healthy turn into a retry).
export function isDegenerate(toolName: string, resultJson: string): boolean {
  let data: unknown;
  try {
    data = JSON.parse(resultJson);
  } catch {
    return false;
  }
  if (data == null || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;

  // A tool that returned an explicit error is its own signal — the loop already
  // surfaces those; don't double-handle as "degenerate".
  if (typeof obj.error === "string") return false;

  const emptyArray = (v: unknown): boolean =>
    !Array.isArray(v) || v.length === 0;

  switch (toolName) {
    case "render_table":
      return emptyArray(obj.rows);
    case "render_chart":
      // Degenerate if there's no data OR no series to plot.
      return emptyArray(obj.data) || emptyArray(obj.series);
    case "render_timeline":
      return emptyArray(obj.items);
    case "render_images":
      return emptyArray(obj.images);
    case "build_knowledge_graph": {
      // A graph is only worth drawing if it CONNECTS things. A lone node (or two
      // orphan nodes with no edge) reads as broken — the whole point is the links.
      // We treat <2 entities OR 0 relationships as degenerate so the self-
      // correction loop prompts the model to enrich it (e.g. promote the table's
      // own rows into connected nodes) rather than ship a single floating node.
      // NOTE: this is an ADDITIVE-merge tool — a later call that only adds edges to
      // an already-populated graph legitimately sends entities:[] with
      // relationships. Only flag the degenerate case where there's nothing to add
      // AND nothing connects: no relationships and fewer than 2 new entities.
      const entities = Array.isArray(obj.entities) ? obj.entities : [];
      const relationships = Array.isArray(obj.relationships)
        ? obj.relationships
        : [];
      const hasMergeOrRemove =
        (Array.isArray(obj.merge) && obj.merge.length > 0) ||
        (Array.isArray(obj.remove) && obj.remove.length > 0);
      // A maintenance-only call (merge/remove) is intentional, not degenerate.
      if (hasMergeOrRemove) return false;
      return relationships.length === 0 && entities.length < 2;
    }
    case "wikidata_query":
      return emptyArray(obj.rows);
    case "world_bank":
      return emptyArray(obj.rows);
    case "wikipedia_summary":
      return emptyArray(obj.rows);
    case "openalex_search":
      return emptyArray(obj.rows);
    default:
      return false;
  }
}

// The corrective directive appended to a degenerate tool_result so the model
// self-heals on the next iteration. Terse — it re-enters context.
export function correctionDirective(toolName: string): string {
  if (toolName === "build_knowledge_graph") {
    return (
      `\n\n[system] That build_knowledge_graph call made a degenerate graph — a single ` +
      `node (or nodes with no links). A graph is only worth showing when it CONNECTS ` +
      `things. Call build_knowledge_graph again with at least 3 connected entities and ` +
      `the relationships between them — draw them from what's already in this answer ` +
      `(e.g. the rows/items you just rendered) and how they relate. Only bow out if the ` +
      `subject genuinely has no connectable entities, and then say so in one short sentence.`
    );
  }
  return (
    `\n\n[system] That ${toolName} call produced no usable rows/data. ` +
    `Either re-derive it correctly from the conversation, switch to a more fitting ` +
    `capability, or briefly tell the user there's nothing to show and don't render an empty widget.`
  );
}

// Pull the image urls out of a render_images input and fire the Unsplash
// credit pings for any that came from Unsplash. Defensive about the shape since
// it's model-supplied; a malformed input just fires nothing.
function fireUnsplashCreditsForRender(input: unknown): void {
  const images = (input as { images?: unknown })?.images;
  if (!Array.isArray(images)) return;
  const urls = images
    .map((im) =>
      im && typeof im === "object" ? (im as { url?: unknown }).url : undefined
    )
    .filter((u): u is string => typeof u === "string");
  if (urls.length > 0) triggerUnsplashDownloads(urls);
}

// --- search_images ---------------------------------------------------------
// Server-side image search so the model never has to invent (and hallucinate)
// image URLs or descriptions. Runs in our backend, so it works identically
// across every provider — unlike Anthropic's server-side web_search.
//
// Two sources, polled in parallel and merged:
//   • Wikimedia Commons — keyless; real human-written ImageDescription/Artist.
//   • Unsplash — OPTIONAL (needs UNSPLASH_ACCESS_KEY); photographer-written
//     description/alt_description, glossier photos.
// Both supply their OWN captions — the description is never model-authored. If
// the Unsplash key is unset, or either source fails, we degrade to whatever
// returned. Results are kept minimal to protect the token budget.

const IMAGE_SEARCH_TIMEOUT_MS = 5000;

// The merged result shape handed back to the model. Every field is
// provider-supplied; `source` lets the UI/credit distinguish origins.
type ImageResult = {
  url: string;
  title?: string;
  description?: string;
  credit?: string;
  href?: string;
  source: "wikimedia" | "unsplash";
  // "photo" for raster photographs, "document" for SVG diagrams, infographics,
  // scanned pages, charts, etc. The model curates on this: render the genuine
  // photos AND any document that's genuinely interesting/relevant, dropping only
  // boring chart/document noise. Unsplash is always photos; only Commons varies.
  kind?: "photo" | "document";
};

// extmetadata / HTML-bearing values: strip tags, decode the handful of entities
// that show up, collapse whitespace, cap length so a stray long caption can't
// blow the token budget.
export function stripHtml(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

const COMMONS_ENDPOINT = "https://commons.wikimedia.org/w/api.php";
// Commons asks API clients to send a descriptive User-Agent with contact info.
const COMMONS_USER_AGENT = "Aether/1.0 (https://github.com/baldrocks; demo)";

type CommonsExtMeta = { value?: string };
type CommonsPage = {
  title?: string;
  imageinfo?: Array<{
    thumburl?: string;
    url?: string;
    mime?: string;
    descriptionurl?: string;
    extmetadata?: {
      ObjectName?: CommonsExtMeta;
      ImageDescription?: CommonsExtMeta;
      Artist?: CommonsExtMeta;
    };
  }>;
};

// Commons File: namespace hosts SVG diagrams, scanned pages, and infographics
// alongside real photos. We DON'T filter these out — an interesting, relevant
// document can be exactly what an abstract/technical query wants. Instead we tag
// each result's `kind` (photo vs document) from its MIME and let the model curate:
// keep the genuine photos AND any worthwhile document, drop only boring chart noise.
// Raster MIME types we treat as photographs; everything else (svg+xml, pdf, tiff…)
// is a "document". (Audio/video can't render in a gallery, so those we do drop.)
const COMMONS_PHOTO_MIME = /^image\/(jpeg|png|webp|gif)$/;
const COMMONS_RENDERABLE_MIME = /^(image\/|application\/pdf)/;

async function searchCommons(
  query: string,
  limit: number
): Promise<ImageResult[]> {
  const url = new URL(COMMONS_ENDPOINT);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6"); // File: namespace
  url.searchParams.set("gsrlimit", String(limit));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|extmetadata");
  url.searchParams.set("iiurlwidth", "800"); // generate an 800px thumb to display
  url.searchParams.set(
    "iiextmetadatafilter",
    "ImageDescription|ObjectName|Artist"
  );

  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": COMMONS_USER_AGENT },
    signal: AbortSignal.timeout(IMAGE_SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Wikimedia ${res.status}`);
  const data = (await res.json()) as {
    query?: { pages?: Record<string, CommonsPage> };
  };
  // Display the 800px thumb; full-res Commons originals can be tens of MB.
  return Object.values(data.query?.pages ?? {})
    .map((p): ImageResult | null => {
      const info = p.imageinfo?.[0];
      const url = info?.thumburl ?? info?.url;
      if (!url) return null;
      // Drop only what can't render in a gallery (audio/video); keep photos AND
      // documents (SVG/PDF/etc.), tagging `kind` so the model can curate. A
      // missing MIME is rare; assume photo so we don't lose a usable result.
      const mime = info?.mime;
      if (mime && !COMMONS_RENDERABLE_MIME.test(mime)) return null;
      const kind: ImageResult["kind"] =
        mime && !COMMONS_PHOTO_MIME.test(mime) ? "document" : "photo";
      const meta = info?.extmetadata;
      return {
        url,
        title: stripHtml(meta?.ObjectName?.value) ?? p.title,
        description: stripHtml(meta?.ImageDescription?.value),
        credit: stripHtml(meta?.Artist?.value),
        href: info?.descriptionurl,
        source: "wikimedia",
        kind,
      };
    })
    .filter((r): r is ImageResult => r !== null);
}

type UnsplashPhoto = {
  urls?: { regular?: string; small?: string };
  description?: string | null;
  alt_description?: string | null;
  links?: { html?: string; download_location?: string };
  user?: { name?: string; links?: { html?: string } };
};

// Polled only when UNSPLASH_ACCESS_KEY is configured. description/alt_description
// are photographer-supplied — still provider text, not model text. Gated by the
// app-wide hourly rate limiter (Unsplash's demo tier caps the whole app at
// 50 req/hr); when the budget is spent we skip Unsplash and the caller falls
// back to Wikimedia-only.
async function searchUnsplash(
  query: string,
  limit: number,
  sessionId?: string
): Promise<ImageResult[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];

  // Per-conversation cap: once this conversation has had N searches that actually
  // returned Unsplash photos, stop hitting Unsplash and fall back to Wikimedia-only.
  // Skip when there's no session (ephemeral chats aren't persisted → nothing to count).
  if (sessionId) {
    try {
      if (
        (await getUnsplashSearchCount(sessionId)) >=
        MAX_UNSPLASH_SEARCHES_PER_CONVERSATION
      ) {
        return [];
      }
    } catch (err) {
      // Fail closed: if we can't read the count, don't risk overspending Unsplash.
      console.error("unsplash per-conversation cap check failed:", err);
      return [];
    }
  }

  if (!(await tryConsume("unsplash"))) return [];

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set("content_filter", "high");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Client-ID ${key}`,
      "Accept-Version": "v1",
    },
    signal: AbortSignal.timeout(IMAGE_SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
  const data = (await res.json()) as { results?: UnsplashPhoto[] };
  const results = (data.results ?? [])
    .map((p): ImageResult | null => {
      const url = p.urls?.regular ?? p.urls?.small;
      if (!url) return null;
      // Remember the download_location so we can fire the photographer-credit
      // ping if/when this photo is actually rendered (Unsplash API terms).
      rememberUnsplashDownload(url, p.links?.download_location);
      return {
        url,
        description:
          p.description?.trim() || p.alt_description?.trim() || undefined,
        credit: p.user?.name,
        // Source page link, used both as the image's href and for the required
        // "on Unsplash" attribution link.
        href: p.links?.html,
        source: "unsplash",
        kind: "photo", // Unsplash is always photographs
      };
    })
    .filter((r): r is ImageResult => r !== null);

  // Only count this against the conversation's budget if it actually returned
  // photos — we're rate-limiting real Unsplash usage, so an empty result is a
  // free retry. Non-fatal if the bump fails: we still return the photos.
  if (sessionId && results.length > 0) {
    try {
      await bumpUnsplashSearchCount(sessionId);
    } catch (err) {
      console.error("unsplash per-conversation count bump failed:", err);
    }
  }
  return results;
}

// Interleave two source lists so the merged gallery isn't all-Commons-then-all-
// Unsplash. Stops when both are exhausted.
export function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i] as T);
    if (i < b.length) out.push(b[i] as T);
  }
  return out;
}

async function searchImages(
  input: unknown,
  sessionId?: string
): Promise<string> {
  const { query, count } = (input ?? {}) as {
    query?: string;
    count?: number;
  };
  if (!query || typeof query !== "string") {
    return JSON.stringify({
      error: "search_images requires a `query` string.",
    });
  }
  // Default small and cap hard — every result re-enters the model's context on
  // the next loop iteration, so this is the main token cost of the feature.
  // Each source fetches up to `limit`; the merged set is capped to `limit` too.
  const limit = Math.min(16, Math.max(1, Math.round(count ?? 8)));

  // Poll both sources in parallel; one failing (or Unsplash unconfigured)
  // doesn't sink the other.
  const [commons, unsplash] = await Promise.allSettled([
    searchCommons(query, limit),
    searchUnsplash(query, limit, sessionId),
  ]);

  const commonsResults = commons.status === "fulfilled" ? commons.value : [];
  const unsplashResults = unsplash.status === "fulfilled" ? unsplash.value : [];

  if (commonsResults.length === 0 && unsplashResults.length === 0) {
    const why =
      commons.status === "rejected"
        ? String(commons.reason)
        : "no matching images";
    return JSON.stringify({
      error: `Image search failed (${why}). Tell the user and offer to try again.`,
    });
  }

  const results = interleave(commonsResults, unsplashResults).slice(0, limit);
  return JSON.stringify({ query, results });
}

// --- wikidata_query --------------------------------------------------------
// Keyless SPARQL against the Wikidata Query Service. Mirrors the search_images
// fetch discipline: AbortSignal timeout, a descriptive User-Agent (WDQS requires
// one and blocks generic agents), the JSON results Accept header, a hard row cap,
// and length-capped cell values so a stray long literal can't blow the token
// budget. Returns flattened {var: value} rows the model then feeds to a render
// tool — the same two-step shape as search_images → render_images.

const DATA_TOOL_TIMEOUT_MS = 6000;
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
// WDQS, like Commons, asks for a descriptive User-Agent with contact info.
const DATA_TOOL_USER_AGENT = COMMONS_USER_AGENT;
// Cap any single cell so a verbose label/description can't dominate context.
const MAX_CELL_LEN = 200;

export function capCell(value: string): string {
  return value.length > MAX_CELL_LEN
    ? `${value.slice(0, MAX_CELL_LEN - 1)}…`
    : value;
}

type SparqlBinding = Record<string, { value?: string } | undefined>;

// --- wikidata_search -------------------------------------------------------
// Name → Q/P id resolver over the wbsearchentities API. The model must call this
// before wikidata_query so it writes SPARQL with real, verified ids instead of
// recalled ones (the silent-zero-rows trap). Note the host is www.wikidata.org
// (the wiki API), NOT query.wikidata.org (the SPARQL endpoint). Same fetch
// discipline as wikidataQuery (timeout, descriptive User-Agent, capped cells).
const WIKIDATA_SEARCH_ENDPOINT = "https://www.wikidata.org/w/api.php";

interface WbSearchHit {
  id?: string;
  label?: string;
  description?: string;
}

async function wikidataSearch(input: unknown): Promise<string> {
  const { search, type, limit } = (input ?? {}) as {
    search?: string;
    type?: string;
    limit?: number;
  };
  if (!search || typeof search !== "string") {
    return JSON.stringify({
      error: "wikidata_search requires a `search` string.",
    });
  }
  const cap = Math.min(10, Math.max(1, Math.round(limit ?? 5)));
  const entityType = type === "property" ? "property" : "item";

  const url = new URL(WIKIDATA_SEARCH_ENDPOINT);
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", search);
  url.searchParams.set("language", "en");
  url.searchParams.set("type", entityType);
  url.searchParams.set("limit", String(cap));
  url.searchParams.set("format", "json");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": DATA_TOOL_USER_AGENT,
      },
      signal: AbortSignal.timeout(DATA_TOOL_TIMEOUT_MS),
    });
  } catch (err) {
    return JSON.stringify({
      error: `Wikidata search failed (${String(err)}). Tell the user and offer to try again.`,
    });
  }
  if (!res.ok) {
    return JSON.stringify({
      error: `Wikidata search returned ${res.status}. Tell the user and offer to try again.`,
    });
  }

  let data: { search?: WbSearchHit[] };
  try {
    data = (await res.json()) as { search?: WbSearchHit[] };
  } catch (err) {
    return JSON.stringify({
      error: `Wikidata search returned an unreadable response (${String(err)}). Tell the user and offer to try again.`,
    });
  }
  const results = (data.search ?? [])
    .map((h) => {
      if (!h.id) return null;
      const row: { id: string; label?: string; description?: string } = {
        id: h.id,
      };
      if (h.label) row.label = capCell(h.label);
      if (h.description) row.description = capCell(h.description);
      return row;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return JSON.stringify({ results });
}

async function wikidataQuery(input: unknown): Promise<string> {
  const { query, limit } = (input ?? {}) as {
    query?: string;
    limit?: number;
  };
  if (!query || typeof query !== "string") {
    return JSON.stringify({
      error: "wikidata_query requires a SPARQL `query` string.",
    });
  }
  const cap = Math.min(50, Math.max(1, Math.round(limit ?? 25)));

  const url = new URL(WIKIDATA_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": DATA_TOOL_USER_AGENT,
      },
      signal: AbortSignal.timeout(DATA_TOOL_TIMEOUT_MS),
    });
  } catch (err) {
    return JSON.stringify({
      error: `Wikidata query failed (${String(err)}). Tell the user and offer to try again.`,
    });
  }
  if (!res.ok) {
    // A 400 is usually a malformed SPARQL query — surface that so the model can
    // fix and retry rather than silently giving up.
    return JSON.stringify({
      error: `Wikidata returned ${res.status}. ${
        res.status === 400
          ? "The SPARQL query was likely malformed — revise it."
          : "Tell the user and offer to try again."
      }`,
    });
  }

  let data: {
    head?: { vars?: string[] };
    results?: { bindings?: SparqlBinding[] };
  };
  try {
    data = (await res.json()) as {
      head?: { vars?: string[] };
      results?: { bindings?: SparqlBinding[] };
    };
  } catch (err) {
    return JSON.stringify({
      error: `Wikidata returned an unreadable response (${String(err)}). Tell the user and offer to try again.`,
    });
  }
  const vars = data.head?.vars ?? [];
  const bindings = data.results?.bindings ?? [];
  if (bindings.length === 0) {
    // Valid query, no matches — almost always a wrong Q/P id. Point the model at
    // the resolver instead of letting it read this as "nothing exists" and recall.
    return JSON.stringify({
      vars,
      rows: [],
      hint: "The query was valid but matched nothing — a Q-id or P-id is probably wrong. Call wikidata_search to get the correct ids, then retry. Don't fall back to recalled facts.",
    });
  }

  // Flatten each binding to a plain {var: value} object; drop Wikidata's
  // datatype/xml:lang metadata (the model only needs the value).
  const rows = bindings.slice(0, cap).map((b) => {
    const row: Record<string, string> = {};
    for (const v of vars) {
      const cell = b[v]?.value;
      if (cell !== undefined) row[v] = capCell(cell);
    }
    return row;
  });
  return JSON.stringify({ vars, rows });
}

// --- world_bank ------------------------------------------------------------
// Keyless World Bank Open Data: economic/development indicator time series per
// country. Same fetch discipline as wikidata (timeout, User-Agent, capped rows).
// Returns flat {country, code, year, value} rows the model feeds straight to
// render_chart / render_timeline / render_table. (Replaced the now-deprecated
// REST Countries API — Wikidata covers country attributes; this covers numeric
// time series, which is the higher-value chart/timeline fodder.)

const WORLD_BANK_BASE = "https://api.worldbank.org/v2";
const DEFAULT_INDICATOR = "SP.POP.TOTL"; // total population
const WORLD_BANK_MAX_ROWS = 500;

// One observation from the World Bank v2 JSON (the response is [meta, data[]]).
type WbObservation = {
  country?: { id?: string; value?: string };
  countryiso3code?: string;
  date?: string;
  value?: number | null;
  indicator?: { value?: string };
};

async function worldBank(input: unknown): Promise<string> {
  const { countries, indicator, start, end } = (input ?? {}) as {
    countries?: unknown;
    indicator?: unknown;
    start?: unknown;
    end?: unknown;
  };
  const codes = Array.isArray(countries)
    ? countries
        .filter((c): c is string => typeof c === "string" && c.trim() !== "")
        .map((c) => c.trim())
    : [];
  if (codes.length === 0) {
    return JSON.stringify({
      error: "world_bank requires a `countries` array of ISO codes.",
    });
  }
  const ind =
    typeof indicator === "string" && indicator.trim()
      ? indicator.trim()
      : DEFAULT_INDICATOR;
  const startYear = typeof start === "number" ? Math.round(start) : 2010;
  const endYear =
    typeof end === "number" ? Math.round(end) : new Date().getFullYear();

  // Semicolon-joined country codes is the World Bank multi-country syntax.
  const url = new URL(
    `${WORLD_BANK_BASE}/country/${codes.join(";")}/indicator/${encodeURIComponent(ind)}`
  );
  url.searchParams.set("format", "json");
  url.searchParams.set("date", `${startYear}:${endYear}`);
  url.searchParams.set("per_page", String(WORLD_BANK_MAX_ROWS));

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": DATA_TOOL_USER_AGENT,
      },
      signal: AbortSignal.timeout(DATA_TOOL_TIMEOUT_MS),
    });
  } catch (err) {
    return JSON.stringify({
      error: `World Bank query failed (${String(err)}). Tell the user and offer to try again.`,
    });
  }
  if (!res.ok) {
    return JSON.stringify({
      error: `World Bank returned ${res.status}. Check the indicator/country codes.`,
    });
  }

  // The API returns [paginationMeta, observations]. A bad indicator/code returns
  // a message object in element 0 with no data array.
  let body: unknown;
  try {
    body = (await res.json()) as unknown;
  } catch (err) {
    return JSON.stringify({
      error: `World Bank returned an unreadable response (${String(err)}). Tell the user and offer to try again.`,
    });
  }
  if (!Array.isArray(body) || body.length < 2 || !Array.isArray(body[1])) {
    return JSON.stringify({
      error:
        "World Bank returned no data — the indicator or country codes may be invalid.",
    });
  }
  const observations = body[1] as WbObservation[];
  const indicatorName = observations[0]?.indicator?.value ?? ind;

  // Flatten to compact rows, dropping null values (years with no datum), newest
  // last. Cap defensively (per_page already bounds it).
  const rows = observations
    .filter((o) => o.value !== null && o.value !== undefined)
    .slice(0, WORLD_BANK_MAX_ROWS)
    .map((o) => ({
      country: o.country?.value,
      code: o.countryiso3code,
      year: o.date,
      value: o.value,
    }));

  if (rows.length === 0) {
    return JSON.stringify({ indicator: indicatorName, rows: [] });
  }
  return JSON.stringify({ indicator: indicatorName, rows });
}

// --- wikipedia_summary -----------------------------------------------------
// Keyless Wikipedia REST summary endpoint: the lead paragraph + thumbnail of an
// article by exact title. Enriches entities we already store a wikipediaTitle for
// (KG nodes, table descriptions) with real sourced prose instead of recall. Same
// fetch discipline as the other data tools; titles fetched in parallel, each
// failure isolated so one bad title doesn't sink the batch. Returns {rows:[...]}.

const WIKIPEDIA_SUMMARY_BASE =
  "https://en.wikipedia.org/api/rest_v1/page/summary";
const MAX_WIKIPEDIA_TITLES = 10;

type WikipediaSummaryResponse = {
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
};

async function fetchOneWikipediaSummary(
  title: string
): Promise<Record<string, string> | null> {
  // The REST path takes the title URL-encoded, with spaces as underscores.
  const slug = encodeURIComponent(title.trim().replace(/\s+/g, "_"));
  let res: Response;
  try {
    res = await fetch(`${WIKIPEDIA_SUMMARY_BASE}/${slug}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": DATA_TOOL_USER_AGENT,
      },
      signal: AbortSignal.timeout(DATA_TOOL_TIMEOUT_MS),
    });
  } catch {
    return null; // network/timeout — skip this title, keep the rest
  }
  if (!res.ok) return null; // 404 (no such article) etc. — skip silently
  let data: WikipediaSummaryResponse;
  try {
    data = (await res.json()) as WikipediaSummaryResponse;
  } catch {
    return null; // unreadable/partial body — skip this title, keep the rest
  }
  if (!data.extract) return null; // disambiguation/empty pages carry no extract
  const row: Record<string, string> = {
    title: data.title ?? title,
    extract: capCell(data.extract),
  };
  if (data.description) row.description = capCell(data.description);
  if (data.thumbnail?.source) row.thumbnail = data.thumbnail.source;
  if (data.content_urls?.desktop?.page)
    row.url = data.content_urls.desktop.page;
  return row;
}

async function wikipediaSummary(input: unknown): Promise<string> {
  const { titles } = (input ?? {}) as { titles?: unknown };
  const list = Array.isArray(titles)
    ? titles
        .filter((t): t is string => typeof t === "string" && t.trim() !== "")
        .map((t) => t.trim())
        .slice(0, MAX_WIKIPEDIA_TITLES)
    : [];
  if (list.length === 0) {
    return JSON.stringify({
      error: "wikipedia_summary requires a `titles` array of article titles.",
    });
  }
  const settled = await Promise.all(list.map(fetchOneWikipediaSummary));
  const rows = settled.filter((r): r is Record<string, string> => r !== null);
  return JSON.stringify({ rows });
}

// --- openalex_search -------------------------------------------------------
// Keyless OpenAlex scholarly graph: citation-ranked works or authors for a query.
// Great fodder for "most influential / most cited / key works on X" — rows feed
// straight into render_table / render_chart (by citations) / render_timeline (by
// year). Same fetch discipline; results are flattened to compact, capped rows.
// OpenAlex asks for a contact email in the query (the "polite pool") — we send the
// project contact, same spirit as the User-Agent on the other tools.

const OPENALEX_BASE = "https://api.openalex.org";
const OPENALEX_CONTACT = "andrewbaldock3@gmail.com"; // polite-pool contact (reachable, per OpenAlex terms)
const OPENALEX_MAX_RESULTS = 25;

type OpenAlexWork = {
  display_name?: string;
  publication_year?: number;
  cited_by_count?: number;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { source?: { display_name?: string } };
  id?: string;
};
type OpenAlexAuthor = {
  display_name?: string;
  works_count?: number;
  cited_by_count?: number;
  x_concepts?: Array<{ display_name?: string }>;
  id?: string;
};

async function openalexSearch(input: unknown): Promise<string> {
  const { query, entity, count } = (input ?? {}) as {
    query?: unknown;
    entity?: unknown;
    count?: unknown;
  };
  if (typeof query !== "string" || !query.trim()) {
    return JSON.stringify({
      error: "openalex_search requires a `query` string.",
    });
  }
  const kind = entity === "authors" ? "authors" : "works";
  const cap = Math.min(
    OPENALEX_MAX_RESULTS,
    Math.max(1, Math.round(typeof count === "number" ? count : 12))
  );

  const url = new URL(`${OPENALEX_BASE}/${kind}`);
  url.searchParams.set("search", query.trim());
  url.searchParams.set("per_page", String(cap));
  url.searchParams.set("sort", "cited_by_count:desc"); // most influential first
  url.searchParams.set("mailto", OPENALEX_CONTACT);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": DATA_TOOL_USER_AGENT,
      },
      signal: AbortSignal.timeout(DATA_TOOL_TIMEOUT_MS),
    });
  } catch (err) {
    return JSON.stringify({
      error: `OpenAlex search failed (${String(err)}). Tell the user and offer to try again.`,
    });
  }
  if (!res.ok) {
    return JSON.stringify({
      error: `OpenAlex returned ${res.status}. Try a simpler query.`,
    });
  }

  let body: { results?: unknown };
  try {
    body = (await res.json()) as { results?: unknown };
  } catch (err) {
    return JSON.stringify({
      error: `OpenAlex returned an unreadable response (${String(err)}). Tell the user and offer to try again.`,
    });
  }
  const results = Array.isArray(body.results) ? body.results : [];

  const rows =
    kind === "works"
      ? (results as OpenAlexWork[]).map((w) => ({
          title: capCell(w.display_name ?? "Untitled"),
          authors: capCell(
            (w.authorships ?? [])
              .map((a) => a.author?.display_name)
              .filter((n): n is string => !!n)
              .slice(0, 5)
              .join(", ")
          ),
          year: w.publication_year ?? null,
          citations: w.cited_by_count ?? 0,
          venue: w.primary_location?.source?.display_name
            ? capCell(w.primary_location.source.display_name)
            : undefined,
          url: w.id,
        }))
      : (results as OpenAlexAuthor[]).map((a) => ({
          name: capCell(a.display_name ?? "Unknown"),
          works_count: a.works_count ?? 0,
          cited_by_count: a.cited_by_count ?? 0,
          top_concepts: capCell(
            (a.x_concepts ?? [])
              .map((c) => c.display_name)
              .filter((n): n is string => !!n)
              .slice(0, 4)
              .join(", ")
          ),
          url: a.id,
        }));

  return JSON.stringify({ entity: kind, rows });
}
