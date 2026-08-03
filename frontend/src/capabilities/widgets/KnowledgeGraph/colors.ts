import type { EntityType } from "./types";

// Fixed per-type colours — identity (like the agent diagram's ROLE_COLOR), not
// surfaces. They stay constant across light/dark, but that is now a MEASURED
// result rather than an assumption: the set was validated against both the white
// and the near-black canvas at once (see the --kg-* block in index.css), and the
// feasible region turned out to be a single palette.
//
// The values live in CSS, not here. Every consumer passes these straight into a
// CSS colour position — SVG `fill`, `backgroundColor`, and inside a
// `drop-shadow()` filter — all of which resolve custom properties natively. Same
// arrangement as the chart's --viz-* ramp: the token layer owns the value, this
// module owns the mapping.
//
// The previous literals were tuned for the dark canvas and measured badly on the
// light one — place/org/event sat at 2.06:1, 2.03:1 and 1.92:1 against white,
// i.e. visibly washed out. person and concept are unchanged; they're brand ties
// (--neon-pink and the wordmark's mid-stop) and both already passed.
export const TYPE_COLOR: Record<EntityType, string> = {
  person: "var(--kg-person)",
  place: "var(--kg-place)",
  concept: "var(--kg-concept)",
  org: "var(--kg-org)",
  event: "var(--kg-event)",
};

export const TYPE_LABEL: Record<EntityType, string> = {
  person: "Person",
  place: "Place",
  concept: "Concept",
  org: "Organization",
  event: "Event",
};
