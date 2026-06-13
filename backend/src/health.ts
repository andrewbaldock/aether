import Anthropic from "@anthropic-ai/sdk";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export interface ProviderResult {
  ok: boolean;
  configured: boolean;
  latencyMs: number;
  error?: string;
}

export interface HealthResult {
  supabase: { ok: boolean; latencyMs: number; error?: string };
  providers: {
    claude: ProviderResult;
    google: ProviderResult;
    deepseek: ProviderResult;
    mistral: ProviderResult;
  };
  dataSources: {
    wikidata: ProviderResult;
    wikidataSearch: ProviderResult;
    worldBank: ProviderResult;
    wikipedia: ProviderResult;
    openalex: ProviderResult;
    wikimedia: ProviderResult;
    unsplash: ProviderResult;
  };
}

const TIMEOUT_MS = 5000;

// Wikidata Query Service and Wikimedia Commons both ask API clients to send a
// descriptive User-Agent with contact info — same value tools.ts uses.
const WIKIMEDIA_USER_AGENT = "Aether/1.0 (https://github.com/baldrocks; demo)";

async function checkSupabase(): Promise<HealthResult["supabase"]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return {
      ok: false,
      latencyMs: 0,
      error: "SUPABASE_URL / SUPABASE_ANON_KEY not set",
    };
  }
  const t0 = Date.now();
  try {
    const db = createSupabaseClient(url, key, {
      auth: { persistSession: false },
    });
    const { error } = await db
      .from("sessions")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    const latencyMs = Date.now() - t0;
    if (error) return { ok: false, latencyMs, error: error.message };
    return { ok: true, latencyMs };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, error: String(err) };
  }
}

async function checkClaude(): Promise<ProviderResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, configured: false, latencyMs: 0 };
  const t0 = Date.now();
  try {
    const client = new Anthropic({ apiKey });
    await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    return { ok: true, configured: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - t0,
      error: String(err),
    };
  }
}

async function checkOpenAICompat(
  baseURL: string,
  apiKeyEnv: string,
  model: string
): Promise<ProviderResult> {
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) return { ok: false, configured: false, latencyMs: 0 };
  const t0 = Date.now();
  try {
    const client = new OpenAI({ apiKey, baseURL });
    await client.chat.completions.create(
      {
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    return { ok: true, configured: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    const msg = String(err);
    // A 401/403 means the key is wrong but the service is reachable — still a failure.
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - t0,
      error: msg,
    };
  }
}

// A keyless data source: there's no API key, so it's always "configured" and the
// check is pure reachability. We test the SERVICE, not a specific query, so any
// 2xx counts — a reachable endpoint that returns empty rows is still healthy.
async function checkKeylessHttp(
  url: string,
  headers?: Record<string, string>
): Promise<ProviderResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return { ok: false, configured: true, latencyMs, error: `HTTP ${res.status}` };
    }
    return { ok: true, configured: true, latencyMs };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - t0,
      error: String(err),
    };
  }
}

// Unsplash is keyed like the LLM providers: unset key ⇒ not configured (amber),
// 401/403 ⇒ reachable but key wrong (still a failure), 2xx ⇒ ok.
async function checkUnsplash(): Promise<ProviderResult> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return { ok: false, configured: false, latencyMs: 0 };
  const t0 = Date.now();
  try {
    const res = await fetch(
      "https://api.unsplash.com/search/photos?query=test&per_page=1",
      {
        headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return { ok: false, configured: true, latencyMs, error: `HTTP ${res.status}` };
    }
    return { ok: true, configured: true, latencyMs };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - t0,
      error: String(err),
    };
  }
}

// Just the four LLM provider probes — the live, billable part of the health
// check, split out so the model picker can gate its dropdown on provider health
// without also running the dozen keyless data-source probes. Each probe is a
// 1-token completion; see the per-provider checkers above.
export async function checkProviders(): Promise<HealthResult["providers"]> {
  const [claude, google, deepseek, mistral] = await Promise.all([
    checkClaude(),
    checkOpenAICompat(
      "https://generativelanguage.googleapis.com/v1beta/openai/",
      "GOOGLE_AI_API_KEY",
      "gemini-3.5-flash"
    ),
    checkOpenAICompat(
      "https://api.deepseek.com/v1",
      "DEEPSEEK_API_KEY",
      "deepseek-v4-flash"
    ),
    checkOpenAICompat(
      "https://api.mistral.ai/v1",
      "MISTRAL_API_KEY",
      "mistral-small-latest"
    ),
  ]);
  return { claude, google, deepseek, mistral };
}

export async function checkHealth(): Promise<HealthResult> {
  const [
    supabase,
    providers,
    wikidata,
    wikidataSearch,
    worldBank,
    wikipedia,
    openalex,
    wikimedia,
    unsplash,
  ] = await Promise.all([
    checkSupabase(),
    checkProviders(),
    // Keyless data sources — lightest request that proves the service answers.
    checkKeylessHttp(
      "https://query.wikidata.org/sparql?format=json&query=" +
        encodeURIComponent("SELECT ?x WHERE { ?x ?p ?o } LIMIT 1"),
      { Accept: "application/sparql-results+json", "User-Agent": WIKIMEDIA_USER_AGENT }
    ),
    // The wbsearchentities resolver lives on www.wikidata.org (the wiki API),
    // a different host from the query service above — probe it separately.
    checkKeylessHttp(
      "https://www.wikidata.org/w/api.php?action=wbsearchentities&search=Earth&language=en&format=json",
      { "User-Agent": WIKIMEDIA_USER_AGENT }
    ),
    checkKeylessHttp("https://api.worldbank.org/v2/country/USA?format=json"),
    checkKeylessHttp(
      "https://en.wikipedia.org/api/rest_v1/page/summary/Aether",
      { "User-Agent": WIKIMEDIA_USER_AGENT }
    ),
    checkKeylessHttp("https://api.openalex.org/works?per_page=1", {
      "User-Agent": WIKIMEDIA_USER_AGENT,
    }),
    checkKeylessHttp(
      "https://commons.wikimedia.org/w/api.php?action=query&meta=siteinfo&format=json",
      { "User-Agent": WIKIMEDIA_USER_AGENT }
    ),
    checkUnsplash(),
  ]);

  return {
    supabase,
    providers,
    dataSources: {
      wikidata,
      wikidataSearch,
      worldBank,
      wikipedia,
      openalex,
      wikimedia,
      unsplash,
    },
  };
}
