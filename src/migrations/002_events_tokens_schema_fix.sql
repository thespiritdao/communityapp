-- Migration: Fix Events Tokens Schema Issues
-- This migration fixes the tokens table schema and adds event access control

-- ============================================================================
-- 1. FIX TOKENS TABLE SCHEMA
-- ============================================================================

-- Add missing columns to tokens table if they don't exist
DO $$ 
BEGIN 
    -- Add symbol column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='tokens' AND column_name='symbol') THEN
        ALTER TABLE tokens ADD COLUMN symbol TEXT;
        COMMENT ON COLUMN tokens.symbol IS 'Token symbol (e.g. ETH, BTC, PoC)';
    END IF;

    -- Add contract_address column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='tokens' AND column_name='contract_address') THEN
        ALTER TABLE tokens ADD COLUMN contract_address TEXT;
        COMMENT ON COLUMN tokens.contract_address IS 'Smart contract address for the token';
    END IF;

    -- Add is_active column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='tokens' AND column_name='is_active') THEN
        ALTER TABLE tokens ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        COMMENT ON COLUMN tokens.is_active IS 'Whether this token is active/available';
    END IF;

    -- Add created_at and updated_at if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='tokens' AND column_name='created_at') THEN
        ALTER TABLE tokens ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='tokens' AND column_name='updated_at') THEN
        ALTER TABLE tokens ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- ============================================================================
-- 2. POPULATE EXISTING TOKEN DATA
-- ============================================================================

-- Update existing tokens with symbols and contract addresses where we know them
DO $$
DECLARE
    poc_token_address TEXT := LOWER('0x756d2ad6642c2ed43fd87af70d83f277ec0a669f');
    exec_hat_id TEXT := LOWER('0x0000008800010000000000000000000000000000000000000000000000000000');
    dev_hat_id TEXT := LOWER('0x0000008800020000000000000000000000000000000000000000000000000000');
BEGIN
    -- Update Proof of Curiosity token
    UPDATE tokens 
    SET 
        symbol = 'PoC',
        contract_address = poc_token_address,
        is_active = TRUE
    WHERE LOWER(address) = poc_token_address OR LOWER(name) LIKE '%proof%curiosity%';

    -- Update Executive Pod HAT
    UPDATE tokens
    SET 
        symbol = 'EXEC-HAT',
        contract_address = exec_hat_id,
        is_active = TRUE
    WHERE LOWER(address) = exec_hat_id OR LOWER(name) LIKE '%executive%pod%';

    -- Update Dev Pod HAT
    UPDATE tokens
    SET 
        symbol = 'DEV-HAT',
        contract_address = dev_hat_id,
        is_active = TRUE
    WHERE LOWER(address) = dev_hat_id OR LOWER(name) LIKE '%dev%pod%';

    -- Set all tokens as active by default if not already set
    UPDATE tokens SET is_active = TRUE WHERE is_active IS NULL;
END $$;

-- ============================================================================
-- 3. CREATE EVENT ACCESS CONTROL INFRASTRUCTURE
-- ============================================================================

-- Create link table for event required tokens (similar to forum pattern)
CREATE TABLE IF NOT EXISTS event_required_tokens (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token_or_hat TEXT NOT NULL,                 -- lowercased 0x... address (hat id or ERC-20/NFT)
  source TEXT NOT NULL DEFAULT 'manual',      -- 'manual' | 'pod' | 'template' (optional)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, token_or_hat)
);

-- Create index for efficient token lookups
CREATE INDEX IF NOT EXISTS event_required_tokens_idx 
  ON event_required_tokens(token_or_hat);

-- ============================================================================
-- 4. CREATE RPC FUNCTION FOR ACCESSIBLE EVENTS
-- ============================================================================

