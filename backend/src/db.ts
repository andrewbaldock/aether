import { createClient } from "@supabase/supabase-js";

// A persisted knowledge-graph snapshot for a session: the merged nodes/links
// plus any drag-pinned positions. Stored as-is in the `graph_data` jsonb column
// so reopening (or reloading) a conversation restores the graph the user built,
// rather than relying on the model to re-emit it. The backend doesn't interpret
// the shape — it round-trips whatever the frontend saves, including the
// frontend's `schemaVersion` stamp (dropping it breaks load-time validation).
export type GraphSnapshot = {
  schemaVersion?: number; // frontend stamp; round-tripped, not interpreted
  nodes: unknown[];
  links: unknown[];
};

// Persisted render-tool specs for a session. Stored in `widget_data` jsonb.
// The backend doesn't interpret the shape — it round-trips whatever the
// frontend saves. null fields mean "nothing generated yet this session".
// `schemaVersion` is the frontend's per-tool stamp; we must preserve it
// through the round trip or load-time validation always fails and discards.
export type WidgetSnapshot = {
  schemaVersion?: number; // frontend stamp; round-tripped, not interpreted
  table: unknown[] | null; // TableEntry[] (serialised)
  chart: unknown[] | null; // ChartEntry[] (serialised)
  timeline: unknown[] | null; // TimelineEntry[] (serialised)
  images: unknown[] | null; // ImagesEntry[] (serialised)
};

// Self-healing backstop for the widget PUT: a save must never SILENTLY destroy
// saved widgets. If an incoming field is null/absent but the STORED row holds a
// non-empty array for it, we keep the stored data (merge) rather than nulling it —
// unless the client explicitly passes `reset: true`, which is how the legitimate
// clear paths signal intent. This makes the column robust to any frontend timing
// bug (e.g. a rebuild that clears-then-fails) corrupting good data. Pure + exported
// for unit testing.
export function mergeWidgetSnapshot(
  incoming: {
    schemaVersion?: unknown;
    reset?: unknown;
    table?: unknown;
    chart?: unknown;
    timeline?: unknown;
    images?: unknown;
  },
  existing: WidgetSnapshot | null
): WidgetSnapshot {
  const reset = incoming.reset === true;
  const field = (value: unknown, prev: unknown[] | null | undefined) => {
    if (Array.isArray(value)) return value;
    if (!reset && Array.isArray(prev) && prev.length > 0) return prev;
    return null;
  };
  return {
    // Preserve the frontend's stamp; dropping it makes load-time validation
    // always fail (undefined !== current version) → resets + toast on reload.
    ...(typeof incoming.schemaVersion === "number"
      ? { schemaVersion: incoming.schemaVersion }
      : {}),
    table: field(incoming.table, existing?.table),
    chart: field(incoming.chart, existing?.chart),
    timeline: field(incoming.timeline, existing?.timeline),
    // images added later; treat a missing key as "none" so older clients
    // that don't send it still save cleanly.
    images: field(incoming.images, existing?.images),
  };
}

// Backend-owned per-conversation image state, stored in the `image_data` jsonb
// column. Distinct from `widget_data` (frontend-owned, written only after a turn)
// so the backend can read/increment it mid-turn without racing the frontend.
// Today it just holds the Unsplash-search budget counter; room to grow.
export type ImageData = {
  // Number of searches in this conversation that actually returned Unsplash
  // photos. Caps real Unsplash usage per conversation (see searchUnsplash).
  unsplashSearches: number;
};

// Frontend-owned per-conversation UI state, stored in the `ui_state` jsonb
// column — "how this conversation was last being viewed". Distinct from
// widget_data (widget CONTENT) and image_data (backend-owned counters). The
// backend round-trips whatever the frontend saves. Open-ended on purpose so
// future per-conversation UI memories can land here without a new column.
export type UiState = {
  // Which capability tab (widget id) was last on top. null/absent = none.
  activeWidget?: string | null;
  // The Tiles canvas layout for this conversation: the user's drag/resize
  // arrangement, persisted so it follows them across devices. One entry per card
  // (keyed by the stable card id `${capability}:${entryId}`); GridStack's
  // save()/load() shape. Absent = auto-place everything (no manual arrangement yet).
  tilesLayout?: TilesLayoutItem[];
  // Schema version stamp for the persisted tilesLayout (frontend-owned; the
  // backend just round-trips it). The frontend discards the saved arrangement on
  // a version mismatch. Sibling rather than inline because the array shape is
  // awkward to stamp. Absent on legacy rows → treated as a mismatch.
  tilesLayoutVersion?: number;
};

