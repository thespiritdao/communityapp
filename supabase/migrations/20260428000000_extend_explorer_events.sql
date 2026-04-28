-- Migration: extend explorer_events into a unified Pulse firehose
-- Adds the columns the Pulse API needs so every feature writes one row here
-- instead of /api/explorer/route.ts running 13 SELECTs against domain tables.
--
-- Backwards compatible:
--   - existing columns (id, type, actor, title, metadata, created_at) untouched
--   - existing writers (member-introduced, mint-hat) keep working
--   - existing rows stay valid (new columns default to NULL)

ALTER TABLE explorer_events
  ADD COLUMN IF NOT EXISTS category          TEXT,
  ADD COLUMN IF NOT EXISTS recipient_address TEXT,
  ADD COLUMN IF NOT EXISTS pod_id            UUID,
  ADD COLUMN IF NOT EXISTS amount_value      NUMERIC,
  ADD COLUMN IF NOT EXISTS amount_token      TEXT,
  ADD COLUMN IF NOT EXISTS url               TEXT,
  ADD COLUMN IF NOT EXISTS dedupe_key        TEXT;

-- dedupe_key is the safety net for backfills and idempotent writers.
-- A row with NULL dedupe_key is allowed (most live writes don't need it).
-- A row with non-NULL dedupe_key must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_explorer_events_dedupe_key
  ON explorer_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Read-path indexes — Pulse paginates by created_at DESC, optionally filtered
-- by category or pod_id, and the my-activity view filters by actor.
CREATE INDEX IF NOT EXISTS idx_explorer_events_category_created_at
  ON explorer_events (category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_explorer_events_pod_created_at
  ON explorer_events (pod_id, created_at DESC)
  WHERE pod_id IS NOT NULL;

-- The actor index from the original migration already covers
-- (actor) lookups; add a composite for actor + created_at for my-activity.
CREATE INDEX IF NOT EXISTS idx_explorer_events_actor_created_at
  ON explorer_events (actor, created_at DESC)
  WHERE actor IS NOT NULL;
