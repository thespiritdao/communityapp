-- Migration: create explorer_events table
-- Stores hand-written DAO activity events for the Pulse feed
-- (e.g. member_introduced — fired when a user first sets their name on their profile)

CREATE TABLE IF NOT EXISTS explorer_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT NOT NULL,
  actor      TEXT,                  -- wallet address
  title      TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_explorer_events_type       ON explorer_events (type);
CREATE INDEX IF NOT EXISTS idx_explorer_events_actor      ON explorer_events (actor);
CREATE INDEX IF NOT EXISTS idx_explorer_events_created_at ON explorer_events (created_at DESC);

ALTER TABLE explorer_events ENABLE ROW LEVEL SECURITY;

-- Public read — Pulse feed is visible to everyone
CREATE POLICY "explorer_events_public_read"
  ON explorer_events FOR SELECT
  USING (true);

-- Only service role can insert (API route uses supabaseAdmin)
CREATE POLICY "explorer_events_service_insert"
  ON explorer_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