// One placed card in the Tiles layout. Grid units (columns/rows), not pixels, so
// the arrangement is resolution-independent. Mirrors GridStack's serialized node.
export type TilesLayoutItem = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  // True once the user dragged/resized this card (frontend-owned; round-tripped,
  // not interpreted here). Pins the card so the frontend doesn't auto-rejigger it.
  userMoved?: boolean;
};

export interface Session {
  id: string;
  user_id: string;
  title: string | null;
  graph_mode: boolean;
  graph_data: GraphSnapshot | null;
  widget_data: WidgetSnapshot | null;
  image_data: ImageData | null;
  ui_state: UiState | null;
  // The Claude model the user last selected for this conversation. null means
  // "use the server default" (env override or built-in default).
  model: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

function createDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be set in backend/.env"
    );
  }
  return createClient(url, key);
}

// Memoized at module level — one client for the process, created on first use.
let _db: ReturnType<typeof createDb> | null = null;

// Exported so sibling modules (appState, rateLimit) share the one memoized
// client rather than spinning up their own.
export function getDb() {
  _db ??= createDb();
  return _db;
}

export async function createSession(
  userId: string,
  title?: string,
  graphMode?: boolean
): Promise<{ id: string }> {
  const { data, error } = await getDb()
    .from("sessions")
    .insert({
      user_id: userId,
      title: title ?? null,
      // Omit when undefined so the column default applies.
      ...(graphMode === undefined ? {} : { graph_mode: graphMode }),
    })
    .select("id")
    .single();
  if (error) throw new Error(`createSession: ${error.message}`);
  return { id: data.id };
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const { data, error } = await getDb()
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error(`getSession: ${error.message}`);
  return data ?? null;
}

export async function listSessions(userId: string): Promise<Session[]> {
  const { data, error } = await getDb()
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`listSessions: ${error.message}`);
  return data ?? [];
}

export async function getMessages(sessionId: string): Promise<DbMessage[]> {
  const { data, error } = await getDb()
    .from("messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getMessages: ${error.message}`);
  return data ?? [];
}

export async function saveMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const { error } = await getDb()
    .from("messages")
    .insert({ session_id: sessionId, role, content });
  if (error) throw new Error(`saveMessage: ${error.message}`);
}

export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<void> {
  const { error } = await getDb()
    .from("sessions")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(`updateSessionTitle: ${error.message}`);
}

// Sets the title only if the session doesn't already have one. A single
// conditional UPDATE — no read-then-write race, and a no-op after the first
// turn — so auto-titling can't orphan a session on a transient read failure.
export async function updateSessionTitleIfEmpty(
  sessionId: string,
  title: string
): Promise<void> {
  const { error } = await getDb()
    .from("sessions")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("title", null);
  if (error) throw new Error(`updateSessionTitleIfEmpty: ${error.message}`);
}

