import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { bumpUnsplashSearchCount, getUnsplashSearchCount } from "./db";
import type { Provider } from "./models";
import { tryConsume } from "./rateLimit";
import { rememberUnsplashDownload, triggerUnsplashDownloads } from "./unsplash";

// Per-conversation cap on searches that actually return Unsplash photos. Once a
// conversation hits this, further searches fall back to Wikimedia-only (silently).
// Curbs real Unsplash usage per conversation, on top of the app-wide hourly limit.
const MAX_UNSPLASH_SEARCHES_PER_CONVERSATION = 3;

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
  const tools: ToolDefinition[] = [...BASE_TOOLS, ...RENDER_TOOLS];
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
};

// extmetadata / HTML-bearing values: strip tags, decode the handful of entities
// that show up, collapse whitespace, cap length so a stray long caption can't
// blow the token budget.
function stripHtml(html: string | undefined): string | undefined {
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
    descriptionurl?: string;
    extmetadata?: {
      ObjectName?: CommonsExtMeta;
      ImageDescription?: CommonsExtMeta;
      Artist?: CommonsExtMeta;
    };
  }>;
};

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
  url.searchParams.set("iiprop", "url|extmetadata");
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
      const meta = info?.extmetadata;
      return {
        url,
        title: stripHtml(meta?.ObjectName?.value) ?? p.title,
        description: stripHtml(meta?.ImageDescription?.value),
        credit: stripHtml(meta?.Artist?.value),
        href: info?.descriptionurl,
        source: "wikimedia",
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
function interleave<T>(a: T[], b: T[]): T[] {
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
