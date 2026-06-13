// The persisted widget_data shape: four provider arrays, each null when that
// provider has nothing this session, else an array of serialised `{ id, spec }`
// entries.
export interface WidgetSnapshot {
  table: unknown[] | null;
  chart: unknown[] | null;
  timeline: unknown[] | null;
  images: unknown[] | null;
}

// Each field must be null or an array of entries that carry a `spec`. Shallow on
// purpose — the schemaVersion bump is the primary signal for breaking spec-shape
// changes; this guard catches corruption / wrong-shape blobs. Additive optional
// fields inside a spec pass through untouched.
function isEntryArrayOrNull(v: unknown): boolean {
  if (v === null) return true;
  if (!Array.isArray(v)) return false;
  if (v.length === 0) return true;
  const first = v[0] as Record<string, unknown>;
  return (
    typeof first === "object" && first !== null && "spec" in first
  );
}

export function isWidgetSnapshot(v: unknown): v is WidgetSnapshot {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const s = v as Record<string, unknown>;
  return (
    isEntryArrayOrNull(s.table) &&
    isEntryArrayOrNull(s.chart) &&
    isEntryArrayOrNull(s.timeline) &&
    isEntryArrayOrNull(s.images)
  );
}

// Whether an invalid blob actually held widget content worth a reset toast. A
// brand-new session has all-null fields and no stamp — that's empty, not a
// reset — so suppress the toast unless at least one provider had entries.
export function hasSavedWidgets(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as Record<string, unknown>;
  return (["table", "chart", "timeline", "images"] as const).some((k) => {
    const v = s[k];
    return Array.isArray(v) && v.length > 0;
  });
}
