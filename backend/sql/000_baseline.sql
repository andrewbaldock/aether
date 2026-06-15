-- Baseline schema for Aether: the `sessions` and `messages` tables.
--
-- WHY THIS FILE EXISTS
-- These two tables were originally created by hand in the Supabase console, so
-- they had no migration of their own — only the later `alter table` migrations
-- (002/003/004) were scripted. That left sql/ unable to recreate the database
-- from scratch: the alters had nothing to alter. This file closes that gap. It
-- declares the FULL current shape of both tables (every column, including the
-- ones 002/003/004 add), so replaying sql/ in order on an empty database
-- reproduces production exactly.
--
-- It is written with `create table if not exists` / `add column if not exists`
-- and is therefore SAFE to run against the existing production database — it's a
-- no-op there. The later alter-migrations stay as they are (also idempotent), so
-- both paths — fresh replay and an already-migrated DB — converge on the same
-- schema. See sql/README.md for the full replay procedure.
--
-- Run this once in the Supabase SQL editor (or as part of a full replay).

-- ── sessions ────────────────────────────────────────────────────────────────
-- One row per conversation. The TypeScript `Session` interface in
-- backend/src/db.ts is the app-side mirror of this shape; keep them in step.
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  -- Auto-generated from the first user message (a one-shot Haiku call); user can
  -- rename. null until the first turn names it.
  title       text,
  -- Model-chosen lucide-react icon name (PascalCase, e.g. "Trophy") matching the
  -- topic; set once alongside the title. null until then. (See 004.)
  topic_icon  text,
  -- Whether the knowledge graph is on for this conversation.
  graph_mode  boolean not null default true,
  -- Knowledge-graph snapshot (nodes/links + saved positions). Frontend-owned.
  graph_data  jsonb,
  -- Table/chart/timeline/images specs. Frontend-owned; written after a turn.
  widget_data jsonb,
  -- Backend-owned per-conversation counters (e.g. Unsplash searches). Written
  -- DURING a turn, so it's a separate column from widget_data. (See 002.)
  image_data  jsonb,
  -- Frontend-owned per-conversation UI memory (active tab, Tiles layout). (See 003.)
  ui_state    jsonb,
  -- The Claude model last selected for this conversation. null = server default.
  model       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Defensive add-columns: if an OLDER sessions table already exists (created in the
-- console before this file), these bring it up to the full shape. No-ops on a
-- table just created above, and overlap harmlessly with 002/003/004.
alter table sessions add column if not exists topic_icon  text;
alter table sessions add column if not exists graph_data  jsonb;
alter table sessions add column if not exists widget_data jsonb;
alter table sessions add column if not exists image_data  jsonb;
alter table sessions add column if not exists ui_state    jsonb;
alter table sessions add column if not exists model       text;

-- ── messages ────────────────────────────────────────────────────────────────
-- One row per chat turn, ordered by created_at, scoped to a session.
create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid references sessions (id),
  role       text check (role = any (array['user'::text, 'assistant'::text])),
  content    text not null,
  created_at timestamptz default now()
);

create index if not exists messages_session_id_idx on messages (session_id);
