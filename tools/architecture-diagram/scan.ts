/**
 * scan.ts — build a structured digest of Aether's "moving parts" from the live source.
 *
 * Pure + deterministic + zero tokens. This is the cheap half of the diagram build:
 * we read the tree and produce a compact JSON of everything the diagram should show
 * (routes, tools, LLM providers, frontend widgets/providers/hooks, deps). Claude then
 * turns that digest into / patches the draw.io XML — so the model never has to read the
 * whole repo, only this digest.
 *
 * Keep this scanner forgiving: it greps for stable patterns and tolerates misses. A
 * missing item just won't appear in the digest; it never throws the build.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");

function read(rel: string): string {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

function safeJson<T>(rel: string): T | null {
  try {
    return JSON.parse(read(rel)) as T;
  } catch {
    return null;
  }
}

/** All matches of a global regex's first capture group, de-duped, in order. */
function matchAll(src: string, re: RegExp): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of src.matchAll(re)) {
    const v = (m[1] ?? "").trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// ── Backend ──────────────────────────────────────────────────────────────────

function scanRoutes() {
  const src = read("backend/src/index.ts");
  const out: { method: string; path: string; devOnly: boolean }[] = [];
  // app.get("/api/...", ...) — capture method + path. Track dev-only by an
  // enclosing `if (import.meta… dev)` block is hard to detect by regex, so we
  // flag the known dev route by name.
  const re = /app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  for (const m of src.matchAll(re)) {
    const method = (m[1] ?? "").toUpperCase();
    const path = m[2] ?? "";
    out.push({ method, path, devOnly: path.includes("/screenshots") });
  }
  return out;
}

function scanTools() {
  const src = read("backend/src/tools.ts");
  // Tool definitions: `name: "tool_name"` inside the TOOLS array. This also
  // catches a few non-tool `name:` keys, so intersect with the known shape:
  // tool names are snake_case identifiers used as `name:` at low indentation.
  // Grab every `name: "<snake_case>"` — tool definitions across the TOOLS array
  // and the Claude-side web_search def. De-dup keeps source order.
  const tools = matchAll(src, /\bname:\s*["'`]([a-z][a-z_]+)["'`]/g).filter(
    (n) => n.includes("_") || n.length > 4
  );

  const streamable =
    matchAll(src, /STREAMABLE_RENDER_TOOLS[^[]*\[([\s\S]*?)\]/g)
      .join(",")
      .match(/["'`]([a-z_]+)["'`]/g)
      ?.map((s) => s.replace(/["'`]/g, "")) ?? [];

  const render = tools.filter(
    (t) => t.startsWith("render_") || t === "build_knowledge_graph"
  );
  // Data-lookup tools = our backend's HTTP fetches. web_search is Claude-side
  // (Anthropic infra), so it's its own lane, not a data-lookup tool.
  const data = tools.filter((t) =>
    /wikidata|world_bank|wikipedia|openalex|search_images|datetime/.test(t)
  );
  const claudeSide = tools.filter((t) => t === "web_search");
  return { all: tools, render, data, claudeSide, streamable };
}

function scanProviders() {
  const src = read("backend/src/models.ts");
  const providerType = src.match(/type\s+Provider\s*=\s*([^;]+);/)?.[1] ?? "";
  const providers = matchAll(providerType, /["'`]([a-z]+)["'`]/g);
  const defaultModel =
    src.match(/DEFAULT_MODEL\s*=\s*["'`]([^"'`]+)["'`]/)?.[1] ?? "";
  const models = matchAll(src, /\bid:\s*["'`]([a-z0-9.-]+)["'`]/gi);
  return { providers, defaultModel, models };
}

function scanSseEvents() {
  const src = read("backend/src/index.ts") + read("backend/src/llm.ts");
  // SSE payloads are emitted as `type: "..."`; also catch the literal [DONE].
  const types = matchAll(src, /\btype:\s*["'`]([a-z_]+)["'`]/g).filter((t) =>
    /text|tool_|status|loop_start|plan|clarify|warning|error|persisted|done/.test(
      t
    )
  );
  return [...new Set([...types, "[DONE]"])];
}

// ── Frontend ─────────────────────────────────────────────────────────────────

function listDir(rel: string): string[] {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return [];
  return readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function scanWidgets() {
  const dirs = listDir("frontend/src/capabilities/widgets");
  // catalog.tsx holds the user-facing capability chips. Their `id`s reference
  // constants (e.g. BIGSAIL_WIDGET.id), so the chip *titles* are the reliable
  // human labels to capture.
  const catalog = read("frontend/src/capabilities/catalog.tsx");
  const catalogTitles = matchAll(catalog, /\btitle:\s*["'`]([^"'`]+)["'`]/g);
  return { dirs, catalogTitles };
}

function scanProvidersTree() {
  // The App.tsx provider nesting is the spine of frontend state. Capture every
  // *Provider used as a JSX tag, in source order.
  const src = read("frontend/src/App.tsx");
  return matchAll(src, /<([A-Z][A-Za-z]*Provider)\b/g);
}

function scanHooks() {
  const fromHooks = readdirSync(join(ROOT, "frontend/src/hooks"), {
    withFileTypes: true,
  })
    .filter((d) => d.isFile() && /^use[A-Z].*\.tsx?$/.test(d.name))
    .map((d) => d.name.replace(/\.tsx?$/, ""));
  const fromShell = existsSync(join(ROOT, "frontend/src/shell"))
    ? readdirSync(join(ROOT, "frontend/src/shell"))
        .filter((f) => /^use[A-Z].*\.tsx?$/.test(f))
        .map((f) => f.replace(/\.tsx?$/, ""))
    : [];
  // Drop the *.test siblings — they're not part of the architecture surface.
  return [...new Set([...fromHooks, ...fromShell])]
    .filter((h) => !h.endsWith(".test"))
    .sort();
}

function scanDeps() {
  type Pkg = {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const fe = safeJson<Pkg>("frontend/package.json");
  const be = safeJson<Pkg>("backend/package.json");
  return {
    frontend: { ...(fe?.dependencies ?? {}) },
    frontendDev: { ...(fe?.devDependencies ?? {}) },
    backend: { ...(be?.dependencies ?? {}) },
    backendDev: { ...(be?.devDependencies ?? {}) },
  };
}

export interface Digest {
  generatedNote: string;
  routes: ReturnType<typeof scanRoutes>;
  tools: ReturnType<typeof scanTools>;
  llm: ReturnType<typeof scanProviders>;
  sseEvents: string[];
  widgets: ReturnType<typeof scanWidgets>;
  providerTree: string[];
  hooks: string[];
  deps: ReturnType<typeof scanDeps>;
}

export function buildDigest(): Digest {
  return {
    generatedNote:
      "Auto-scanned from the live source tree by tools/architecture-diagram/scan.ts. " +
      "Deterministic; no LLM involved in this step.",
    routes: scanRoutes(),
    tools: scanTools(),
    llm: scanProviders(),
    sseEvents: scanSseEvents(),
    widgets: scanWidgets(),
    providerTree: scanProvidersTree(),
    hooks: scanHooks(),
    deps: scanDeps(),
  };
}

// Run directly to inspect the digest: `bun run tools/architecture-diagram/scan.ts`
if (import.meta.main) {
  console.log(JSON.stringify(buildDigest(), null, 2));
}
