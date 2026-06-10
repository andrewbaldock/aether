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
}

const TIMEOUT_MS = 5000;

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

export async function checkHealth(): Promise<HealthResult> {
  const [supabase, claude, google, deepseek, mistral] = await Promise.all([
    checkSupabase(),
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

  return { supabase, providers: { claude, google, deepseek, mistral } };
}
