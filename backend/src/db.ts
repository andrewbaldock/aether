import { createClient } from "@supabase/supabase-js";

// A persisted knowledge-graph snapshot for a session: the merged nodes/links
// plus any drag-pinned positions. Stored as-is in the `graph_data` jsonb column
// so reopening (or reloading) a conversation restores the graph the user built,
// rather than relying on the model to re-emit it. The backend doesn't interpret
// the shape — it round-trips whatever the frontend saves.
export type GraphSnapshot = {
  nodes: unknown[];
  links: unknown[];
};

// Persisted render-tool specs for a session. Stored in `widget_data` jsonb.
// The backend doesn't interpret the shape — it round-trips whatever the
// frontend saves. null fields mean "nothing generated yet this session".
export type WidgetSnapshot = {
  table: unknown[] | null; // TableEntry[] (serialised)
  chart: unknown[] | null; // ChartEntry[] (serialised)
  timeline: unknown[] | null; // TimelineEntry[] (serialised)
  images: unknown[] | null; // ImagesEntry[] (serialised)
};

export interface Session {
  id: string;
  user_id: string;
  title: string | null;
  graph_mode: boolean;
  graph_data: GraphSnapshot | null;
  widget_data: WidgetSnapshot | null;
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
