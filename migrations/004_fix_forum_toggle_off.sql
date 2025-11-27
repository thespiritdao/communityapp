-- ============================================================================
-- FIX FORUM TOGGLE OFF - Migration 004
-- ============================================================================
-- Date: 2025-11-14
-- Purpose: Make forums disappear when module is toggled OFF
--
-- Problem: forums_accessible_by_identity() RPC doesn't check pod_modules
-- Solution: Update RPC to filter out forums where module is disabled
-- ============================================================================

BEGIN;

-- ============================================================================
-- UPDATE forums_accessible_by_identity RPC TO CHECK MODULE ENABLEMENT
-- ============================================================================

-- Replace the existing RPC function with one that checks pod_modules
CREATE OR REPLACE FUNCTION forums_accessible_by_identity(
  user_tokens TEXT[],
  user_hats TEXT[]
)
RETURNS SETOF forum_categories
SECURITY DEFINER
LANGUAGE SQL STABLE AS $$
  WITH f_tokens AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id  -- 🆕 Check module status
    WHERE fcrt.token_or_hat = ANY (user_tokens)
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)  -- 🆕 Filter disabled
  ),
  f_hats AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id  -- 🆕 Check module status
    WHERE fcrt.token_or_hat = ANY (user_hats)
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)  -- 🆕 Filter disabled
  ),
  f_roles AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt ON fcrt.forum_category_id = fc.id
    JOIN pod_role_forum_access prfa ON prfa.hat_id = fcrt.token_or_hat
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id  -- 🆕 Check module status
    WHERE prfa.hat_id = ANY (user_hats)
      AND prfa.chat_access = TRUE
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)  -- 🆕 Filter disabled
  ),
  f_public AS (
    SELECT fc.*
    FROM forum_categories fc
    LEFT JOIN forum_category_required_tokens fcrt ON fcrt.forum_category_id = fc.id
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id  -- 🆕 Check module status
    WHERE fcrt.forum_category_id IS NULL
      AND (fc.required_token IS NULL OR fc.required_token = '')
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)  -- 🆕 Filter disabled
  )
  SELECT * FROM f_tokens
  UNION
  SELECT * FROM f_hats
  UNION
  SELECT * FROM f_roles
  UNION
  SELECT * FROM f_public;
$$;

COMMENT ON FUNCTION forums_accessible_by_identity(TEXT[], TEXT[]) IS 'Returns forum categories accessible by user, filtering out disabled pod modules';

-- Grant permissions
GRANT EXECUTE ON FUNCTION forums_accessible_by_identity(TEXT[], TEXT[]) TO anon, authenticated;

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- What changed:
-- 1. Added LEFT JOIN pod_modules to all CTEs in forums_accessible_by_identity
-- 2. Added filter: (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
--    - If pod_id IS NULL → Global forum (always show)
--    - If pod_id exists → Only show if forum_enabled = TRUE
--
-- Result: Forums immediately disappear when module is toggled OFF
-- ============================================================================
