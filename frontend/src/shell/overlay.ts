// Elevation for surfaces that float ABOVE the page — dialogs, menus, dropdowns,
// the mobile sheet.
//
// This started as a suspected drift and turned out to be the opposite: the five
// floating surfaces in the app were already following a consistent two-tier
// rule, it just had no name and lived in five copy-pasted class strings. Naming
// it is the whole change (plus one genuine outlier — see `sheet`).
//
// The tiers are a real distinction, not a preference:
//
//   modal   — takes the whole screen's attention behind a scrim, and the user
//             must deal with it. Heavier: larger radius, deepest shadow.
//   popover — anchored to the control that opened it, dismissed by looking away.
//             Lighter: it should read as attached to the page, not on top of it.
//
// Every tier keeps `border-border-strong`: on the raised surface a floating
// panel needs a harder edge than inline content, or it dissolves into the page
// beneath it in dark mode.
//
// POSITIONING IS NOT HERE. Each call site owns its own fixed/absolute placement,
// z-index, width clamps, and padding — those are per-overlay and Radix often
// drives them. This constant is only the surface treatment.
export const OVERLAY_SURFACE = {
  modal: "rounded-xl border border-border-strong bg-surface-raised shadow-2xl",
  popover: "rounded-lg border border-border-strong bg-surface-raised shadow-lg",
  // The mobile bottom sheet: rounded and bordered on its top edge only, since
  // the other three sit off-screen. It carried `border-border` rather than
  // `border-border-strong` — the one real inconsistency the audit turned up,
  // and the most visible one, because that top edge is the only part of the
  // sheet's frame a user ever sees.
  sheet:
    "rounded-t-2xl border-t border-border-strong bg-surface-raised shadow-2xl",
} as const;
