-- Generic cross-instance shared state for Aether's backend.
--
-- Aether can run on more than one Fly machine (auto_start_machines = true), so
-- in-memory state isn't app-wide. This table is the shared store for anything
-- that must be consistent across every instance: rate-limit counters today,
-- and future global flags / counters / locks (one row per key, value is jsonb).
--
-- Run this once in the Supabase SQL editor.

create table if not exists app_state (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- The backend connects with the anon key, so RLS applies. These tables hold no
-- user data — just operational counters/flags — so allow the anon role to read
-- and write rows directly. (The counter increment goes through the SECURITY
-- DEFINER function below, but setState/getState use the table directly.)
alter table app_state enable row level security;

drop policy if exists app_state_anon_rw on app_state;
create policy app_state_anon_rw on app_state
  for all
  to anon
  using (true)
  with check (true);

-- Atomic counter increment. Reading a value then writing it back from the app
-- would race across concurrent requests / machines and lose increments. This
-- does the upsert-and-add in a single statement inside the database, so the
-- count is always correct no matter how many instances call it at once.
--
-- Stores the count under value->>'n'. Returns the NEW total after adding `delta`.
-- SECURITY DEFINER so it runs regardless of the caller's RLS context.
create or replace function increment_app_counter(p_key text, p_delta int default 1)
returns bigint
language plpgsql
security definer
as $$
declare
  new_total bigint;
begin
  insert into app_state (key, value, updated_at)
    values (p_key, jsonb_build_object('n', p_delta), now())
  on conflict (key) do update
    set value = jsonb_build_object(
          'n', coalesce((app_state.value->>'n')::bigint, 0) + p_delta
        ),
        updated_at = now()
  returning (value->>'n')::bigint into new_total;
  return new_total;
end;
$$;

grant execute on function increment_app_counter(text, int) to anon;
