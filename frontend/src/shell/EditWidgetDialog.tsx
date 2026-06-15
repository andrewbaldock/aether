import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import type { CardCapability } from "../capabilities/widgets/Bigsail/cards";
import {
  recreationPromptOf,
  withRecreationPrompt,
} from "../capabilities/widgets/Bigsail/useCardRegenerate";
import { parseChartSpec } from "../capabilities/widgets/Chart/useChartState";
import { parseImagesSpec } from "../capabilities/widgets/Images/useImagesState";
import { parseTableSpec } from "../capabilities/widgets/Table/useTableState";
import { parseTimelineSpec } from "../capabilities/widgets/Timeline/useTimelineState";

// Edit a widget's recreation prompt AND its raw params in a modal — the tool-tab
// counterpart to the Bigsail card's flip (the gear opens THIS instead of flipping).
// Built on Radix Dialog (vs ConfirmDialog's AlertDialog) for a non-destructive form
// with its own sizing + scroll.
//
// Save validates the edited params JSON through the SAME canonical parser the widget
// renders from (parseTableSpec etc.), so the dialog can never write a spec the
// renderer can't read. The recreation prompt is written into the right field
// (summary, or blurb for images) via withRecreationPrompt before validation.
//
// readOnly renders everything disabled with no Save — for a future shared/non-owner
// view where the prompt + params are visible but not editable.

const PARSERS: Record<CardCapability, ((raw: string) => unknown) | null> = {
  table: parseTableSpec,
  chart: parseChartSpec,
  timeline: parseTimelineSpec,
  images: parseImagesSpec,
  // The knowledge graph isn't an entry-based widget and isn't edited here.
  "knowledge-graph": null,
};

const NOUN: Record<CardCapability, string> = {
  table: "table",
  chart: "chart",
  timeline: "timeline",
  images: "gallery",
  "knowledge-graph": "graph",
};

export function EditWidgetDialog({
  open,
  onOpenChange,
  type,
  spec,
  onSave,
  readOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: CardCapability;
  spec: unknown;
  // Receives the validated next spec (prompt folded in + params re-parsed).
  onSave: (nextSpec: unknown) => void;
  readOnly?: boolean;
}) {
  const noun = NOUN[type];
  const [prompt, setPrompt] = useState("");
  const [paramsText, setParamsText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Re-seed the fields from the current spec each time the dialog opens, so it always
  // reflects the live widget (and a reopen after an edit shows the new values).
  useEffect(() => {
    if (!open) return;
    setPrompt(recreationPromptOf(type, spec));
    setParamsText(JSON.stringify(spec, null, 2));
    setError(null);
  }, [open, type, spec]);

  function onSaveClick() {
    const parse = PARSERS[type];
    if (!parse) return;
    let raw: unknown;
    try {
      raw = JSON.parse(paramsText);
    } catch {
      setError("Params must be valid JSON.");
      return;
    }
    // Fold the edited prompt into the params, then validate the whole thing through
    // the canonical parser so we never store an unrenderable spec.
    const withPrompt = withRecreationPrompt(type, raw, prompt.trim());
    const validated = parse(JSON.stringify(withPrompt));
    if (!validated) {
      setError(`These params don't form a valid ${noun}.`);
      return;
    }
    onSave(validated);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-9998 bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-9999 flex max-h-[min(40rem,calc(100vh-2rem))] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border-strong bg-surface-raised p-5 shadow-2xl focus:outline-none">
          <Dialog.Title className="font-display text-base font-semibold text-content">
            {readOnly ? `${noun} details` : `Edit ${noun}`}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-content-muted">
            {readOnly
              ? "What this widget shows and its parameters."
              : "Edit the recreation prompt or the raw parameters, then save."}
          </Dialog.Description>

          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
            <div>
              <label className="mb-1 block font-display text-xs font-semibold text-content-muted">
                Recreation prompt — what this {noun} shows
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                readOnly={readOnly}
                rows={3}
                placeholder={`Describe the ${noun}…`}
                className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-content placeholder:text-content-faint focus:border-border-strong focus:outline-none read-only:opacity-70"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <label className="mb-1 block font-display text-xs font-semibold text-content-muted">
                Parameters (JSON)
              </label>
              <textarea
                value={paramsText}
                onChange={(e) => setParamsText(e.target.value)}
                readOnly={readOnly}
                spellCheck={false}
                className="min-h-40 w-full flex-1 resize-none rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs leading-relaxed text-content focus:border-border-strong focus:outline-none read-only:opacity-70"
              />
            </div>
            {error ? (
              <p className="text-sm text-danger-content">{error}</p>
            ) : null}
          </div>

          <div className="mt-5 flex shrink-0 justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-content-muted transition-colors hover:bg-elevated hover:text-content focus-visible:bg-elevated focus-visible:outline-none"
              >
                {readOnly ? "Close" : "Cancel"}
              </button>
            </Dialog.Close>
            {!readOnly ? (
              <button
                type="button"
                onClick={onSaveClick}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none"
              >
                Save
              </button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
