import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/queryClient";
import { Tooltip } from "./Tooltip";

export interface ModelOption {
  id: string;
  label: string;
  blurb: string;
}

// The allowlist never changes within a session, so a long staleTime keeps it
// cached app-wide; TanStack dedups the fetch across every mounted picker.
function useModels(): ModelOption[] {
  const { data } = useQuery({
    queryKey: ["models"],
    queryFn: () => apiFetch<{ models: ModelOption[] }>("/api/models"),
    staleTime: Number.POSITIVE_INFINITY,
    select: (d) => d.models,
  });
  return data ?? [];
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
  const models = useModels();

  // Until the list loads (or if it failed), render nothing rather than an empty
  // select — the conversation still works on the server default.
  if (models.length === 0) return null;

  // The select shows the session's model if set, else the first option (the
  // default), so the control always reflects what a turn would actually use.
  const selected = value ?? models[0]?.id;

  return (
    <Tooltip label="Choose which Claude model answers" side="top">
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Claude model"
        className="rounded-lg border border-transparent bg-transparent py-1.5 pl-1.5 pr-1 text-xs text-content-muted hover:bg-border-strong hover:text-content focus:outline-none disabled:opacity-50 max-md:py-2.5 max-md:text-sm"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id} className="text-content">
            {m.label}
          </option>
        ))}
      </select>
    </Tooltip>
  );
}
