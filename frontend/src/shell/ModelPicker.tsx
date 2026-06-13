import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useRef } from "react";
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
// one persists it to the session (handled by the parent).
export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
  const allModels = useModels();
  const spanRef = useRef<HTMLSpanElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

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

  // The select shows the session's model if set, else the first option (the
  // default), so the control always reflects what a turn would actually use.
  const selected = value ?? models[0]?.id;
  const selectedLabel = models.find((m) => m.id === selected)?.label ?? "";

  // Group models under their provider for <optgroup> headers, in PROVIDER_LABELS
  // order. Within a group the backend's allowlist order is preserved. Only render
  // groups that actually have models, so an absent provider leaves no empty header.
  const providerOrder = Object.keys(PROVIDER_LABELS) as Provider[];
  const groups = providerOrder
    .map((provider) => ({
      provider,
      items: models.filter((m) => m.provider === provider),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <Tooltip label="Choose which model answers" side="top" className="min-w-0">
      <div className="relative">
        {/*
          Hidden span that mirrors the selected label. We read its width in
          useLayoutEffect and apply it to the <select>, making the select hug
          its current value across all browsers. field-sizing:content only works
          in Chrome/Safari; Firefox falls back to the widest option, leaving a gap.
        */}
        <span
          ref={spanRef}
          aria-hidden
          className="pointer-events-none invisible absolute whitespace-nowrap px-3 text-xs"
        >
          {selectedLabel}
        </span>
        <SelectWithWidth
          spanRef={spanRef}
          selectRef={selectRef}
          selectedLabel={selectedLabel}
          selected={selected}
          onChange={onChange}
          disabled={disabled}
          groups={groups}
        />
      </div>
    </Tooltip>
  );
}

// Split into its own component so useLayoutEffect can safely access spanRef after render.
function SelectWithWidth({
  spanRef,
  selectRef,
  selectedLabel,
  selected,
  onChange,
  disabled,
  groups,
}: {
  spanRef: React.RefObject<HTMLSpanElement | null>;
  selectRef: React.RefObject<HTMLSelectElement | null>;
  selectedLabel: string;
  selected: string | undefined;
  onChange: (model: string) => void;
  disabled?: boolean;
  groups: { provider: Provider; items: ModelOption[] }[];
}) {
  useLayoutEffect(() => {
    if (spanRef.current && selectRef.current) {
      // +4px for the native dropdown arrow glyph
      selectRef.current.style.width = `${spanRef.current.offsetWidth + 4}px`;
    }
  }, [selectedLabel, spanRef, selectRef]);

  return (
    <select
      ref={selectRef}
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Model"
      className="max-w-full shrink-0 rounded-lg border border-transparent bg-transparent py-1.5 pl-1.5 pr-1 text-xs text-content-muted hover:bg-border-strong hover:text-content focus:outline-none disabled:opacity-50 max-md:py-2.5 max-md:text-sm"
    >
      {groups.map((g) => (
        <optgroup key={g.provider} label={PROVIDER_LABELS[g.provider]}>
          {g.items.map((m) => (
            <option key={m.id} value={m.id} className="text-content">
              {m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
