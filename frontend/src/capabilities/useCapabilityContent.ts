import { BIGSAIL_WIDGET } from "./widgets/Bigsail";
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

  // Bigsail mirrors every other capability, so it "has content" whenever any
  // source does — its chip fills the moment the conversation produces anything.
  const anyContent =
    nodes.length > 0 ||
    table.length > 0 ||
    chart.length > 0 ||
    timeline.length > 0 ||
    images.length > 0;

  return {
    [BIGSAIL_WIDGET.id]: anyContent,
    [KNOWLEDGE_GRAPH_WIDGET.id]: nodes.length > 0,
    [TABLE_WIDGET.id]: table.length > 0,
    [CHART_WIDGET.id]: chart.length > 0,
    [TIMELINE_WIDGET.id]: timeline.length > 0,
    [IMAGES_WIDGET.id]: images.length > 0,
  };
}
