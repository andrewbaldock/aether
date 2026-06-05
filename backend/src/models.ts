// The set of Claude models the user is allowed to pick from in the UI. Kept as
// a strict allowlist: the chat route validates the client-supplied model against
// this before it ever reaches the Anthropic SDK, so an arbitrary string can't be
// passed through. Order here is the order shown in the picker.
export interface ModelOption {
  /** The Anthropic model id sent to the API. */
  id: string;
  /** Short label shown in the dropdown. */
  label: string;
  /** One-line description of the trade-off. */
  blurb: string;
}

// Order matters: the FIRST entry is what the picker shows (and uses) when a
// conversation hasn't explicitly chosen a model. Keep Sonnet first so it's the
// default everywhere — it must also match DEFAULT_MODEL below.
export const MODELS: ModelOption[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    blurb: "Balanced — the default",
  },
  {
    id: "claude-opus-4-8",
    label: "Opus 4.8",
    blurb: "Most capable — best for hard reasoning",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    blurb: "Fastest — quick, lightweight turns",
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
