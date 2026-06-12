import { registerRenderer } from "../../registry";
import { BigsailWidget } from "./BigsailWidget";

// Registers the "bigsail" renderer on import (same pattern as the other widgets).
// App.tsx imports this module to wire it in.
registerRenderer("bigsail", BigsailWidget);

// The widget descriptor the shell opens. Bigsail is the first capability and the
// default active view (see catalog.tsx / useCapabilities.tsx).
export const BIGSAIL_WIDGET = {
  id: "bigsail",
  type: "bigsail",
  title: "Bigsail",
  state: null,
} as const;
