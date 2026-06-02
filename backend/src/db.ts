import { createClient } from "@supabase/supabase-js";

export interface Session {
  id: string;
  user_id: string;
  title: string | null;
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

function getDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be set in backend/.env"
    );
  }
  return createClient(url, key);
}

export async function createSession(
  userId: string,
  title?: string
): Promise<{ id: string }> {
  const { data, error } = await getDb()
    .from("sessions")
    .insert({ user_id: userId, title: title ?? null })
    .select("id")
    .single();
  if (error) throw new Error(`createSession: ${error.message}`);
  return { id: data.id };
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

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await getDb()
    .from("sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw new Error(`deleteSession: ${error.message}`);
}
