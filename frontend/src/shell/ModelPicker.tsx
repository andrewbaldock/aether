import { useEffect, useState } from "react";
import { Tooltip } from "./Tooltip";

export interface ModelOption {
  id: string;
  label: string;
  blurb: string;
}

// Module-level cache + in-flight promise so every mounted picker shares one
// fetch of the allowlist (the options never change within a session).
let cachedModels: ModelOption[] | null = null;
let modelsPromise: Promise<ModelOption[]> | null = null;

function fetchModels(): Promise<ModelOption[]> {
  if (cachedModels) return Promise.resolve(cachedModels);
  modelsPromise ??= fetch("/api/models")
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ models: ModelOption[] }>;
    })
    .then((data) => {
      cachedModels = data.models;
      return cachedModels;
    })
    .catch((err) => {
      console.error("Failed to load model list:", err);
      modelsPromise = null; // allow a retry on the next mount
      return [];
    });
  return modelsPromise;
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
  const [models, setModels] = useState<ModelOption[]>(cachedModels ?? []);

  useEffect(() => {
    let alive = true;
    fetchModels().then((m) => {
      if (alive) setModels(m);
    });
    return () => {
      alive = false;
    };
  }, []);

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
        className="rounded-lg border border-transparent bg-transparent py-1.5 pl-1.5 pr-1 text-xs text-content-muted hover:bg-border-strong hover:text-content focus:outline-none disabled:opacity-50"
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
