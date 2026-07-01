import { useChartState } from "../Chart/useChartState";
import { useImagesState } from "../Images/useImagesState";
import { useTableState } from "../Table/useTableState";
import { useTimelineState } from "../Timeline/useTimelineState";
import { useQueuedExplore } from "../useQueuedExplore";
import type { Card, CardCapability } from "./cards";

// Regenerate ONE Bigsail card from an edited summary. The card's back face shows the
// model's one-sentence description of what the widget currently shows; the user edits
// it and regenerates, re-running this widget's render tool against the conversation
// with the edited sentence as the steer, replacing this entry IN PLACE (by id).
//
// Reuses the exact machinery the tool tabs' per-entry reload uses: fire an
// explore_request (queued, latest-wins, fires on turn-settle) whose onFire binds the
// next spec of the turn to this entry via requestReplaceEntry. So a steered rebuild is
// the same path as a plain reload, just with a user-authored prompt.
//
// Scoped to the four entry-based capabilities (table/chart/timeline/images). The
// knowledge graph is whole-graph (additive merge, a singleton card) and has no
// per-entry replace, so it has no regenerate box — its back face is JSON-only.

// The noun used in the prompt + transcript line per capability.
const NOUN: Record<CardCapability, string> = {
  table: "table",
  chart: "chart",
  timeline: "timeline",
  images: "image gallery",
  "knowledge-graph": "graph",
};

export interface CardRegenerate {
  // Whether this card supports regenerate (false for the knowledge graph).
  canRegenerate: boolean;
  // Fire a steered rebuild of this card from the edited summary. No-op if the card
  // can't regenerate or the text is blank.
  regenerate: (editedSummary: string) => void;
  // True while a rebuild is queued behind an in-flight turn.
  queued: boolean;
}

// Parse the entry id out of a card id (`${capability}:${entryId}`). The knowledge
// graph's id is `knowledge-graph:graph` → NaN, which is fine (it can't regenerate).
// Exported so useCardDuplicate parses the same way.
export function entryIdOf(card: Card): number {
  const raw = card.id.slice(card.id.indexOf(":") + 1);
  return Number(raw);
}

export function useCardRegenerate(card: Card): CardRegenerate {
  // Call every state hook unconditionally (rules of hooks); pick by capability below.
  const table = useTableState();
  const chart = useChartState();
  const timeline = useTimelineState();
  const images = useImagesState();
  const reload = useQueuedExplore();

  const replaceById: Partial<Record<CardCapability, (id: number) => void>> = {
    table: table.requestReplaceEntry,
    chart: chart.requestReplaceEntry,
    timeline: timeline.requestReplaceEntry,
    images: images.requestReplaceEntry,
  };

  const requestReplaceEntry = replaceById[card.capabilityType];
  const entryId = entryIdOf(card);
  const canRegenerate = !!requestReplaceEntry && Number.isFinite(entryId);

  function regenerate(editedSummary: string) {
    const text = editedSummary.trim();
    if (!requestReplaceEntry || !Number.isFinite(entryId) || !text) return;
    const noun = NOUN[card.capabilityType];
    reload.enqueue({
      // The user's edited description IS the instruction. Pin it to a single render
      // call so the model rebuilds THIS widget, not a new sibling — onFire binds the
      // next spec of the turn to this entry's id (replace in place).
      prompt: `Rebuild the ${noun} to show exactly this, calling its render tool once: ${text}. Replace the existing ${noun} — don't add another. Base it on our conversation so far; if it asks for data we don't have, gather it first.`,
      displayText: `Regenerate this ${noun}: ${text}`,
      onFire: () => requestReplaceEntry(entryId),
    });
  }

  return { canRegenerate, regenerate, queued: reload.queued };
}

// The summary text to seed the editable box with — the model's one-sentence
// description of what the widget currently shows. Images carry it as `blurb`; the
// others as `summary`. Empty string when the widget predates the field (the box just
// starts blank, the user can type their own steer).
export function cardSummarySeed(card: Card): string {
  return recreationPromptOf(card.capabilityType, card.spec);
}

// The recreation-prompt field is `blurb` for images, `summary` for everyone else.
// Centralised so the back face, the edit dialog, and any reader agree.
function promptFieldFor(type: CardCapability): "summary" | "blurb" {
  return type === "images" ? "blurb" : "summary";
}

// Read the recreation prompt off any spec (handles the images/blurb vs summary
// split). Empty string when absent.
export function recreationPromptOf(
  type: CardCapability,
  spec: unknown
): string {
  const field = promptFieldFor(type);
  const v = (spec as Record<string, unknown>)?.[field];
  return typeof v === "string" ? v : "";
}

// Return a copy of `spec` with the recreation prompt set to `text` (into the right
// field for the capability). Used by the edit dialog to write the prompt back.
export function withRecreationPrompt<S>(
  type: CardCapability,
  spec: S,
  text: string
): S {
  return { ...(spec as object), [promptFieldFor(type)]: text } as S;
}
