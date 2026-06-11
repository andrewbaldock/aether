import Anthropic from "@anthropic-ai/sdk";

// The Strongification intelligence pre-pass: a cheap router that decides whether a
// turn is complex enough to warrant planning, and a conditional planner that emits
// an ABSTRACT composition plan (which capabilities + how they relate — never
// coordinates). The plan has two consumers: the agent loop (folded into the
// conversation preamble to steer tool choice) and Bigsail (over the new `plan` SSE
// event, to order cards and draw flowchart edges). The planner knows NOTHING about
// Bigsail — see the frontend mirror in
// frontend/src/capabilities/widgets/Bigsail/plan.ts.
//
// Everything here runs on Haiku regardless of the conversation's selected model
// (like generateTitle) so it's the cheapest call we make, and it's best-effort:
// any failure returns null and the turn proceeds exactly as before.

// Keep the capability vocabulary aligned with the render tools / frontend
// CardCapability. These are the only values a plan intent may carry.
export type PlanCapability =
  | "table"
  | "chart"
  | "timeline"
  | "knowledge-graph"
  | "images";

export interface PlanIntent {
  capability: PlanCapability;
  subject?: string;
}

export interface PlanRelationship {
  from: number; // index into intents
  to: number; // index into intents
  label?: string;
}

export interface CompositionPlan {
  intents: PlanIntent[];
  relationships: PlanRelationship[];
}

const PLANNER_MODEL = "claude-haiku-4-5-20251001";

const VALID_CAPABILITIES: ReadonlySet<string> = new Set<PlanCapability>([
  "table",
  "chart",
  "timeline",
  "knowledge-graph",
  "images",
]);

// --- Router heuristic ------------------------------------------------------
// The cheap gate BEFORE any model call. Most turns ("what's 2+2", "thanks",
// short factual asks) plainly don't need a multi-capability plan; skipping them
// keeps the planner from firing on every turn. We only escalate to the classifier
// when a turn LOOKS like it might compose several capabilities: it's long, or it
// uses shapes that signal multiple outputs ("compare … and chart", "timeline of",
// "table of", "and", "vs"). Conservative on purpose — a false negative just means
// the turn runs as plain ReAct (today's behaviour); a false positive costs one
// cheap Haiku call.

const PLAN_SHAPE_HINTS = [
  /\bcompare\b/i,
  /\bvs\.?\b/i,
  /\bversus\b/i,
  /\btimeline\b/i,
  /\bchart\b/i,
  /\bgraph\b/i,
  /\btable\b/i,
  /\bmap out\b/i,
  /\bbreak down\b/i,
  /\band\b.*\b(chart|table|timeline|graph|images?|map)\b/i,
];

export function mightNeedPlan(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 40) return false; // short turns are almost never multi-capability
  if (PLAN_SHAPE_HINTS.some((re) => re.test(trimmed))) return true;
  // Long, multi-clause asks (several sentences / conjunctions) are plausible
  // candidates even without an explicit shape word.
  const clauses = trimmed.split(/[,;]|\band\b|\bthen\b/i).length;
  return trimmed.length > 160 || clauses >= 3;
}

// --- Planner ---------------------------------------------------------------
// One structured Haiku call. Asks for the ordered capabilities a good answer would
// compose and how they relate, as strict JSON. Best-effort: returns null on any
// failure (no key, bad JSON, empty plan) and the turn runs as plain ReAct.

const PLANNER_SYSTEM = `You are the planner for Aether, a conversational explorer that answers by rendering live widgets beside the chat.

Given the user's latest request, decide which of these capabilities a strong answer would compose, in the order they should appear, and how they relate:
- "table" — structured/tabular data, comparisons, ranked lists
- "chart" — quantitative trends, distributions, comparisons over a dimension
- "timeline" — chronological sequences, histories, schedules
- "knowledge-graph" — entities and how they connect
- "images" — photos/pictures of a subject

Reply with ONLY a JSON object, no prose, of this exact shape:
{"intents":[{"capability":"chart","subject":"short phrase"}],"relationships":[{"from":0,"to":1,"label":"short verb"}]}

Rules:
- intents: ordered; each capability is one of the five above; subject is a short phrase (optional).
- relationships: index pairs into intents (from/to), with an optional short label; only include real relationships, often none.
- Prefer 1-4 intents. If the request needs only a plain text reply, return {"intents":[],"relationships":[]}.
- NEVER include coordinates, sizes, or layout — only which capabilities and how they relate.`;

