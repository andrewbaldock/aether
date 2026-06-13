// The set of models the user is allowed to pick from in the UI. Kept as a strict
// allowlist: the chat route validates the client-supplied model against this
// before it ever reaches a provider SDK, so an arbitrary string can't be passed
// through. Order here is the order shown in the picker.
//
// Multi-provider: each entry carries the provider that owns it. The request still
// sends a single `model` string; the LLM factory looks up the provider from the id
// (see `providerForModel`) and routes to the matching client. There is no separate
// provider field on the wire or in the DB — the model id IS provider-qualified.

// The providers we route to. "claude" → Anthropic SDK; the rest share one
// OpenAI-compatible client (they all expose /chat/completions). Adding a provider
// here means wiring its case in llm.ts's factory — never list one whose key/route
// isn't implemented, or the picker offers a model that then throws.
export type Provider = "claude" | "google" | "deepseek" | "mistral";

export interface ModelOption {
  /** The model id sent to the provider's API. */
  id: string;
  /** Which provider owns this model — selects the client in llm.ts. */
  provider: Provider;
  /** Short label shown in the dropdown. */
  label: string;
  /** One-line description of the trade-off. */
  blurb: string;
  /**
   * Whether this model's provider currently passes a live health probe. Set by
   * GET /api/models (not stored here — the static allowlist is always "all"). The
   * picker hides models where this is false; absent/true means available.
   */
  available?: boolean;
}

// Human-readable provider names for the picker's group headers. Order of the keys
// here is also the group display order (Anthropic first).
export const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Anthropic",
  google: "Google",
  deepseek: "DeepSeek",
  mistral: "Mistral",
};

// Order matters: the FIRST entry is what the picker shows (and uses) when a
// conversation hasn't explicitly chosen a model. Keep Sonnet first so it's the
// default everywhere — it must also match DEFAULT_MODEL below.
//
// The non-Claude entries are all free-tier models (no credit card): Gemini Flash,
// Mistral Small (Experiment plan), DeepSeek V4 Flash (free trial credits, then
// very cheap). Model ids verified against each provider's live docs (June 2026) —
// they drift, so re-check when adding more. Notably: deepseek-chat is deprecated
// 2026-07-24 (use deepseek-v4-flash); the current free Gemini Flash is 3.5.
export const MODELS: ModelOption[] = [
  {
    id: "claude-sonnet-4-6",
    provider: "claude",
    label: "Sonnet 4.6",
    blurb: "Balanced — the default",
  },
  {
    id: "claude-opus-4-8",
    provider: "claude",
    label: "Opus 4.8",
    blurb: "Most capable — best for hard reasoning",
  },
  {
    id: "claude-haiku-4-5-20251001",
    provider: "claude",
    label: "Haiku 4.5",
    blurb: "Fastest — quick, lightweight turns",
  },
  {
    id: "gemini-3.5-flash",
    provider: "google",
    label: "Gemini 3.5 Flash",
    blurb: "Google — fast, free tier",
  },
  {
    id: "gemini-3.1-flash-lite",
    provider: "google",
    label: "Gemini 3.1 Flash-Lite",
    blurb: "Google — lightest, free tier",
  },
  {
    id: "deepseek-v4-flash",
    provider: "deepseek",
    label: "DeepSeek V4 Flash",
    blurb: "DeepSeek — cheap, strong reasoning",
  },
  {
    id: "mistral-small-latest",
    provider: "mistral",
    label: "Mistral Small",
    blurb: "Mistral — open weights, free tier",
  },
];

// The model used when the request names none (and no ANTHROPIC_MODEL override is
// set). Must be one of MODELS above.
export const DEFAULT_MODEL = "claude-sonnet-4-6";

// Returns the model id if it's in the allowlist, else undefined. Used by the
// chat route to reject anything not offered in the picker.
export function resolveModel(candidate: unknown): string | undefined {
  if (typeof candidate !== "string") return undefined;
  return MODELS.some((m) => m.id === candidate) ? candidate : undefined;
}

// The provider that owns a model id, or undefined if the id isn't in the
// allowlist. The LLM factory uses this to route a per-conversation model pick to
// the right client. Pass an already-validated id (or undefined to mean "default").
export function providerForModel(id: string | undefined): Provider | undefined {
  const target = id ?? DEFAULT_MODEL;
  return MODELS.find((m) => m.id === target)?.provider;
}
