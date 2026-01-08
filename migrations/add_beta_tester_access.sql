-- ============================================================================
-- BETA TESTER HAT ACCESS CONTROL MIGRATION
-- ============================================================================
-- Purpose: Grant Beta Tester Hat holders access to general forums, chat,
--          governance, and bounties
-- Date: 2025-12-17
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FORUM ACCESS FOR BETA TESTERS
-- ============================================================================

-- Add Beta Tester Hat to all public/general forum categories
-- This allows beta testers to access and participate in general discussions

-- First, check if there are any forum categories without specific token requirements
-- (public forums) and add Beta Tester Hat access to them
INSERT INTO forum_category_required_tokens (forum_category_id, token_or_hat, source)
SELECT
  fc.id AS forum_category_id,
  '0x000000880001000b000000000000000000000000000000000000000000000000' AS token_or_hat, -- BETA_TESTER_HAT
  'beta_tester_migration' AS source
FROM forum_categories fc
WHERE
  -- General/public forums (no pod_id or pod_id is NULL)
  fc.pod_id IS NULL
  -- Don't duplicate if already exists
  AND NOT EXISTS (
    SELECT 1 FROM forum_category_required_tokens fcrt
    WHERE fcrt.forum_category_id = fc.id
      AND fcrt.token_or_hat = '0x000000880001000b000000000000000000000000000000000000000000000000'
  );

-- Alternative: If you want to grant access to ALL forums (including pod forums),
-- uncomment the following and comment out the above:
/*
INSERT INTO forum_category_required_tokens (forum_category_id, token_or_hat, source)
SELECT
  fc.id AS forum_category_id,
  '0x000000880001000b000000000000000000000000000000000000000000000000' AS token_or_hat,
  'beta_tester_migration' AS source
FROM forum_categories fc
WHERE NOT EXISTS (
  SELECT 1 FROM forum_category_required_tokens fcrt
  WHERE fcrt.forum_category_id = fc.id
    AND fcrt.token_or_hat = '0x000000880001000b000000000000000000000000000000000000000000000000'
);
*/

-- ============================================================================
-- 2. CHAT ACCESS FOR BETA TESTERS
-- ============================================================================

-- Add Beta Tester Hat as required_token for general chat groups
-- Option A: Update specific chat groups by title (safer, more controlled)
UPDATE chat_groups
SET required_token = '0x000000880001000b000000000000000000000000000000000000000000000000'
WHERE
  (title ILIKE '%General%' OR title ILIKE '%Community%' OR title ILIKE '%Beta%')
  AND (required_token IS NULL OR required_token = '');

-- Option B: Create a new chat group specifically for beta testers
INSERT INTO chat_groups (title, description, required_token, created_at)
VALUES (
  'Beta Testers Chat',
  'Exclusive chat channel for Beta Tester Hat holders to discuss testing, provide feedback, and collaborate',
  '0x000000880001000b000000000000000000000000000000000000000000000000',
  NOW()
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. GOVERNANCE PROPOSAL VISIBILITY (OPTIONAL)
-- ============================================================================

-- Note: Governance participation is already handled in the frontend code
-- (canParticipateInGovernance function in accessControlUtils.ts)
-- No database changes needed for basic governance participation

-- However, if you want to create a separate governance category specifically
-- for beta testers, you can use the following:
/*
INSERT INTO forum_categories (name, description, pod_id, created_at)
VALUES (
  'Beta Governance',
  'Governance proposals and discussions visible only to Beta Tester Hat holders',
  NULL,
  NOW()
)
ON CONFLICT DO NOTHING;

-- Then add the Beta Tester Hat requirement to this new category
INSERT INTO forum_category_required_tokens (
  forum_category_id,
  token_or_hat,
  source
)
SELECT
  fc.id,
  '0x000000880001000b000000000000000000000000000000000000000000000000',
  'beta_tester_migration'
FROM forum_categories fc
WHERE fc.name = 'Beta Governance'
  AND NOT EXISTS (
    SELECT 1 FROM forum_category_required_tokens fcrt
    WHERE fcrt.forum_category_id = fc.id
  );
*/

-- ============================================================================
-- 4. VERIFICATION QUERIES
-- ============================================================================

-- Check which forums now have Beta Tester Hat access
SELECT
  fc.name AS forum_name,
  fc.description,
  fc.pod_id,
  fcrt.token_or_hat,
  fcrt.source
FROM forum_categories fc
LEFT JOIN forum_category_required_tokens fcrt ON fc.id = fcrt.forum_category_id
WHERE fcrt.token_or_hat = '0x000000880001000b000000000000000000000000000000000000000000000000'
ORDER BY fc.name;

-- Check which chat groups now have Beta Tester Hat access
SELECT
  id,
  title,
  description,
  required_token,
  created_at
FROM chat_groups
WHERE required_token = '0x000000880001000b000000000000000000000000000000000000000000000000'
ORDER BY created_at DESC;

-- Summary of Beta Tester Hat access grants
SELECT
  'Forums with Beta Tester Access' AS access_type,
  COUNT(*) AS count
FROM forum_category_required_tokens
WHERE token_or_hat = '0x000000880001000b000000000000000000000000000000000000000000000000'
UNION ALL
SELECT
  'Chat Groups with Beta Tester Access' AS access_type,
  COUNT(*) AS count
FROM chat_groups
WHERE required_token = '0x000000880001000b000000000000000000000000000000000000000000000000';

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================
-- To remove Beta Tester Hat access, run:
/*
BEGIN;

-- Remove from forum categories
DELETE FROM forum_category_required_tokens
WHERE token_or_hat = '0x000000880001000b000000000000000000000000000000000000000000000000'
  AND source = 'beta_tester_migration';

-- Remove from chat groups (optional - only if you want to revoke access)
UPDATE chat_groups
SET required_token = NULL
WHERE required_token = '0x000000880001000b000000000000000000000000000000000000000000000000';

-- Delete beta tester specific chat group (if created)
DELETE FROM chat_groups
WHERE title = 'Beta Testers Chat';

COMMIT;
*/

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Beta Tester Hat holders now have access to:
-- 1. General/public forums (via forum_category_required_tokens)
-- 2. General chat groups (via required_token field)
-- 3. Governance participation (via frontend canParticipateInGovernance)
-- 4. Bounty system access (via frontend canAccessBounties)
-- ============================================================================
