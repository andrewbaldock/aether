import { registerRenderer } from "../../registry";
import { ScreenshotsWidget } from "./ScreenshotsWidget";

// Registers the "screenshots" renderer on import (same pattern as the other admin
// widgets). App.tsx imports this module to wire it in — but ONLY in dev (see the
// guarded import there), so the renderer never ships to production.
registerRenderer("screenshots", ScreenshotsWidget);

// The dev-only "Screenshots" admin page descriptor. Like its Welcome/Settings/
// Health siblings, the id doubles as the renderer type (see CapabilityColumn).
export const SCREENSHOTS_WIDGET = {
  id: "screenshots",
  type: "screenshots",
  title: "Screenshots",
  state: null,
} as const;
