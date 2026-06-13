import { describe, expect, it } from "bun:test";
import {
  BASE_TOOLS,
  buildTools,
  capCell,
  correctionDirective,
  interleave,
  stripHtml,
  toOpenAITools,
  toolResultStatus,
  toolStatusLabel,
} from "./tools";

// DATA_TOOLS / RENDER_TOOLS aren't exported, so their counts are inlined here
// (kept in sync with tools.ts). The composition assertions below would break
// loudly if either list grows, prompting a one-line update.
const BASE = BASE_TOOLS.length; // get_current_datetime + search_images
const DATA = 5; // wikidata_search, wikidata_query, world_bank, wikipedia_summary, openalex_search
const RENDER = 4; // render_table, render_chart, render_timeline, render_images

describe("toolStatusLabel", () => {
  it("falls back to a generic label for an unknown tool", () => {
    expect(toolStatusLabel("some_new_tool")).toBe("Using some_new_tool…");
  });

  it("uses the curated label with no subject when input is missing/odd", () => {
    expect(toolStatusLabel("wikidata_query")).toBe("Querying Wikidata…");
    expect(toolStatusLabel("wikidata_query", null)).toBe("Querying Wikidata…");
    expect(toolStatusLabel("wikidata_query", "nope")).toBe(
      "Querying Wikidata…"
    );
    // Present but blank subject still drops the suffix.
    expect(toolStatusLabel("wikidata_query", { query: "   " })).toBe(
      "Querying Wikidata…"
    );
  });

  it("folds in a query/search/title subject (preferring query)", () => {
    expect(toolStatusLabel("wikidata_query", { query: "Marie Curie" })).toBe(
      "Querying Wikidata: “Marie Curie”…"
    );
    expect(toolStatusLabel("openalex_search", { search: "graphene" })).toBe(
      "Searching scholarly works: “graphene”…"
    );
    // query wins when several are present.
    expect(
      toolStatusLabel("wikidata_query", { query: "a", search: "b", title: "c" })
    ).toBe("Querying Wikidata: “a”…");
  });

  it("names the article(s) for wikipedia_summary's `titles` array", () => {
    expect(
      toolStatusLabel("wikipedia_summary", { titles: ["Marie Curie"] })
    ).toBe("Reading Wikipedia: “Marie Curie”…");
    // Several titles → name the first, count the rest.
    expect(
      toolStatusLabel("wikipedia_summary", {
        titles: ["Marie Curie", "Pierre Curie", "Radium"],
      })
    ).toBe("Reading Wikipedia: “Marie Curie” +2 more…");
    // Empty / all-blank → bare label.
    expect(toolStatusLabel("wikipedia_summary", { titles: [] })).toBe(
      "Reading Wikipedia…"
    );
    expect(toolStatusLabel("wikipedia_summary", { titles: ["  "] })).toBe(
      "Reading Wikipedia…"
    );
  });

  it("names the indicator + countries for world_bank", () => {
    expect(
      toolStatusLabel("world_bank", {
        countries: ["FR", "DE"],
        indicator: "SP.POP.TOTL",
      })
    ).toBe("Fetching World Bank data: “SP.POP.TOTL — FR, DE”…");
    // >2 countries collapse to a count; missing indicator drops the dash.
    expect(
      toolStatusLabel("world_bank", { countries: ["FR", "DE", "ES", "IT"] })
    ).toBe("Fetching World Bank data: “4 countries”…");
    // No countries → bare label.
    expect(toolStatusLabel("world_bank", { indicator: "SP.POP.TOTL" })).toBe(
      "Fetching World Bank data…"
    );
  });

  it("uses 'for' phrasing for the search tools", () => {
    expect(toolStatusLabel("search_images", { query: "cats" })).toBe(
      "Searching for images for “cats”…"
    );
    expect(toolStatusLabel("web_search", { query: "tariffs 2026" })).toBe(
      "Searching the web for “tariffs 2026”…"
    );
  });
});

describe("toolResultStatus", () => {
  it("returns null for unparseable JSON", () => {
    expect(toolResultStatus("wikidata_query", "not json")).toBeNull();
  });

  it("returns null for render_* tools (no meaningful count)", () => {
    expect(
      toolResultStatus("render_table", JSON.stringify({ rows: [{ a: 1 }] }))
    ).toBeNull();
  });

  it("returns null when the count is zero or the shape is wrong", () => {
    expect(
      toolResultStatus("wikidata_query", JSON.stringify({ rows: [] }))
    ).toBeNull();
    expect(
      toolResultStatus("wikidata_query", JSON.stringify({ rows: "nope" }))
    ).toBeNull();
  });

  it("counts results per tool shape with correct pluralization", () => {
    expect(
      toolResultStatus("wikidata_query", JSON.stringify({ rows: [1, 2, 3] }))
    ).toBe("Got 3 results — shaping…");
    expect(
      toolResultStatus("wikidata_query", JSON.stringify({ rows: [1] }))
    ).toBe("Got 1 result — shaping…");
    expect(
      toolResultStatus("wikidata_search", JSON.stringify({ results: [1, 2] }))
    ).toBe("Got 2 results — shaping…");
    expect(
      toolResultStatus("world_bank", JSON.stringify({ series: [1, 2, 3, 4] }))
    ).toBe("Got 4 results — shaping…");
  });

  it("uses the 'image' noun for search_images", () => {
    expect(
      toolResultStatus("search_images", JSON.stringify({ images: [1, 2] }))
    ).toBe("Got 2 images — shaping…");
    expect(
      toolResultStatus("search_images", JSON.stringify({ images: [1] }))
    ).toBe("Got 1 image — shaping…");
  });

  it("falls back to a bare top-level array count", () => {
    expect(toolResultStatus("wikidata_query", JSON.stringify([1, 2, 3]))).toBe(
      "Got 3 results — shaping…"
    );
  });
});

