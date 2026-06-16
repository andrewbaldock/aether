-- Lock down the anon-facing surface left over from the original anon-key design.
--
-- WHY THIS FILE EXISTS
-- sql/001 was written when the backend connected with the ANON key, so it granted
-- anon EXECUTE on the counter RPCs and gave app_state an always-true anon read/write
-- policy. The backend now connects with the SERVICE-ROLE key (see sql/005 and
-- src/db.ts), which BYPASSES RLS and ignores table/function GRANTs entirely. That
-- makes every anon/authenticated/PUBLIC grant below dead weight — and Supabase's
-- linter flags it (advisors 0011, 0024, 0028, 0029). This migration removes the
-- unused access. Nothing the running app does goes through these paths, so there is
-- no behaviour change: service_role keeps full access throughout.
--
-- Run this once in the Supabase SQL editor (or via the MCP apply_migration tool).
-- Idempotent.

-- 1. Pin search_path on the two SECURITY DEFINER functions (advisor 0011).
-- A definer function with a mutable search_path can be hijacked by a caller who
-- puts a malicious object earlier on the path. ALTER ... SET does not touch the
-- body, so this is safe and repeatable.
alter function public.increment_app_counter(text, int)
  set search_path = public, pg_temp;
alter function public.increment_session_unsplash_search(uuid)
  set search_path = public, pg_temp;

-- 2. Revoke EXECUTE on both RPCs from PUBLIC / anon / authenticated (advisors 0028, 0029).
-- These are only ever called by the backend via getDb().rpc(...) using the
-- service-role key (src/appState.ts, src/db.ts). service_role retains EXECUTE
-- (it is granted by default and not revoked here), so the backend is unaffected.
revoke execute on function public.increment_app_counter(text, int)
  from public, anon, authenticated;
revoke execute on function public.increment_session_unsplash_search(uuid)
  from public, anon, authenticated;

-- 3. Replace app_state's always-true anon policy with read-only (advisor 0024).
-- app_state holds only operational counters (rate-limit buckets), not user data,
-- so public READ is harmless — but the old policy also let anon INSERT/UPDATE/DELETE
-- every row. The backend writes via service-role (bypasses RLS), so anon never
-- needs write. Advisor 0024 deliberately excludes SELECT ... USING (true), so a
-- read-only policy clears the warning while keeping the table reachable for reads.
drop policy if exists app_state_anon_rw on app_state;
drop policy if exists app_state_anon_read on app_state;
create policy app_state_anon_read on app_state
  for select
  to anon
  using (true);

-- 4. Revoke the default anon/authenticated WRITE grants on the app_state table.
-- Belt-and-suspenders for #3: even with the policy narrowed, the public-schema
-- default GRANTs still expose write privileges that nothing uses. Keep anon SELECT.
revoke insert, update, delete, truncate on table public.app_state from anon, authenticated;
revoke select on table public.app_state from authenticated;
-- anon SELECT intentionally retained (matches the read-only policy above).
