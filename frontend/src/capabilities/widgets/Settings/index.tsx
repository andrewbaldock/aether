import { registerRenderer } from "../../registry";
import { SettingsWidget } from "./SettingsWidget";

// Registers the "settings" renderer on import (same pattern as the other
// widgets). App.tsx imports this module to wire it in.
registerRenderer("settings", SettingsWidget);

// The settings view, reached from the gear chip in the capability toolbar. Like
// Welcome it is not a per-conversation capability — it has no content/glow state.
export const SETTINGS_WIDGET = {
  id: "settings",
  type: "settings",
  title: "Settings",
  state: null,
} as const;
