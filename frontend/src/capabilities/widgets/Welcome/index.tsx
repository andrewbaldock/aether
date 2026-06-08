import { registerRenderer } from "../../registry";
import { WelcomeWidget } from "./WelcomeWidget";

// Registers the "welcome" renderer on import (same pattern as the other
// widgets). App.tsx imports this module to wire it in.
registerRenderer("welcome", WelcomeWidget);

// The widget descriptor the shell opens. Stable id so re-opening (via the help
// icon) reuses the same tab rather than stacking duplicates.
export const WELCOME_WIDGET = {
  id: "welcome",
  type: "welcome",
  title: "Welcome to Aether",
  state: null,
} as const;
