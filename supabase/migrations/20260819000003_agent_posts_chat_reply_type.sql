-- 20260819000003_agent_posts_chat_reply_type.sql
--
-- Fix: community_agent_posts rejected type 'chat_reply' — the chatHandler has
-- logged chat replies with this type since launch, but the CHECK constraint
-- never allowed it, so chat replies were silently unlogged AND the per-day
-- chat rate limit (which counts type='chat_reply' rows) always read zero.

ALTER TABLE community_agent_posts
  DROP CONSTRAINT IF EXISTS community_agent_posts_type_check;

ALTER TABLE community_agent_posts
  ADD CONSTRAINT community_agent_posts_type_check
  CHECK (type = ANY (ARRAY[
    'daily_discussion'::text,
    'event_creation'::text,
    'mention_reply'::text,
    'chat_reply'::text,
    'ritual'::text,
    'current_events'::text
  ]));
