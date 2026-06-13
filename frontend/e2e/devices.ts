import { devices, type PlaywrightTestProject } from "@playwright/test";

// Single source of truth for the viewport matrix, shared by playwright.config.ts
// (the test projects) and e2e/screenshots.ts (the contact-sheet capture) so the
// two never drift. Seven viewports: one desktop, plus three mobile/tablet devices
// each in BOTH portrait and landscape.
//
// Why landscape is its own entry, not a free variation: Playwright's device
// presets default to portrait, and the shell's portrait-stacking layout flips on
// orientation — a path that regresses silently. We spread the preset and swap the
// viewport's width/height (and flip `isLandscape`) so each orientation is exercised
// as a distinct project/shot.

export type Engine = "chromium" | "webkit";

export interface ViewportEntry {
  // The Playwright project name — also the screenshot filename stem.
  name: string;
  engine: Engine;
  // A fully-resolved device descriptor (the `use` block). Already
  // orientation-adjusted for landscape entries.
  use: PlaywrightTestProject["use"];
}

// Rotate a device preset to landscape: swap width/height and flag isLandscape so
// CSS orientation media queries and the shell's own orientation checks both see it.
function landscape(preset: (typeof devices)[string]) {
  const vp = preset.viewport;
  return {
    ...preset,
    viewport: vp ? { width: vp.height, height: vp.width } : vp,
    isLandscape: true,
  };
}

// The mobile/tablet devices we mirror into portrait + landscape. WebKit covers
// iPhone/iPad Safari (the regression-prone surface); Chromium covers Android.
const DUAL_ORIENTATION: ReadonlyArray<{ stem: string; preset: string }> = [
  { stem: "iphone-15", preset: "iPhone 15" },
  { stem: "ipad-gen7", preset: "iPad (gen 7)" },
  { stem: "pixel-7", preset: "Pixel 7" },
];

function engineFor(presetName: string): Engine {
  // iPhone/iPad presets run on WebKit (Safari); Android (Pixel) on Chromium.
  return presetName.startsWith("Pixel") ? "chromium" : "webkit";
}

export const VIEWPORTS: ViewportEntry[] = [
  {
    name: "desktop-chrome",
    engine: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: 1280, height: 800 },
    },
  },
  ...DUAL_ORIENTATION.flatMap(({ stem, preset }): ViewportEntry[] => {
    const engine = engineFor(preset);
    const base = devices[preset];
    return [
      { name: `${stem}-portrait`, engine, use: { ...base } },
      { name: `${stem}-landscape`, engine, use: landscape(base) },
    ];
  }),
];
