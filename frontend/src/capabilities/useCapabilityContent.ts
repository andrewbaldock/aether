import { CHART_WIDGET } from "./widgets/Chart";
import { useChartState } from "./widgets/Chart/useChartState";
import { IMAGES_WIDGET } from "./widgets/Images";
import { useImagesState } from "./widgets/Images/useImagesState";
import { KNOWLEDGE_GRAPH_WIDGET } from "./widgets/KnowledgeGraph";
import { useKnowledgeGraphState } from "./widgets/KnowledgeGraph/useKnowledgeGraphState";
import { TABLE_WIDGET } from "./widgets/Table";
import { useTableState } from "./widgets/Table/useTableState";
import { TIMELINE_WIDGET } from "./widgets/Timeline";
import { useTimelineState } from "./widgets/Timeline/useTimelineState";

// Live "does this capability have content?" map, keyed by capability id. Drives
// the filled-vs-empty chip styling and the conversation-load restore logic.
// Reads only `.length` from each provider — never mutates.
export function useCapabilityContent(): Record<string, boolean> {
  const { nodes } = useKnowledgeGraphState();
  const { entries: table } = useTableState();
  const { entries: chart } = useChartState();
  const { entries: timeline } = useTimelineState();
  const { entries: images } = useImagesState();

  return {
    [KNOWLEDGE_GRAPH_WIDGET.id]: nodes.length > 0,
    [TABLE_WIDGET.id]: table.length > 0,
    [CHART_WIDGET.id]: chart.length > 0,
    [TIMELINE_WIDGET.id]: timeline.length > 0,
    [IMAGES_WIDGET.id]: images.length > 0,
  };
}
