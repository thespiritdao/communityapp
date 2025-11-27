-- Migration: Implement Forum Link Table Access Control System
-- This migration creates the infrastructure for multi-token forum access control

-- ============================================================================
-- 1. CREATE LINK TABLE FOR FORUM CATEGORIES
-- ============================================================================

-- Create the link table for forum category required tokens
CREATE TABLE IF NOT EXISTS forum_category_required_tokens (
  forum_category_id UUID NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
  token_or_hat TEXT NOT NULL,                 -- lowercased 0x... address (hat id or ERC-20/NFT)
  source TEXT NOT NULL DEFAULT 'manual',      -- 'manual' | 'pod' | 'template' (optional)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (forum_category_id, token_or_hat)
);

-- Create index for efficient token lookups
CREATE INDEX IF NOT EXISTS forum_cat_required_tokens_idx 
  ON forum_category_required_tokens(token_or_hat);

-- ============================================================================
-- 2. CREATE POD ROLE FORUM ACCESS VIEW
-- ============================================================================

-- View to expose hat → "forum access" quickly from pod_role_permissions
CREATE OR REPLACE VIEW pod_role_forum_access AS
SELECT
  p.id AS pod_id,
  prp.hat_id::TEXT AS hat_id,
  ( (prp.permissions::JSONB->>'chatAccess')::BOOLEAN
    OR (prp.permissions::JSONB->>'governanceParticipation')::BOOLEAN
    OR (prp.permissions::JSONB->>'forumModeration')::BOOLEAN
  ) AS forum_access
FROM pod_role_permissions prp
JOIN pods p ON p.id = prp.pod_id
WHERE prp.is_active = TRUE;

-- ============================================================================
-- 3. CREATE RPC FUNCTION FOR ACCESSIBLE FORUMS
-- ============================================================================

-- Main RPC function to return accessible forums for a user's owned tokens + owned hats
CREATE OR REPLACE FUNCTION forums_accessible_by_identity(
  user_tokens TEXT[],    -- lowercased token addresses (ERC-20/721/NFT/etc.)
  user_hats   TEXT[]     -- lowercased hat IDs the wallet holds
)
RETURNS SETOF forum_categories
LANGUAGE SQL STABLE AS $$
  WITH f_tokens AS (
    -- Forums accessible via direct token ownership
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    WHERE fcrt.token_or_hat = ANY (user_tokens)
  ),
  f_hats AS (
    -- Forums accessible via direct hat ownership
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    WHERE fcrt.token_or_hat = ANY (user_hats)
  ),
  f_roles AS (
    -- Forums accessible via pod role permissions
    -- If a forum lists a pod's leader/member hat in the link table,
    -- and the user owns any hat that has forum_access=true, they also get in.
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    JOIN pod_role_forum_access prfa
      ON prfa.hat_id = fcrt.token_or_hat
     AND prfa.forum_access = TRUE
    WHERE fcrt.token_or_hat = ANY (user_hats)
  ),
  f_no_requirements AS (
    -- Forums with no token requirements (public forums)
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    WHERE NOT EXISTS (
      SELECT 1 FROM forum_category_required_tokens fcrt 
      WHERE fcrt.forum_category_id = fc.id
    )
    AND (fc.required_token IS NULL OR fc.required_token = '')
  )
  
  SELECT * FROM f_tokens
  UNION
  SELECT * FROM f_hats
  UNION
  SELECT * FROM f_roles
  UNION
  SELECT * FROM f_no_requirements
  ORDER BY created_at DESC NULLS LAST;
$$;

-- ============================================================================
-- 4. BACKFILL EXISTING DATA
-- ============================================================================

-- Get the existing forum categories and their tokens for backfill
-- This assumes your categories have IDs like shown in errors.txt

-- General forum (accepts two tokens based on errors.txt)
INSERT INTO forum_category_required_tokens (forum_category_id, token_or_hat, source)
VALUES
  ('00000000-0000-0000-0000-000000000001'::UUID, LOWER('0x756d2ad6642c2ed43fd87af70d83f277ec0a669f'), 'migration'),
  ('00000000-0000-0000-0000-000000000001'::UUID, LOWER('0x246Cf64b9aE5d63207242Dbd466F3628d14746FF'), 'migration')
