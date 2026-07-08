import { registerRenderer } from "../../registry";
import { TokenLabWidget } from "./TokenLabWidget";

// Registers the "themelab" renderer on import (same pattern as the other admin
// widgets). App.tsx imports this module to wire it in.
registerRenderer("themelab", TokenLabWidget);

// The editable counterpart to the Style Guide: live, per-mode token editing
// persisted to localStorage. Not a per-conversation capability, so no
// content/glow state.
export const TOKENLAB_WIDGET = {
  id: "themelab",
  type: "themelab",
  title: "Theme Lab",
  state: null,
} as const;
