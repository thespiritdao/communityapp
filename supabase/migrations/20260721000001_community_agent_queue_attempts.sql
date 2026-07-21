-- Retry support for the community-agent mention queue.
-- Transient failures (LLM error, forum post insert error) now requeue the item
-- with attempts+1 and only mark 'failed' after 3 attempts, instead of dying
-- silently on the first error. See /api/cron/community-agent/process-mentions.

ALTER TABLE community_agent_queue
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
