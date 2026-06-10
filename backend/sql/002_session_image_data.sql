-- Per-conversation image state for Aether sessions.
--
-- Backend-owned jsonb blob, distinct from widget_data (which is frontend-owned
-- and only written after a turn). The backend reads/increments this DURING a
-- turn — specifically to cap how many searches per conversation actually return
-- Unsplash photos — so it needs its own column to avoid racing the frontend's
-- after-turn widget_data write.
--
-- Shape: { "unsplashSearches": <int> }. null/absent means zero used.
--
-- Run this once in the Supabase SQL editor.

alter table sessions add column if not exists image_data jsonb;

-- Atomic increment of a conversation's Unsplash-search counter. Read-modify-write
-- from the app would race concurrent turns in the same session and lose counts;
-- this does it in a single statement inside the database. Initialises image_data
-- when absent. SECURITY DEFINER so it runs regardless of the caller's RLS context.
create or replace function increment_session_unsplash_search(p_session_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update sessions
    set image_data = jsonb_set(
          coalesce(image_data, '{}'::jsonb),
          '{unsplashSearches}',
          to_jsonb(coalesce((image_data->>'unsplashSearches')::int, 0) + 1)
        ),
        updated_at = now()
  where id = p_session_id;
end;
$$;

grant execute on function increment_session_unsplash_search(uuid) to anon;
