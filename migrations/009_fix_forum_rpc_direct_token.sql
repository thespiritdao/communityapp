-- Migration 009: Fix forums_accessible_by_identity to support direct required_token
-- ============================================================================
-- Date: 2026-01-20
-- Purpose: Add support for pod forums that use direct required_token column
--
-- ISSUE: RPC function only checks forum_category_required_tokens link table,
-- but pod forums created via PodForumManager use direct required_token column.
--
-- SOLUTION: Add new CTE f_direct_token to check required_token column
-- ============================================================================

BEGIN;

-- Drop the old version
DROP FUNCTION IF EXISTS forums_accessible_by_identity(TEXT[], TEXT[]);

-- Create updated version with direct token support
CREATE OR REPLACE FUNCTION forums_accessible_by_identity(
  user_tokens TEXT[],
  user_hats TEXT[]
)
RETURNS SETOF forum_categories
SECURITY DEFINER
LANGUAGE SQL STABLE AS $$
  WITH f_tokens AS (
    -- Forums accessible via link table token ownership
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE fcrt.token_or_hat = ANY (user_tokens)
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  ),
  f_hats AS (
    -- Forums accessible via link table HAT ownership
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE fcrt.token_or_hat = ANY (user_hats)
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  ),
  f_roles AS (
    -- Forums accessible via pod role permissions
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt ON fcrt.forum_category_id = fc.id
    JOIN pod_role_forum_access prfa ON prfa.hat_id = fcrt.token_or_hat
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE prfa.hat_id = ANY (user_hats)
      AND prfa.chat_access = TRUE
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  ),
  f_direct_token AS (
    -- 🆕 Forums accessible via DIRECT required_token column (POD FORUMS)
    -- This is used by PodForumManager when creating forums
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE fc.required_token IS NOT NULL
      AND fc.required_token != ''
      AND LOWER(fc.required_token) = ANY (
        -- Check if user owns the required token/HAT
        SELECT LOWER(unnest) FROM unnest(user_hats || user_tokens)
      )
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  ),
  f_public AS (
    -- Public forums with no token requirements
    SELECT fc.*
    FROM forum_categories fc
    LEFT JOIN forum_category_required_tokens fcrt ON fcrt.forum_category_id = fc.id
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE fcrt.forum_category_id IS NULL
      AND (fc.required_token IS NULL OR fc.required_token = '')
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  )
  SELECT * FROM f_tokens
  UNION
  SELECT * FROM f_hats
  UNION
  SELECT * FROM f_roles
  UNION
  SELECT * FROM f_direct_token  -- 🆕 Added pod forum support
  UNION
  SELECT * FROM f_public;
$$;

-- Update function comment
COMMENT ON FUNCTION forums_accessible_by_identity(TEXT[], TEXT[]) IS
  'Returns forum categories accessible to user. Supports both link table (forum_category_required_tokens) and direct column (required_token) access patterns. Fixed in migration 009 to support pod forums.';

-- Grant execute permissions
REVOKE ALL ON FUNCTION forums_accessible_by_identity(TEXT[],TEXT[]) FROM public;
GRANT EXECUTE ON FUNCTION forums_accessible_by_identity(TEXT[],TEXT[]) TO anon, authenticated;

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'MIGRATION 009 APPLIED SUCCESSFULLY';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'What was fixed:';
  RAISE NOTICE '• Added f_direct_token CTE to check required_token column';
  RAISE NOTICE '• Pod forums now appear in accessible categories';
  RAISE NOTICE '• Users can access threads in pod forums they have HATs for';
  RAISE NOTICE '';
  RAISE NOTICE 'Affected Features:';
  RAISE NOTICE '• /forum/thread/[id] - Thread viewing (ForumAccessGate)';
  RAISE NOTICE '• useUnifiedForumAccess hook - Permission checking';
  RAISE NOTICE '• Pod forum category access for all users';
  RAISE NOTICE '';
  RAISE NOTICE 'Testing:';
  RAISE NOTICE '1. Create a forum in a pod via PodForumManager';
  RAISE NOTICE '2. Create a thread in that forum';
  RAISE NOTICE '3. Visit /forum/thread/[id] as a member with the pod HAT';
  RAISE NOTICE '4. Access should be GRANTED (was denied before)';
  RAISE NOTICE '';
END $$;
