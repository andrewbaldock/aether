-- Per-conversation UI state for Aether sessions.
--
-- A frontend-owned jsonb grab-bag for "how this conversation was last being
-- viewed" — distinct from widget_data (widget CONTENT) and backend-owned
-- image_data (mid-turn counters). Open-ended on purpose so future
-- per-conversation UI memories can be added without another migration.
--
-- Shape today: { "activeWidget": <widgetId|null> } — which capability tab was
-- last on top. null/absent means "no remembered tab".
--
-- Run this once in the Supabase SQL editor.

alter table sessions add column if not exists ui_state jsonb;