-- RPC function to return accessible events for a user's owned tokens + owned hats
CREATE OR REPLACE FUNCTION events_accessible_by_identity(
  user_tokens TEXT[],    -- lowercased token addresses (ERC-20/721/NFT/etc.)
  user_hats   TEXT[]     -- lowercased hat IDs the wallet holds
)
RETURNS SETOF events
LANGUAGE SQL STABLE AS $$
  WITH e_tokens AS (
    -- Events accessible via direct token ownership
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert
      ON ert.event_id = e.id
    WHERE ert.token_or_hat = ANY (user_tokens)
  ),
  e_hats AS (
    -- Events accessible via direct hat ownership
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert
      ON ert.event_id = e.id
    WHERE ert.token_or_hat = ANY (user_hats)
  ),
  e_roles AS (
    -- Events accessible via pod role permissions
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert
      ON ert.event_id = e.id
    JOIN pod_role_forum_access prfa
      ON prfa.hat_id = ert.token_or_hat
     AND prfa.forum_access = TRUE
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
    AND (e.required_token_id IS NULL OR e.required_token_id = '')
  ),
  e_legacy_requirements AS (
    -- Handle legacy required_token_id column for backward compatibility
    SELECT DISTINCT e.*
    FROM events e
    WHERE e.required_token_id IS NOT NULL 
      AND e.required_token_id != ''
      AND (
        LOWER(e.required_token_id) = ANY (user_tokens) OR
        LOWER(e.required_token_id) = ANY (user_hats)
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

-- ============================================================================
-- 5. BACKFILL EXISTING EVENT TOKEN REQUIREMENTS
-- ============================================================================

-- Migrate existing required_token_id values to the link table
INSERT INTO event_required_tokens (event_id, token_or_hat, source)
SELECT 
  id as event_id,
  LOWER(required_token_id) as token_or_hat,
  'migration' as source
FROM events 
WHERE required_token_id IS NOT NULL 
  AND required_token_id != ''
  AND NOT EXISTS (
    SELECT 1 FROM event_required_tokens ert 
    WHERE ert.event_id = events.id 
    AND ert.token_or_hat = LOWER(events.required_token_id)
  )
ON CONFLICT (event_id, token_or_hat) DO NOTHING;

-- ============================================================================
-- 6. OPTIONAL: ENABLE ROW LEVEL SECURITY ON EVENTS
-- ============================================================================

-- Enable RLS on event tables for enhanced security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_required_tokens ENABLE ROW LEVEL SECURITY;

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

-- Policy for event_required_tokens - only allow reading
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

-- Make the RPC function security definer to bypass RLS
CREATE OR REPLACE FUNCTION events_accessible_by_identity(user_tokens TEXT[], user_hats TEXT[])
RETURNS SETOF events
SECURITY DEFINER
LANGUAGE SQL STABLE AS $$
  WITH e_tokens AS (
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    WHERE ert.token_or_hat = ANY (user_tokens)
  ),
  e_hats AS (
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    WHERE ert.token_or_hat = ANY (user_hats)
  ),
  e_roles AS (
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    JOIN pod_role_forum_access prfa
      ON prfa.hat_id = ert.token_or_hat AND prfa.forum_access = TRUE
    WHERE ert.token_or_hat = ANY (user_hats)
  ),
  e_no_requirements AS (
    SELECT DISTINCT e.*
    FROM events e
    WHERE NOT EXISTS (SELECT 1 FROM event_required_tokens ert WHERE ert.event_id = e.id)
    AND (e.required_token_id IS NULL OR e.required_token_id = '')
  ),
  e_legacy_requirements AS (
    SELECT DISTINCT e.*
    FROM events e
    WHERE e.required_token_id IS NOT NULL AND e.required_token_id != ''
      AND (LOWER(e.required_token_id) = ANY (user_tokens) OR LOWER(e.required_token_id) = ANY (user_hats))
  )
  
  SELECT * FROM e_tokens UNION SELECT * FROM e_hats UNION 
  SELECT * FROM e_roles UNION SELECT * FROM e_no_requirements UNION 
  SELECT * FROM e_legacy_requirements
  ORDER BY event_date ASC;
$$;

-- Grant execute permissions on the RPC function
REVOKE ALL ON FUNCTION events_accessible_by_identity(TEXT[],TEXT[]) FROM public;
GRANT EXECUTE ON FUNCTION events_accessible_by_identity(TEXT[],TEXT[]) TO anon, authenticated;

-- ============================================================================
-- 7. UPDATE TRIGGERS FOR AUTOMATIC TIMESTAMPS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger for tokens table
DROP TRIGGER IF EXISTS update_tokens_updated_at ON tokens;
CREATE TRIGGER update_tokens_updated_at 
    BEFORE UPDATE ON tokens 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add trigger for events table if it doesn't exist
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at 
    BEFORE UPDATE ON events 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;