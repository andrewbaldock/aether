/**
 * build.ts — generate / incrementally update Aether's architecture diagram.
 *
 *   bun run tools/architecture-diagram/build.ts            # generate or update
 *   bun run tools/architecture-diagram/build.ts --full     # ignore existing, regenerate from scratch
 *   bun run tools/architecture-diagram/build.ts --no-render # skip the draw.io SVG export
 *   bun run tools/architecture-diagram/build.ts --dry      # print the XML, write nothing
 *
 * Two-phase, by design:
 *   1. scan.ts builds a deterministic digest of the live source (cheap, no tokens).
 *   2. Claude turns the digest into a draw.io .drawio XML — a FULL build the first
 *      time (slow), then INCREMENTAL edits of the existing XML thereafter (cheap):
 *      it's handed the current diagram + the new digest and told to add/adjust only
 *      what changed, preserving manual layout.
 *
 * Output (committed to the repo):
 *   docs/diagrams/architecture.drawio       — editable source of truth (open in draw.io)
 *   docs/diagrams/architecture.drawio.svg   — rendered SVG, embedded in README + ARCHITECTURE.md
 *                                             (--embed-diagram keeps it re-editable in draw.io)
 *
 * The model: read from ANTHROPIC_API_KEY (backend/.env is auto-loaded by bun if you
 * run from the repo root). Uses the Anthropic SDK already vendored in backend/.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "../../backend/node_modules/@anthropic-ai/sdk/index.mjs";
import { buildDigest } from "./scan.ts";

const ROOT = join(import.meta.dir, "..", "..");
const OUT_DIR = join(ROOT, "docs", "diagrams");
const DRAWIO = join(OUT_DIR, "architecture.drawio");
const SVG = join(OUT_DIR, "architecture.drawio.svg");
const DRAWIO_APP = "/Applications/draw.io.app/Contents/MacOS/draw.io";

// Sonnet is the right tier here: the XML is large and structural, not a one-liner.
const MODEL = process.env.AETHER_DIAGRAM_MODEL ?? "claude-sonnet-4-6";
const MAX_TOKENS = 32000;

const args = new Set(process.argv.slice(2));
const FULL = args.has("--full");
const DRY = args.has("--dry");
const NO_RENDER = args.has("--no-render");

function log(msg: string) {
  console.log(`\x1b[36m▸\x1b[0m ${msg}`);
}

/** Pull the API key from env or backend/.env (bun doesn't auto-load .env from a sibling pkg). */
function loadApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const envPath = join(ROOT, "backend", ".env");
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, "utf8").match(
      /^\s*ANTHROPIC_API_KEY\s*=\s*(.+)\s*$/m
    );
    if (m) return m[1].replace(/^["']|["']$/g, "").trim();
  }
  console.error(
    "\x1b[31m✗ ANTHROPIC_API_KEY not found.\x1b[0m Set it in the environment or backend/.env."
  );
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a precise software-architecture diagrammer. You produce draw.io
(diagrams.net) documents as raw mxGraphModel XML wrapped in the <mxfile><diagram> envelope.

HARD REQUIREMENTS
- Output ONLY the XML document. No markdown fences, no prose, no explanation before or after.
- The root element is <mxfile>. It contains one or more <diagram> elements, each holding a
  <mxGraphModel> with <root> containing the cells. Use UNCOMPRESSED XML (plain mxGraphModel,
  not a compressed/base64 <diagram> body) so it diffs cleanly in git and you can edit it later.
- Every shape cell needs an id, a value (label), a style, vertex="1", parent="1", and an
  <mxGeometry x/y/width/height as="geometry"/>. Every edge needs source, target, edge="1",
  parent="1", and an <mxGeometry relative="1" as="geometry"/>.
- Keep ids stable and human-readable (e.g. "be-route-chat", "fe-widget-table", "llm-anthropic").
  Stable ids are what make later incremental edits non-destructive.

DESIGN GOALS (this is for a visual thinker who wants to understand EVERY moving part)
- Big but ORGANIZED. Use clearly labeled container/group boxes (swimlanes or rounded
  containers) as zones, and lay the flow out so it reads top-to-bottom / left-to-right like a
  story: user → frontend → /api proxy → backend → (LLM + data + DB). Group related cells.
- Suggested zones: BROWSER (frontend SPA: shell zones, provider tree, capability registry,
  widgets, data layer/TanStack Query, hooks, PWA service worker) — THE /api PROXY seam —
  BACKEND (Hono routes, agent loop, LLM connector seam, tools) — DOWNSTREAM (LLM providers,
  data-lookup providers, Supabase). Show the SSE event stream and the progressive-render /
  tool_partial path as labeled edges, since those are the heart of the system.
- Use color sparingly and consistently per zone (e.g. one fill per zone). Use edge labels for
  protocols (HTTP, SSE, SPARQL) and key data ("full conversation", "tool_result JSON").
- Distinguish dev-only and aspirational/not-yet-built parts with a dashed style + a note.
- It's fine — encouraged — to span multiple <diagram> pages: e.g. page 1 "System overview",
  page 2 "One chat turn (data flow)", page 3 "Frontend internals", page 4 "Backend internals".
  Pages keep each view legible instead of one unreadable mega-canvas.

ACCURACY
- Use ONLY the facts in the provided digest + notes. Do not invent routes, tools, or providers.
- The digest is scanned from live source, so it is the ground truth.`;

function fullPrompt(digest: unknown, notes: string): string {
  return `Generate a COMPLETE draw.io architecture diagram for the "Aether" project from scratch.

Aether is a conversational explorer: the chat is the interface, and answers are rendered in
whatever form fits best (table, chart, relationship graph, timeline, images — 3D is aspirational).
Two runtimes: a React 19 SPA in the browser, and a Bun + Hono backend that holds all secrets and
talks to the LLM + data providers + Supabase. The frontend reaches the backend via a relative
"/api" proxy. One chat turn streams over SSE; render-tool specs stream progressively via
tool_partial events.

${notes}

Here is the deterministic digest of the live source (ground truth):

\`\`\`json
${JSON.stringify(digest, null, 2)}
\`\`\`

Produce the multi-page draw.io XML now (XML only).`;
}