export async function updateSessionGraphMode(
  sessionId: string,
  graphMode: boolean
): Promise<void> {
  const { error } = await getDb()
    .from("sessions")
    .update({ graph_mode: graphMode, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(`updateSessionGraphMode: ${error.message}`);
}

export async function updateSessionModel(
  sessionId: string,
  model: string
): Promise<void> {
  const { error } = await getDb()
    .from("sessions")
    .update({ model, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(`updateSessionModel: ${error.message}`);
}

// MERGE the patch into the existing ui_state rather than replacing it, so
// independent writers (the active-view tracker and the Tiles layout saver) can
// each patch their own field without clobbering the other's. Read-modify-write:
// a lost-update race between the two debounced writers is harmless here (both are
// idempotent "last value wins" UI memories, not transactional data).
export async function updateSessionUiState(
  sessionId: string,
  patch: UiState
): Promise<void> {
  const db = getDb();
  const { data, error: readErr } = await db
    .from("sessions")
    .select("ui_state")
    .eq("id", sessionId)
    .single();
  if (readErr)
    throw new Error(`updateSessionUiState (read): ${readErr.message}`);
  const merged: UiState = {
    ...((data?.ui_state as UiState | null) ?? {}),
    ...patch,
  };
  const { error } = await db
    .from("sessions")
    .update({ ui_state: merged, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(`updateSessionUiState: ${error.message}`);
}

// Read just the persisted graph snapshot for a session. Returns null when the
// session has no saved graph yet (the column default).
export async function getSessionGraph(
  sessionId: string
): Promise<GraphSnapshot | null> {
  const { data, error } = await getDb()
    .from("sessions")
    .select("graph_data")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error(`getSessionGraph: ${error.message}`);
  return (data?.graph_data as GraphSnapshot | null) ?? null;
}

export async function updateSessionGraphData(
  sessionId: string,
  graphData: GraphSnapshot
): Promise<void> {
  const { error } = await getDb()
    .from("sessions")
    .update({ graph_data: graphData, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(`updateSessionGraphData: ${error.message}`);
}

export async function forkSession(
  sourceId: string,
  newUserId: string
): Promise<{ id: string }> {
  const db = getDb();
  // Read source session and its messages in parallel.
  const [sessionResult, messagesResult] = await Promise.all([
    db.from("sessions").select("*").eq("id", sourceId).single(),
    db
      .from("messages")
      .select("*")
      .eq("session_id", sourceId)
      .order("created_at", { ascending: true }),
  ]);
  if (sessionResult.error)
    throw new Error(`forkSession (read): ${sessionResult.error.message}`);
  if (messagesResult.error)
    throw new Error(`forkSession (messages): ${messagesResult.error.message}`);

  const source = sessionResult.data as Session;

  // Create the new session owned by newUserId, copying metadata.
  const { data: newSession, error: createError } = await db
    .from("sessions")
    .insert({
      user_id: newUserId,
      title: source.title,
      graph_mode: source.graph_mode,
      graph_data: source.graph_data,
      widget_data: source.widget_data,
      // Deliberately NOT copying image_data: a fork is a fresh conversation and
      // should get its own Unsplash-search budget (column default null → 0 used).
      model: source.model,
    })
    .select("id")
    .single();
  if (createError)
    throw new Error(`forkSession (create): ${createError.message}`);

  // Copy messages into the new session (preserve role + content; new ids/timestamps).
  const msgs = (messagesResult.data ?? []) as DbMessage[];
  if (msgs.length > 0) {
    const { error: msgError } = await db.from("messages").insert(
      msgs.map((m) => ({
        session_id: newSession.id,
        role: m.role,
        content: m.content,
      }))
    );
    if (msgError)
      throw new Error(`forkSession (copy messages): ${msgError.message}`);
  }

  return { id: newSession.id };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await getDb().from("sessions").delete().eq("id", sessionId);
  if (error) throw new Error(`deleteSession: ${error.message}`);
}

export async function getSessionWidgets(
  sessionId: string
): Promise<WidgetSnapshot | null> {
  const { data, error } = await getDb()
    .from("sessions")
    .select("widget_data")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error(`getSessionWidgets: ${error.message}`);
  return (data?.widget_data as WidgetSnapshot | null) ?? null;
}

export async function updateSessionWidgetData(
  sessionId: string,
  widgetData: WidgetSnapshot
): Promise<void> {
  const { error } = await getDb()
    .from("sessions")
    .update({ widget_data: widgetData, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(`updateSessionWidgetData: ${error.message}`);
}

// Read this conversation's count of searches that returned Unsplash photos.
// Returns 0 when the session has none recorded yet (image_data null). Checked
// before an Unsplash fetch so the per-conversation cap can prevent it.
export async function getUnsplashSearchCount(
  sessionId: string
): Promise<number> {
  const { data, error } = await getDb()
    .from("sessions")
    .select("image_data")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error(`getUnsplashSearchCount: ${error.message}`);
  const imageData = data?.image_data as ImageData | null;
  return imageData?.unsplashSearches ?? 0;
}

// Bump this conversation's Unsplash-search counter by one. Called only after a
// search actually returned Unsplash photos, so the count tracks real usage.
// Atomic increment via the increment_session_unsplash_search RPC so concurrent
// turns in the same session can't lose a count (see the migration).
export async function bumpUnsplashSearchCount(
  sessionId: string
): Promise<void> {
  const { error } = await getDb().rpc("increment_session_unsplash_search", {
    p_session_id: sessionId,
  });
  if (error) throw new Error(`bumpUnsplashSearchCount: ${error.message}`);
}
