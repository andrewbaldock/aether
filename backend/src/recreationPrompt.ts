import Anthropic from "@anthropic-ai/sdk";

// Backfill the "recreation prompt" (the summary/blurb a widget's back-face seeds
// from) for widgets generated BEFORE summary was required. One cheap, best-effort
// Haiku call per widget that's missing it — mirrors generateTitle in llm.ts: JSON
// in, one sentence out, returns null on any failure (never throws into the caller).
//
// We feed the model a TRIMMED view of the spec (title + structural skeleton, not the
// full row/point data) so the call stays small — enough to describe what the widget
// shows without re-sending every cell.

type WidgetKind = "table" | "chart" | "timeline" | "images";

const NOUN: Record<WidgetKind, string> = {
  table: "table",
  chart: "chart",
  timeline: "timeline",
  images: "image gallery",
};

// Pull just enough of a spec to describe it, capping array lengths so a huge widget
// can't blow up the prompt.
function skeleton(kind: WidgetKind, spec: Record<string, unknown>): unknown {
  const title = typeof spec.title === "string" ? spec.title : undefined;
  switch (kind) {
    case "table":
      return { title, columns: (spec.columns as unknown[])?.slice(0, 20) };
    case "chart":
      return {
        title,
        type: spec.type,
        xKey: spec.xKey,
        series: spec.series,
        yLabel: spec.yLabel,
      };
    case "timeline": {
      const items = Array.isArray(spec.items) ? spec.items : [];
      return {
        title,
        count: items.length,
        sample: items.slice(0, 12),
        groups: spec.groups,
      };
    }
    case "images": {
      const images = Array.isArray(spec.images) ? spec.images : [];
      return {
        title,
        count: images.length,
        captions: images
          .slice(0, 12)
          .map((im) =>
            im && typeof im === "object"
              ? (im as Record<string, unknown>).caption
              : undefined
          ),
      };
    }
  }
}

// Returns one descriptive sentence for the widget, or null on failure.
export async function backfillRecreationPrompt(
  kind: WidgetKind,
  spec: Record<string, unknown>
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 96,
      system:
        `Write ONE precise sentence describing what this ${NOUN[kind]} shows — ` +
        "accurate enough that someone could reproduce it from the sentence alone " +
        "(the content, the dimensions/scope, the range). Reply with ONLY the " +
        "sentence — no preamble, no quotes, no code fences.",
      messages: [
        { role: "user", content: JSON.stringify(skeleton(kind, spec)) },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "")
      .trim();
    return text.length > 0 ? text.slice(0, 300) : null;
  } catch (err) {
    console.error("backfillRecreationPrompt failed:", err);
    return null;
  }
}

// Walk a widget snapshot, backfill the recreation prompt on any entry whose
// summary/blurb is missing or empty, and return { snapshot, filled }. Capped so one
// request can't fan out into dozens of model calls. Pure-ish: never throws; a failed
// per-widget call just leaves that entry untouched. `entries` are the serialised
// `{ id, spec }` objects the frontend stores.
const MAX_BACKFILLS = 12;

function promptField(kind: WidgetKind): "summary" | "blurb" {
  return kind === "images" ? "blurb" : "summary";
}

function needsPrompt(kind: WidgetKind, spec: Record<string, unknown>): boolean {
  const v = spec[promptField(kind)];
  return typeof v !== "string" || v.trim().length === 0;
}

export async function backfillSnapshotPrompts(snapshot: {
  table: unknown[] | null;
  chart: unknown[] | null;
  timeline: unknown[] | null;
  images: unknown[] | null;
}): Promise<{ filled: number }> {
  let budget = MAX_BACKFILLS;
  let filled = 0;

  for (const kind of ["table", "chart", "timeline", "images"] as const) {
    const arr = snapshot[kind];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (budget <= 0) return { filled };
      if (!entry || typeof entry !== "object") continue;
      const spec = (entry as { spec?: unknown }).spec;
      if (!spec || typeof spec !== "object") continue;
      const s = spec as Record<string, unknown>;
      if (!needsPrompt(kind, s)) continue;
      budget--;
      const prompt = await backfillRecreationPrompt(kind, s);
      if (prompt) {
        s[promptField(kind)] = prompt;
        filled++;
      }
    }
  }
  return { filled };
}
