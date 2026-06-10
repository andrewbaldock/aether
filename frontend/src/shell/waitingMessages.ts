// Calm, low-key "still working" filler shown beneath the thinking glyph when the
// agent is busy but has nothing concrete to report (the gaps between real status
// events). Static and frontend-only on purpose: zero tokens, zero latency, no LLM
// round-trip — the point is to reassure during dead air, not to be witty. Voice is
// informative and warm, never jokey.
export const WAITING_MESSAGES: readonly string[] = [
  "Still thinking this through…",
  "Working on it…",
  "Gathering the details…",
  "Pulling the threads together…",
  "Reading carefully…",
  "Lining up the pieces…",
  "Making sense of it…",
  "Considering the angles…",
  "Looking closer…",
  "Connecting the dots…",
  "Sorting through the details…",
  "Weighing the options…",
  "Putting it in order…",
  "Tracing it back…",
  "Double-checking the details…",
  "Piecing it together…",
  "Sketching out an answer…",
  "Thinking it over…",
  "Almost there…",
  "Just a moment more…",
  "Following the trail…",
  "Cross-referencing…",
  "Tidying up the answer…",
  "Settling on the right words…",
];

// Pick a filler line, avoiding an immediate repeat of `previous` so the rotation
// always visibly changes. With 20+ lines the reroll is cheap and effectively never
// loops more than once.
export function nextWaitingMessage(previous?: string): string {
  // The array is a non-empty literal, so an in-range index is always defined;
  // the `?? ""` only satisfies noUncheckedIndexedAccess and never fires.
  if (WAITING_MESSAGES.length <= 1) return WAITING_MESSAGES[0] ?? "";
  let pick = "";
  do {
    const i = Math.floor(Math.random() * WAITING_MESSAGES.length);
    pick = WAITING_MESSAGES[i] ?? "";
  } while (pick === previous);
  return pick;
}