// Validate + coerce the model's JSON into a CompositionPlan, dropping anything
// malformed. Returns null if there's nothing usable (so callers skip the plan).
function parsePlan(raw: string): CompositionPlan | null {
  let data: unknown;
  try {
    // The model may wrap JSON in prose or a code fence despite instructions —
    // extract the first {...} block defensively.
    const match = raw.match(/\{[\s\S]*\}/);
    data = JSON.parse(match ? match[0] : raw);
  } catch {
    return null;
  }
  if (data == null || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  const rawIntents = Array.isArray(obj.intents) ? obj.intents : [];
  const intents: PlanIntent[] = [];
  for (const it of rawIntents) {
    if (it == null || typeof it !== "object") continue;
    const cap = (it as Record<string, unknown>).capability;
    if (typeof cap !== "string" || !VALID_CAPABILITIES.has(cap)) continue;
    const subject = (it as Record<string, unknown>).subject;
    intents.push({
      capability: cap as PlanCapability,
      ...(typeof subject === "string" && subject.trim()
        ? { subject: subject.trim() }
        : {}),
    });
  }
  if (intents.length === 0) return null; // nothing to compose → no plan

  const rawRels = Array.isArray(obj.relationships) ? obj.relationships : [];
  const relationships: PlanRelationship[] = [];
  for (const r of rawRels) {
    if (r == null || typeof r !== "object") continue;
    const from = (r as Record<string, unknown>).from;
    const to = (r as Record<string, unknown>).to;
    // Indices must point at real intents.
    if (
      typeof from !== "number" ||
      typeof to !== "number" ||
      from < 0 ||
      to < 0 ||
      from >= intents.length ||
      to >= intents.length ||
      from === to
    ) {
      continue;
    }
    const label = (r as Record<string, unknown>).label;
    relationships.push({
      from,
      to,
      ...(typeof label === "string" && label.trim()
        ? { label: label.trim() }
        : {}),
    });
  }

  return { intents, relationships };
}

// Run the router + planner for a turn. Returns the plan when the turn warrants one,
// else null. `message` is the user's latest turn content. Best-effort throughout —
// never throws; a failure just means no plan (plain ReAct).
export async function planTurn(
  message: string
): Promise<CompositionPlan | null> {
  if (!message || !mightNeedPlan(message)) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: PLANNER_MODEL,
      max_tokens: 256,
      system: PLANNER_SYSTEM,
      messages: [{ role: "user", content: message }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return parsePlan(text);
  } catch (err) {
    console.error("planTurn failed:", err);
    return null;
  }
}

// Render the plan as a short natural-language preamble folded into the conversation
// so the agent loop is STEERED (not constrained) by it. Kept terse — it rides the
// conversation cache, appended once before the loop.
export function planPreamble(plan: CompositionPlan): string {
  const parts = plan.intents.map((it) =>
    it.subject ? `${it.capability} of ${it.subject}` : it.capability
  );
  let text = `Composition plan for this turn: render ${parts.join(", then ")}.`;
  if (plan.relationships.length > 0) {
    const rels = plan.relationships
      .map((r) => {
        const from = plan.intents[r.from]?.capability;
        const to = plan.intents[r.to]?.capability;
        return `${from} ${r.label ?? "relates to"} ${to}`;
      })
      .join("; ");
    text += ` Relationships: ${rels}.`;
  }
  text +=
    " Use the appropriate render tools to produce these; you may also add or omit one if the conversation calls for it.";
  return text;
}
