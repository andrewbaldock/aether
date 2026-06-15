-- Per-conversation topic icon for Aether sessions.
--
-- A model-chosen lucide-react icon name (PascalCase, e.g. "Trophy") that best
-- matches the conversation's topic. Set once, alongside the auto-generated title
-- (same one-shot Haiku call — no extra API cost), and never overwritten after.
-- null until the first turn names the conversation. The frontend validates the
-- name against the real lucide set before rendering, so a bad guess just falls
-- back to the default icon.
--
-- Run this once in the Supabase SQL editor.

alter table sessions add column if not exists topic_icon text;
