import { useChartState } from "../Chart/useChartState";
import { useImagesState } from "../Images/useImagesState";
import { useTableState } from "../Table/useTableState";
import { useTimelineState } from "../Timeline/useTimelineState";
import type { CardCapability } from "./cards";

// Duplicate ONE Bigsail card. A card id is `${capability}:${entryId}`, so we split
// it to pick the right capability's state and clone that entry in place (the
// provider's duplicateEntry inserts the copy directly after the source, which makes
// it land right beneath the original in BOTH the tool tab and the canvas).
//
// Scoped to the four entry-based capabilities (table/chart/timeline/images). The
// knowledge graph is a whole-graph singleton with no per-entry list, so it can't be
// duplicated — its card simply has no Duplicate button (we no-op defensively here too).
//
// Returns a single fn taking the card id string, matching onHide's shape so it
// threads through TilesCanvas the same way.
export function useCardDuplicate(): (cardId: string) => void {
  // Call every state hook unconditionally (rules of hooks); pick by capability below.
  const table = useTableState();
  const chart = useChartState();
  const timeline = useTimelineState();
  const images = useImagesState();

  const byType: Partial<Record<CardCapability, (id: number) => void>> = {
    table: table.duplicateEntry,
    chart: chart.duplicateEntry,
    timeline: timeline.duplicateEntry,
    images: images.duplicateEntry,
  };

  return (cardId: string) => {
    const sep = cardId.indexOf(":");
    const capability = cardId.slice(0, sep) as CardCapability;
    const entryId = Number(cardId.slice(sep + 1));
    const fn = byType[capability];
    if (fn && Number.isFinite(entryId)) fn(entryId);
  };
}
