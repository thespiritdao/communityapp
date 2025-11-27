-- ============================================================================
-- USE forumAccess PERMISSION - Migration 006
-- ============================================================================
-- Date: 2025-11-14
-- Purpose: Update RPC functions to use forumAccess instead of chatAccess
--
-- Semantic correctness: Forum operations should check forumAccess, not chatAccess
-- ============================================================================

BEGIN;

-- ============================================================================
-- UPDATE can_post_in_category TO USE forumAccess
-- ============================================================================

CREATE OR REPLACE FUNCTION can_post_in_category(
  category_id UUID,
  user_tokens TEXT[],
  user_hats TEXT[]
)
RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM forums_accessible_by_identity(user_tokens, user_hats)
    WHERE id = category_id
  ) AND EXISTS (
    SELECT 1 FROM pod_role_forum_access
    WHERE hat_id = ANY (user_hats)
      AND forum_access = TRUE  -- 🔄 Changed from chat_access to forum_access
  );
$$;

COMMENT ON FUNCTION can_post_in_category(UUID, TEXT[], TEXT[]) IS 'Check if user can post in category using forumAccess permission';

-- ============================================================================
-- UPDATE get_user_forum_permissions TO USE forumAccess
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_forum_permissions(
  user_tokens TEXT[],
  user_hats TEXT[]
)
RETURNS TABLE (
  can_moderate BOOLEAN,
  can_post BOOLEAN,
  can_participate_governance BOOLEAN,
  accessible_category_count INTEGER
) AS $$
  SELECT
    is_forum_moderator(user_hats) AS can_moderate,
    EXISTS (
      SELECT 1 FROM pod_role_forum_access
      WHERE hat_id = ANY (user_hats) AND forum_access = TRUE  -- 🔄 Changed from chat_access
    ) AS can_post,
    EXISTS (
      SELECT 1 FROM pod_role_forum_access
      WHERE hat_id = ANY (user_hats) AND governance_participation = TRUE
    ) AS can_participate_governance,
    (SELECT COUNT(*)::INTEGER FROM forums_accessible_by_identity(user_tokens, user_hats)) AS accessible_category_count;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_user_forum_permissions(TEXT[], TEXT[]) IS 'Get user forum permissions using forumAccess permission';

-- ============================================================================
-- UPDATE forums_accessible_by_identity TO USE forumAccess
-- ============================================================================

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
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE fcrt.token_or_hat = ANY (user_tokens)
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  ),
  f_hats AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE fcrt.token_or_hat = ANY (user_hats)
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  ),
  f_roles AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt ON fcrt.forum_category_id = fc.id
    JOIN pod_role_forum_access prfa ON prfa.hat_id = fcrt.token_or_hat
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE prfa.hat_id = ANY (user_hats)
      AND prfa.forum_access = TRUE  -- 🔄 Changed from chat_access to forum_access
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  ),
  f_public AS (
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
  SELECT * FROM f_public;
$$;

COMMENT ON FUNCTION forums_accessible_by_identity(TEXT[], TEXT[]) IS 'Returns accessible forums using forumAccess permission and checking module enablement';

-- Grant permissions
GRANT EXECUTE ON FUNCTION can_post_in_category(UUID, TEXT[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_forum_permissions(TEXT[], TEXT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION forums_accessible_by_identity(TEXT[], TEXT[]) TO anon, authenticated;

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- What changed:
-- 1. can_post_in_category: chat_access → forum_access
-- 2. get_user_forum_permissions: chat_access → forum_access
-- 3. forums_accessible_by_identity: chat_access → forum_access
--
-- Why: Forum operations should check forumAccess, not chatAccess
-- Impact: More semantically correct permissions (chat vs forum are separate)
-- ============================================================================
