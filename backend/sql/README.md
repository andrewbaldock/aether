# Aether database schema (`sql/`)

This directory is the **source-of-truth mirror of the Supabase Postgres schema**.
The files here, run in numeric order on an empty database, recreate the exact
production schema. The live database is the ultimate truth; this directory is the
scripted, reviewable record of how to reproduce it.

There is **no automated migration runner** — Aether applies these by hand in the
Supabase SQL editor. Every file is written to be **idempotent** (`create … if not
exists`, `add column if not exists`, `create or replace function`), so running any
file against an already-migrated database is a safe no-op. That means you can
always re-run the whole directory top to bottom to converge on the current schema.

## The app-side mirror

The schema is mirrored in TypeScript, and the two must be kept in step:

- **`backend/src/db.ts`** — the `Session`, `DbMessage`, and related interfaces.
  This is what the backend compiles against.
- **`frontend/src/hooks/useSessionList.ts`** — the frontend's `Session` interface
  (a subset: the columns the UI reads).

When you add or change a column here, update those types in the same change. The
build will catch a drift in the TS↔TS direction (`bun run build` runs `tsc -b`),
but **nothing automatically checks SQL↔live or SQL↔TS** — that discipline is on us.

## Files

| File | Purpose |
| --- | --- |
| `000_baseline.sql` | Full `sessions` + `messages` tables (every current column). The starting point for a from-scratch replay. Safe no-op on the live DB. |
| `001_app_state.sql` | `app_state` table (cross-instance shared state) + RLS policy + `increment_app_counter()`. |
| `002_session_image_data.sql` | `sessions.image_data` jsonb + `increment_session_unsplash_search()`. |
| `003_session_ui_state.sql` | `sessions.ui_state` jsonb (active tab, Tiles layout). |
| `004_session_topic_icon.sql` | `sessions.topic_icon` text (model-chosen lucide topic icon). |

`000_baseline.sql` already includes the columns that 002/003/004 add, so a fresh
replay is correct even though those columns are also declared in their own files
(the duplicate `add column if not exists` is a harmless no-op). The later files
are kept intact so the history reads cleanly and so an already-migrated database
(which predates `000`) still has a file documenting each delta it received.

## Recreating the database from scratch

1. Create a new Supabase project (or reset the `public` schema).
2. In the SQL editor, run each file **in numeric order**: `000` → `001` → `002`
   → `003` → `004`.
3. Point the backend's `SUPABASE_URL` / key env vars at the new project.

## Adding a new migration

1. Create `00N_short_description.sql`, next number in sequence.
2. Open with a comment block: **why** the change exists and the **shape** of any
   new column (matching the style of the existing files).
3. Make every statement idempotent (`… if not exists`, `create or replace`).
4. Apply it in the Supabase SQL editor.
5. **Also update `000_baseline.sql`** to include the new column/table, so a
   from-scratch replay stays complete.
6. Update the matching TypeScript interfaces in `backend/src/db.ts` (and
   `frontend/src/hooks/useSessionList.ts` if the UI reads it).
7. Add a row to the table above.

## Security note (RLS)

`public.sessions` and `public.messages` currently have **Row Level Security
disabled** — anyone with the project's anon key can read or modify every row.
`app_state` has RLS enabled with an anon read/write policy (it holds only
operational counters, no user data). Enabling RLS on `sessions`/`messages`
without first writing access policies would lock the app out entirely, so it's
left as a deliberate, documented decision rather than a one-line fix. Revisit
when Aether moves past the demo stage (e.g. policies scoped to `user_id` once
real sign-in lands).
