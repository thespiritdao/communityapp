-- Migration: Create events_accessible_by_identity Function
-- This creates ONLY the missing event access control infrastructure
-- WITHOUT touching the tokens table

-- ============================================================================
-- 1. CREATE EVENT ACCESS CONTROL TABLE
-- ============================================================================

-- Create link table for event required tokens
CREATE TABLE IF NOT EXISTS event_required_tokens (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token_or_hat TEXT NOT NULL,                 -- lowercased 0x... address (hat id or ERC-20/NFT)
  source TEXT NOT NULL DEFAULT 'manual',      -- 'manual' | 'pod' | 'template'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, token_or_hat)
);

-- Create index for efficient token lookups
CREATE INDEX IF NOT EXISTS event_required_tokens_idx
  ON event_required_tokens(token_or_hat);

COMMENT ON TABLE event_required_tokens IS 'Links events to required tokens/HATs for access control';
COMMENT ON COLUMN event_required_tokens.token_or_hat IS 'Lowercased 0x address - can be ERC-20, ERC-721, or HAT ID';

-- ============================================================================
-- 2. CREATE RPC FUNCTION FOR ACCESSIBLE EVENTS
-- ============================================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS events_accessible_by_identity(TEXT[], TEXT[]);

-- Create the RPC function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION events_accessible_by_identity(
  user_tokens TEXT[],    -- lowercased token addresses (ERC-20/721/NFT/etc.)
  user_hats   TEXT[]     -- lowercased hat IDs the wallet holds
)
RETURNS SETOF events
SECURITY DEFINER
LANGUAGE SQL STABLE AS $$
  WITH e_tokens AS (
    -- Events accessible via direct token ownership
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    WHERE ert.token_or_hat = ANY (user_tokens)
  ),
  e_hats AS (
    -- Events accessible via direct hat ownership
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    WHERE ert.token_or_hat = ANY (user_hats)
  ),
  e_roles AS (
    -- Events accessible via pod role permissions (if pod_role_forum_access view exists)
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    JOIN pod_role_forum_access prfa
      ON prfa.hat_id = ert.token_or_hat AND prfa.forum_access = TRUE
    WHERE ert.token_or_hat = ANY (user_hats)
  ),
  e_no_requirements AS (
    -- Events with no token requirements (public events)
    SELECT DISTINCT e.*
    FROM events e
    WHERE NOT EXISTS (
      SELECT 1 FROM event_required_tokens ert
      WHERE ert.event_id = e.id
    )
    AND (e.required_tokens IS NULL OR array_length(e.required_tokens, 1) IS NULL)
  ),
  e_legacy_requirements AS (
    -- Handle legacy required_tokens column for backward compatibility
    -- Check if any token from required_tokens array matches user tokens/hats
    SELECT DISTINCT e.*
    FROM events e
    CROSS JOIN unnest(e.required_tokens) AS token
    WHERE e.required_tokens IS NOT NULL
      AND array_length(e.required_tokens, 1) > 0
      AND (
        LOWER(token) = ANY (user_tokens) OR
        LOWER(token) = ANY (user_hats)
      )
  )

  SELECT * FROM e_tokens
  UNION
  SELECT * FROM e_hats
  UNION
  SELECT * FROM e_roles
  UNION
  SELECT * FROM e_no_requirements
  UNION
  SELECT * FROM e_legacy_requirements
  ORDER BY event_date ASC;
$$;

-- Grant execute permissions on the RPC function
REVOKE ALL ON FUNCTION events_accessible_by_identity(TEXT[],TEXT[]) FROM public;
GRANT EXECUTE ON FUNCTION events_accessible_by_identity(TEXT[],TEXT[]) TO anon, authenticated;

COMMENT ON FUNCTION events_accessible_by_identity IS 'Returns events accessible to a user based on their token/HAT holdings';

-- ============================================================================
-- 3. BACKFILL EXISTING EVENT TOKEN REQUIREMENTS
-- ============================================================================

-- Migrate existing required_tokens values to the link table
-- Since required_tokens is an array, we need to unnest it
INSERT INTO event_required_tokens (event_id, token_or_hat, source)
SELECT
  e.id as event_id,
  LOWER(token) as token_or_hat,
  'migration' as source
FROM events e
CROSS JOIN unnest(e.required_tokens) AS token
WHERE e.required_tokens IS NOT NULL
  AND array_length(e.required_tokens, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM event_required_tokens ert
    WHERE ert.event_id = e.id
    AND ert.token_or_hat = LOWER(token)
  )
ON CONFLICT (event_id, token_or_hat) DO NOTHING;

-- ============================================================================
-- 4. OPTIONAL: ENABLE ROW LEVEL SECURITY ON EVENTS
-- ============================================================================

-- Enable RLS on event tables if not already enabled
DO $$
BEGIN
    -- Enable RLS on events if not already enabled
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE tablename = 'events' AND rowsecurity = true
    ) THEN
        ALTER TABLE events ENABLE ROW LEVEL SECURITY;
    END IF;

    -- Enable RLS on event_required_tokens
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE tablename = 'event_required_tokens' AND rowsecurity = true
    ) THEN
        ALTER TABLE event_required_tokens ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS allow_read_published_events ON events;
DROP POLICY IF EXISTS allow_creator_manage_events ON events;
DROP POLICY IF EXISTS allow_read_event_tokens ON event_required_tokens;
DROP POLICY IF EXISTS allow_creator_manage_event_tokens ON event_required_tokens;

-- Policy to allow reading published events
CREATE POLICY allow_read_published_events ON events
  FOR SELECT USING (status = 'published' OR status = 'completed');

-- Policy to allow event creators to manage their events
CREATE POLICY allow_creator_manage_events ON events
  FOR ALL USING (
    creator_address = (
      SELECT wallet_address
      FROM user_profiles
      WHERE user_id = auth.uid()
    )
  );

-- Policy for event_required_tokens - allow reading
CREATE POLICY allow_read_event_tokens ON event_required_tokens
  FOR SELECT USING (TRUE);

-- Policy to allow event creators to manage their event tokens
CREATE POLICY allow_creator_manage_event_tokens ON event_required_tokens
  FOR ALL USING (
    event_id IN (
      SELECT id FROM events
      WHERE creator_address = (
        SELECT wallet_address
        FROM user_profiles
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- DONE
-- ============================================================================

COMMIT;
