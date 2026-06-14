// Pure save-payload logic for WidgetPersistenceBridge, extracted so it can be
// unit-tested without mounting five providers + SessionContext.
//
// SELF-HEALING SAVE: a field persists its LIVE value when non-empty; when it
// momentarily goes empty (a rebuild mid-flight, a transient blip) it persists its
// LAST-GOOD value instead of null — an empty in-memory state can never overwrite
// real saved data. The backend PUT merges defensively as a second backstop.

export type FieldSnapshot = {
  table: unknown[] | null;
  chart: unknown[] | null;
  timeline: unknown[] | null;
  images: unknown[] | null;
};

export const EMPTY_GOOD: FieldSnapshot = {
  table: null,
  chart: null,
  timeline: null,
  images: null,
};

function pick(live: unknown[], prev: unknown[] | null): unknown[] | null {
  return live.length > 0 ? live : prev;
}

// Compute what to PUT given the current live entries and the last-good floor.
// Returns null when there is nothing to persist AND nothing good to protect — the
// caller should skip the PUT entirely (a fresh, still-empty session).
export function computeSavePayload(
  live: {
    table: unknown[];
    chart: unknown[];
    timeline: unknown[];
    images: unknown[];
  },
  lastGood: FieldSnapshot
): FieldSnapshot | null {
  const payload: FieldSnapshot = {
    table: pick(live.table, lastGood.table),
    chart: pick(live.chart, lastGood.chart),
    timeline: pick(live.timeline, lastGood.timeline),
    images: pick(live.images, lastGood.images),
  };
  if (!payload.table && !payload.chart && !payload.timeline && !payload.images)
    return null;
  return payload;
}