ON CONFLICT (forum_category_id, token_or_hat) DO NOTHING;

-- Executive Pod forum (accepts both leader + member hats)
INSERT INTO forum_category_required_tokens (forum_category_id, token_or_hat, source)
VALUES
  ('818a2a59-5d79-4ec4-8752-da87c480e7e9'::UUID, LOWER('0x0000008800010000000000000000000000000000000000000000000000000000'), 'migration'),
  ('818a2a59-5d79-4ec4-8752-da87c480e7e9'::UUID, LOWER('0x0000008800010001000000000000000000000000000000000000000000000000'), 'migration')
ON CONFLICT (forum_category_id, token_or_hat) DO NOTHING;

-- Backfill any other existing categories with required_token values
INSERT INTO forum_category_required_tokens (forum_category_id, token_or_hat, source)
SELECT 
  id as forum_category_id,
  LOWER(required_token) as token_or_hat,
  'migration' as source
FROM forum_categories 
WHERE required_token IS NOT NULL 
  AND required_token != ''
  AND LOWER(required_token) NOT IN (
    SELECT token_or_hat FROM forum_category_required_tokens
  )
ON CONFLICT (forum_category_id, token_or_hat) DO NOTHING;

-- ============================================================================
-- 5. OPTIONAL: ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on forum tables for enhanced security
ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_category_required_tokens ENABLE ROW LEVEL SECURITY;

-- Create policy to deny direct SELECT on forum_categories (force use of RPC)
CREATE POLICY deny_raw_select_forums ON forum_categories
  FOR SELECT USING (FALSE);

-- Create policy to deny direct SELECT on forum_category_required_tokens
CREATE POLICY deny_raw_select_forum_tokens ON forum_category_required_tokens
  FOR SELECT USING (FALSE);

-- Make the RPC function security definer to bypass RLS
CREATE OR REPLACE FUNCTION forums_accessible_by_identity(user_tokens TEXT[], user_hats TEXT[])
RETURNS SETOF forum_categories
SECURITY DEFINER
LANGUAGE SQL STABLE AS $$
  WITH f_tokens AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    WHERE fcrt.token_or_hat = ANY (user_tokens)
  ),
  f_hats AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    WHERE fcrt.token_or_hat = ANY (user_hats)
  ),
  f_roles AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    JOIN pod_role_forum_access prfa
      ON prfa.hat_id = fcrt.token_or_hat
     AND prfa.forum_access = TRUE
    WHERE fcrt.token_or_hat = ANY (user_hats)
  ),
  f_no_requirements AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    WHERE NOT EXISTS (
      SELECT 1 FROM forum_category_required_tokens fcrt 
      WHERE fcrt.forum_category_id = fc.id
    )
    AND (fc.required_token IS NULL OR fc.required_token = '')
  )
  
  SELECT * FROM f_tokens
  UNION
  SELECT * FROM f_hats
  UNION
  SELECT * FROM f_roles
  UNION
  SELECT * FROM f_no_requirements
  ORDER BY created_at DESC NULLS LAST;
$$;

-- Grant execute permissions on the RPC function
REVOKE ALL ON FUNCTION forums_accessible_by_identity(TEXT[],TEXT[]) FROM public;
GRANT EXECUTE ON FUNCTION forums_accessible_by_identity(TEXT[],TEXT[]) TO anon, authenticated;

-- ============================================================================
-- 6. CLEANUP: DEPRECATE OLD COLUMN (OPTIONAL)
-- ============================================================================

-- After migration is complete and tested, you can null out the old column
-- UPDATE forum_categories SET required_token = NULL
-- WHERE id IN ('00000000-0000-0000-0000-000000000001','818a2a59-5d79-4ec4-8752-da87c480e7e9');

-- ============================================================================
-- 7. VALIDATION QUERIES
-- ============================================================================

-- Test query to validate the migration worked
-- SELECT * FROM forums_accessible_by_identity(
--   ARRAY[LOWER('0x756d2ad6642c2ed43fd87af70d83f277ec0a669f')],
--   ARRAY[LOWER('0x0000008800010000000000000000000000000000000000000000000000000000')]
-- );

COMMIT;