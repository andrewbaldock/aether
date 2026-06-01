import { registerRenderer } from "../../registry";
import { AgentDiagramWidget } from "./AgentDiagramWidget";

// Registers the "agent-diagram" renderer on import (same pattern as the other
// widgets). App.tsx imports this module to wire it in.
registerRenderer("agent-diagram", AgentDiagramWidget);

// The widget descriptor the shell opens. Stable id so re-opening reuses the
// same tab rather than stacking duplicates.
export const AGENT_DIAGRAM_WIDGET = {
  id: "agent-diagram",
  type: "agent-diagram",
  title: "Aether in Action",
  state: null,
} as const;
