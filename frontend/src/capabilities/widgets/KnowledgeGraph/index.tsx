import { registerRenderer } from "../../registry";
import { KnowledgeGraphWidget } from "./KnowledgeGraphWidget";

// Registers the "knowledge-graph" renderer on import (same pattern as the other
// widgets). App.tsx imports this module to wire it in.
registerRenderer("knowledge-graph", KnowledgeGraphWidget);

// The widget descriptor the shell opens. Stable id so re-opening reuses the same
// tab rather than stacking duplicates.
export const KNOWLEDGE_GRAPH_WIDGET = {
  id: "knowledge-graph",
  type: "knowledge-graph",
  title: "Knowledge Graph",
  state: null,
} as const;
