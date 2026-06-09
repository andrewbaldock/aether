import { registerRenderer } from "../../registry";
import { TableWidget } from "./TableWidget";

// Registers the "table" renderer on import (same pattern as the other widgets).
// App.tsx imports this module to wire it in.
registerRenderer("table", TableWidget);

// The widget descriptor the shell opens. Stable id so re-opening (a second
// render_table call) reuses the same tab rather than stacking duplicates.
export const TABLE_WIDGET = {
  id: "table",
  type: "table",
  title: "Table",
  state: null,
} as const;
