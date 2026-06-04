import type { EntityType } from "./types";

// Fixed per-type colours — these are identity (like the agent diagram's
// ROLE_COLOR), not surfaces, so they stay constant across light/dark. Chosen to
// read on both the light (#fff) and dark (#171717) canvas.
export const TYPE_COLOR: Record<EntityType, string> = {
  person: "#ff2e9a", // neon pink
  place: "#16c2ff", // neon cyan
  concept: "#b54bd0", // purple (wordmark mid-stop)
  org: "#f5a623", // amber
  event: "#34d399", // emerald
};

export const TYPE_LABEL: Record<EntityType, string> = {
  person: "Person",
  place: "Place",
  concept: "Concept",
  org: "Organization",
  event: "Event",
};
