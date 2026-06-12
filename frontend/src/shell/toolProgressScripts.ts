// Scripted multi-step progress for the slow tools — the client-side half of the
// drip feed. The backend emits ONE tool_start label (e.g. "Querying Wikidata…")
// then goes quiet for seconds while the fetch runs. Rather than freeze on that one
// line, we advance through a short scripted sequence on timers so the activity
// indicator keeps moving. A real backend `status` or `tool_result` event overrides
// the script the instant it arrives (see useToolProgress) — so where we have a true
// signal it wins; where we don't, the script carries the illusion of speed.
//
// Only the genuinely slow tools (network round-trips) get scripts. The render_*
// tools are instant input-echoes on the backend, so their single label is fine.

export interface ProgressStep {
  // The line to show.
  message: string;
  // How long to hold this line before advancing to the next, in ms. The last
  // step in a script holds indefinitely (until a real event supersedes it).
  holdMs: number;
}

// Keyed by backend tool name. The FIRST step roughly echoes the backend's
// tool_start label (so there's no flicker on handover), then we drift into
// plausible sub-steps. Tuned so a typical fetch (1–4s) lands somewhere mid-script.
export const TOOL_PROGRESS_SCRIPTS: Record<string, ProgressStep[]> = {
  wikidata_query: [
    { message: "Querying Wikidata…", holdMs: 700 },
    { message: "Running the query…", holdMs: 900 },
    { message: "Reading the results…", holdMs: 1100 },
    { message: "Shaping the data…", holdMs: 1400 },
  ],
  world_bank: [
    { message: "Fetching World Bank data…", holdMs: 700 },
    { message: "Pulling the indicator series…", holdMs: 900 },
    { message: "Reading the figures…", holdMs: 1100 },
    { message: "Shaping the data…", holdMs: 1400 },
  ],
  search_images: [
    { message: "Searching for images…", holdMs: 700 },
    { message: "Scanning sources…", holdMs: 900 },
    { message: "Picking the best shots…", holdMs: 1200 },
  ],
  web_search: [
    { message: "Searching the web…", holdMs: 700 },
    { message: "Scanning results…", holdMs: 900 },
    { message: "Reading the top hits…", holdMs: 1200 },
  ],
};

// The script for a tool, or null if the tool runs fast enough not to need one.
export function scriptFor(tool: string): ProgressStep[] | null {
  return TOOL_PROGRESS_SCRIPTS[tool] ?? null;
}
