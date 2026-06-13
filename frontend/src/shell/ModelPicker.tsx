import * as Select from "@radix-ui/react-select";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
import { apiFetch } from "../lib/queryClient";
import { Tooltip } from "./Tooltip";

// Mirrors the backend ModelOption (src/models.ts). `provider` tags which service
// owns the model so the picker can group them; the wire contract is unchanged —
// we still send/persist a single provider-qualified model id.
export type Provider = "claude" | "google" | "deepseek" | "mistral";

export interface ModelOption {
  id: string;
  provider: Provider;
  label: string;
  blurb: string;
  // Whether the model's provider currently passes the backend's live health
  // probe. The picker shows only available models; the label lookup uses the
  // full list so it can still name a past session's model even if its provider
  // is momentarily down. Absent/true = available.
  available?: boolean;
}

// Human-readable group headers, and the order groups appear in. Anthropic first.
const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Anthropic",
  google: "Google",
  deepseek: "DeepSeek",
  mistral: "Mistral",
};

// The picker's options are the allowlist filtered to providers passing a live
// health probe (server-side, ~60s TTL — see GET /api/models). So unlike a static
// allowlist this can change within a session as a provider recovers or fails; we
// use a finite staleTime that roughly tracks the server TTL rather than caching
// forever. TanStack still dedups the fetch across every mounted picker (and the
// sidebar, which reuses this to label sessions by their saved model).
export function useModels(): ModelOption[] {
  const { data } = useQuery({
    queryKey: ["models"],
    queryFn: () => apiFetch<{ models: ModelOption[] }>("/api/models"),
    staleTime: 60_000,
    select: (d) => d.models,
  });
  return data ?? [];
}

// Maps a model id to its short label (e.g. "claude-sonnet-4-6" → "Sonnet 4.6"),
// using the same cached allowlist the picker renders. Returns a lookup function
// rather than a single label so the sidebar can label every session in its list
// from one fetch.
//
// A null/undefined id means the conversation never explicitly chose a model, so
// it ran on the server default — we resolve that to the first allowlist entry's
// label (the default everywhere) rather than showing nothing. Only an id we
// can't resolve at all (allowlist not loaded yet) yields null.
export function useModelLabel(): (
  id: string | null | undefined
) => string | null {
  const models = useModels();
  return (id) => {
    if (!id) return models[0]?.label ?? null;
    return models.find((m) => m.id === id)?.label ?? models[0]?.label ?? null;
  };
}

interface ModelPickerProps {
  /** The currently selected model id, or undefined for the server default. */
  value: string | undefined;
  /** Called with the chosen model id when the user picks one. */
  onChange: (model: string) => void;
  disabled?: boolean;
}

// The model dropdown in the chat footer. Lists the backend's allowlist (one
// fetch, cached). The selected value follows the active conversation; choosing
// one persists it to the session (handled by the parent). Built on Radix Select
// (replaced a native <select> + a cross-browser width-hugging hack): the custom
// trigger hugs its content for free, and the menu themes with the app's tokens
// and shows each model's blurb — which a native <option> couldn't.
export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
  const allModels = useModels();

  // The picker offers only models whose provider passed the backend health probe
  // (`available !== false`). The session's currently-saved model is always kept
  // selectable even if its provider just went down, so the control still reflects
  // what the conversation would use rather than silently snapping to another model.
  const models = allModels.filter(
    (m) => m.available !== false || m.id === value
  );

  // Until the list loads (or if it failed), render nothing rather than an empty
  // select — the conversation still works on the server default.
  if (models.length === 0) return null;

  // The trigger shows the session's model if set, else the first option (the
  // default), so the control always reflects what a turn would actually use.
  const selected = value ?? models[0]?.id;
  const selectedLabel = models.find((m) => m.id === selected)?.label ?? "";

  // Group models under their provider for headers, in PROVIDER_LABELS order.
  // Within a group the backend's allowlist order is preserved. Only render groups
  // that actually have models, so an absent provider leaves no empty header.
  const providerOrder = Object.keys(PROVIDER_LABELS) as Provider[];
  const groups = providerOrder
    .map((provider) => ({
      provider,
      items: models.filter((m) => m.provider === provider),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <Select.Root value={selected} onValueChange={onChange} disabled={disabled}>
      <Tooltip
        label="Choose which model answers"
        side="top"
        className="min-w-0"
      >
        <Select.Trigger
          aria-label="Model"
          // Hugs its content (no width hack); ≥44px tall on mobile per the rule.
          className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-lg border border-transparent bg-transparent py-1.5 pl-1.5 pr-1 text-xs text-content-muted transition-colors hover:bg-border-strong hover:text-content focus:outline-none disabled:opacity-50 data-[state=open]:bg-border-strong data-[state=open]:text-content max-md:py-2.5 max-md:text-sm"
        >
          <Select.Value placeholder={selectedLabel} />
          <Select.Icon>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </Select.Icon>
        </Select.Trigger>
      </Tooltip>
      <Select.Portal>
        <Select.Content
          position="popper"
          side="top"
          sideOffset={6}
          align="end"
          className="z-9999 max-h-[min(24rem,var(--radix-select-content-available-height))] overflow-hidden rounded-lg border border-border-strong bg-surface-raised shadow-lg"
        >
          <Select.Viewport className="p-1">
            {groups.map((g, gi) => (
              <Select.Group key={g.provider}>
                <Select.Label
                  className={`px-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-content-subtle ${gi === 0 ? "pt-1" : "pt-2"}`}
                >
                  {PROVIDER_LABELS[g.provider]}
                </Select.Label>
                {g.items.map((m) => (
                  <ModelItem key={m.id} model={m} />
                ))}
              </Select.Group>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

// One selectable model row: label + blurb + a check on the active model. ≥44px
// tall on mobile (the whole row is the tap target).
function ModelItem({ model }: { model: ModelOption }) {
  return (
    <Select.Item
      value={model.id}
      className="relative flex cursor-pointer select-none flex-col gap-0.5 rounded px-2 py-1.5 pr-7 text-content outline-none data-highlighted:bg-elevated max-md:py-2.5"
    >
      <Select.ItemText>
        <span className="text-xs font-medium max-md:text-sm">
          {model.label}
        </span>
      </Select.ItemText>
      {model.blurb && (
        <span className="text-[0.7rem] leading-snug text-content-subtle">
          {model.blurb}
        </span>
      )}
      <Select.ItemIndicator className="absolute right-2 top-2">
        <Check className="h-3.5 w-3.5 text-neon-cyan" aria-hidden />
      </Select.ItemIndicator>
    </Select.Item>
  );
}
