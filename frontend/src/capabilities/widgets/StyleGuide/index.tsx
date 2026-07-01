import { registerRenderer } from "../../registry";
import { StyleGuideWidget } from "./StyleGuideWidget";

// Registers the "styleguide" renderer on import (same pattern as the other
// admin widgets). App.tsx imports this module to wire it in.
registerRenderer("styleguide", StyleGuideWidget);

// A live index of the app's design tokens, primitives, and motion — the
// "show, don't tell" counterpart to docs/design-system.md. Not a
// per-conversation capability, so no content/glow state.
export const STYLEGUIDE_WIDGET = {
  id: "styleguide",
  type: "styleguide",
  title: "Style Guide",
  state: null,
} as const;