function incrementalPrompt(
  digest: unknown,
  existingXml: string,
  notes: string
): string {
  return `Update the EXISTING draw.io architecture diagram for "Aether" to match the current
source. This is an INCREMENTAL edit: preserve the existing layout, positions, ids, pages, and
any manual tweaks. ADD cells for new things, REMOVE cells for things that no longer exist, and
fix labels that drifted — but do not gratuitously re-lay-out or rename stable ids. If nothing
material changed, return the diagram essentially unchanged.

${notes}

Current diagram XML:

\`\`\`xml
${existingXml}
\`\`\`

Current deterministic digest of the live source (ground truth):

\`\`\`json
${JSON.stringify(digest, null, 2)}
\`\`\`

Return the FULL updated draw.io XML document (XML only — the complete file, not a patch).`;
}

/** Strip any stray markdown fences and return the <mxfile>…</mxfile> document. */
function extractXml(text: string): string {
  let t = text.trim();
  t = t
    .replace(/^```(?:xml)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = t.indexOf("<mxfile");
  const end = t.lastIndexOf("</mxfile>");
  if (start !== -1 && end !== -1)
    return t.slice(start, end + "</mxfile>".length);
  return t;
}

function renderSvg() {
  if (!existsSync(DRAWIO_APP)) {
    console.warn(
      "\x1b[33m! draw.io desktop not found at " +
        DRAWIO_APP +
        " — skipping SVG render.\x1b[0m\n" +
        "  Install draw.io desktop, or open the .drawio and export an SVG manually."
    );
    return false;
  }
  log("Rendering SVG via draw.io CLI…");
  // --embed-diagram keeps the editable XML inside the SVG; --all-pages would need
  // a multi-page-capable target, so we export page 1 (the overview) as the README image.
  const res = spawnSync(
    DRAWIO_APP,
    [
      "--export",
      "--format",
      "svg",
      "--embed-diagram",
      "--border",
      "16",
      "--output",
      SVG,
      DRAWIO,
    ],
    {
      stdio: "inherit",
      env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ":99" },
    }
  );
  if (res.status !== 0) {
    console.warn(
      "\x1b[33m! draw.io export returned non-zero; SVG may not be updated.\x1b[0m"
    );
    return false;
  }
  return existsSync(SVG);
}

async function main() {
  log(`Scanning source → digest…`);
  const digest = buildDigest();

  const notes =
    "Manual notes (not in the digest): The capability column's 'Tiles' chip == the Bigsail " +
    "canvas (home base). There is an in-app 'AgentDiagram' widget that draws the agent loop — " +
    "show it as one of the widgets. 3D rendering is ASPIRATIONAL (roadmap North Star), not built. " +
    "web_search runs on Anthropic's infra (Claude-only), so it rides the LLM lane, not the data " +
    "lane. The three OpenAI-compatible providers (Google/DeepSeek/Mistral) share ONE client. " +
    "All four LLM providers and every data provider are reached over HTTPS from the backend only.";

  const hasExisting = existsSync(DRAWIO) && !FULL;
  log(
    hasExisting
      ? "Existing diagram found → INCREMENTAL update."
      : FULL
        ? "--full → regenerating from scratch."
        : "No existing diagram → FULL first-time generation (this takes a bit)."
  );

  const apiKey = loadApiKey();
  const client = new Anthropic({ apiKey });

  const userPrompt = hasExisting
    ? incrementalPrompt(digest, readFileSync(DRAWIO, "utf8"), notes)
    : fullPrompt(digest, notes);

  log(`Calling ${MODEL} (streaming)…`);
  // Stream: the XML can take >10min worth of output budget, which the SDK requires
  // streaming for. We accumulate text and print a heartbeat so the run isn't silent.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  let raw = "";
  let chars = 0;
  stream.on("text", (delta) => {
    raw += delta;
    chars += delta.length;
    if (chars > 4000) {
      process.stdout.write(".");
      chars = 0;
    }
  });
  const final = await stream.finalMessage();
  process.stdout.write("\n");

  const xml = extractXml(raw);

  if (!xml.startsWith("<mxfile")) {
    console.error(
      "\x1b[31m✗ Model did not return a valid <mxfile> document.\x1b[0m"
    );
    console.error(raw.slice(0, 500));
    process.exit(1);
  }
  if (final.stop_reason === "max_tokens") {
    console.warn(
      "\x1b[33m! Hit max_tokens — the XML may be truncated. Re-run, or raise MAX_TOKENS.\x1b[0m"
    );
  }

  if (DRY) {
    console.log(xml);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(DRAWIO, xml.endsWith("\n") ? xml : xml + "\n");
  log(`Wrote ${DRAWIO.replace(ROOT + "/", "")}`);

  if (!NO_RENDER) {
    const ok = renderSvg();
    if (ok) log(`Wrote ${SVG.replace(ROOT + "/", "")}`);
  }

  log("Done. Open the .drawio in draw.io to hand-tweak; commit both files.");
}

main().catch((err) => {
  console.error("\x1b[31m✗ Diagram build failed:\x1b[0m", err?.message ?? err);
  process.exit(1);
});