describe("correctionDirective", () => {
  it("names the offending tool and stays terse", () => {
    const text = correctionDirective("render_chart");
    expect(text).toContain("render_chart");
    expect(text).toContain("[system]");
    expect(text).toContain("no usable rows/data");
  });
});

describe("buildTools", () => {
  it("always includes base + data + render tools", () => {
    const tools = buildTools({ graphMode: false });
    expect(tools.length).toBe(BASE + DATA + RENDER);
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_current_datetime");
    expect(names).toContain("render_table");
    expect(names).toContain("wikidata_query");
    expect(names).not.toContain("build_knowledge_graph");
    expect(names).not.toContain("web_search");
  });

  it("adds build_knowledge_graph only in graph mode", () => {
    const tools = buildTools({ graphMode: true });
    expect(tools.map((t) => t.name)).toContain("build_knowledge_graph");
  });

  it("adds web_search only for the claude provider", () => {
    expect(
      buildTools({ graphMode: false, provider: "claude" }).map((t) => t.name)
    ).toContain("web_search");
    expect(
      buildTools({ graphMode: false, provider: "google" }).map((t) => t.name)
    ).not.toContain("web_search");
    expect(buildTools({ graphMode: false }).map((t) => t.name)).not.toContain(
      "web_search"
    );
  });
});

describe("toOpenAITools", () => {
  // toOpenAITools only ever emits function tools; narrow the union so we can read
  // `.function` without TS complaining about the (never-produced) custom variant.
  const fns = (tools: ReturnType<typeof toOpenAITools>) =>
    tools.filter((t) => t.type === "function");

  it("wraps each tool in the function envelope", () => {
    const out = fns(toOpenAITools(buildTools({ graphMode: false })));
    expect(out.length).toBe(BASE + DATA + RENDER);
    const dt = out.find((t) => t.function.name === "get_current_datetime");
    expect(dt?.type).toBe("function");
    expect(dt?.function.description).toBeTruthy();
    expect(dt?.function.parameters).toBeDefined();
  });

  it("filters out the server-side web_search tool (no input_schema)", () => {
    const out = fns(
      toOpenAITools(buildTools({ graphMode: false, provider: "claude" }))
    );
    expect(out.map((t) => t.function.name)).not.toContain("web_search");
    // every other claude tool survives
    expect(out.length).toBe(BASE + DATA + RENDER);
  });
});

describe("interleave", () => {
  it("alternates equal-length inputs", () => {
    expect(interleave([1, 3, 5], [2, 4, 6])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps the tail of the longer input", () => {
    expect(interleave([1, 2, 3], [9])).toEqual([1, 9, 2, 3]);
    expect(interleave([9], [1, 2, 3])).toEqual([9, 1, 2, 3]);
  });

  it("handles empty inputs", () => {
    expect(interleave<number>([], [])).toEqual([]);
    expect(interleave([1, 2], [])).toEqual([1, 2]);
    expect(interleave([], [1, 2])).toEqual([1, 2]);
  });
});

describe("capCell", () => {
  it("leaves short values untouched", () => {
    expect(capCell("hello")).toBe("hello");
    expect(capCell("")).toBe("");
  });

  it("leaves a value exactly at the cap untouched", () => {
    const at = "x".repeat(200);
    expect(capCell(at)).toBe(at);
  });

  it("truncates an over-cap value to 200 chars with an ellipsis", () => {
    const over = "y".repeat(250);
    const out = capCell(over);
    expect(out.length).toBe(200);
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, 199)).toBe("y".repeat(199));
  });
});

describe("stripHtml", () => {
  it("returns undefined for empty/undefined input", () => {
    expect(stripHtml(undefined)).toBeUndefined();
    expect(stripHtml("")).toBeUndefined();
    expect(stripHtml("   ")).toBeUndefined();
    expect(stripHtml("<p></p>")).toBeUndefined();
  });

  it("strips tags and decodes the common entities", () => {
    expect(stripHtml("<b>Marie</b> &amp; Pierre")).toBe("Marie & Pierre");
    expect(stripHtml("a &lt;tag&gt; &quot;q&quot; &#39;x&apos;")).toBe(
      "a <tag> \"q\" 'x'"
    );
    expect(stripHtml("a&nbsp;b")).toBe("a b");
  });

  it("collapses whitespace and trims", () => {
    expect(stripHtml("  <p>one\n\ttwo   three</p>  ")).toBe("one two three");
  });

  it("truncates very long text to 300 chars with a trailing ...", () => {
    const long = `<p>${"z".repeat(400)}</p>`;
    const out = stripHtml(long);
    expect(out).toBeDefined();
    expect(out?.length).toBe(300);
    expect(out?.endsWith("...")).toBe(true);
  });
});
