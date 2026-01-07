-- migrations/007_fix_public_forum_access.sql
-- ============================================================================
-- FIX: Beta testers can't access General forum
-- ============================================================================
-- Problem: forums_accessible_by_identity() only returns forums with token requirements
--          General forum has required_token=NULL and pod_id=NULL (public forum)
--          RPC uses JOIN forum_category_required_tokens which excludes public forums
--
-- Solution: Add a CTE for public forums (no token requirements) that are always accessible
-- ============================================================================

BEGIN;

-- Drop existing function
DROP FUNCTION IF EXISTS forums_accessible_by_identity(TEXT[], TEXT[]);

-- Create updated function with public forums support
CREATE OR REPLACE FUNCTION forums_accessible_by_identity(
  user_tokens TEXT[],
  user_hats TEXT[]
)
RETURNS SETOF forum_categories
SECURITY DEFINER
LANGUAGE SQL STABLE AS $$
  WITH
  -- 🆕 Public forums: No token requirements, always accessible to logged-in users
  f_public AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE
      -- Forum must be marked as public OR have no required tokens
      (fc.required_token IS NULL OR fc.required_token = '')
      -- AND must not be a pod forum (pod forums require membership)
      AND fc.pod_id IS NULL
      -- Pod modules check not needed since pod_id IS NULL
  ),
  -- Token-gated forums
  f_tokens AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE fcrt.token_or_hat = ANY (user_tokens)
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  ),
  -- HAT-gated forums
  f_hats AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE fcrt.token_or_hat = ANY (user_hats)
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  ),
  -- Pod role-based forums
  f_roles AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt ON fcrt.forum_category_id = fc.id
    JOIN pod_role_forum_access prfa ON prfa.hat_id = fcrt.token_or_hat
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE prfa.hat_id = ANY (user_hats)
      AND prfa.forum_access = TRUE
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  )
  -- 🔄 UNION all accessible forums (including public)
  SELECT * FROM f_public
  UNION
  SELECT * FROM f_tokens
  UNION
  SELECT * FROM f_hats
  UNION
  SELECT * FROM f_roles;
$$;

COMMENT ON FUNCTION forums_accessible_by_identity(TEXT[], TEXT[]) IS
  'Returns accessible forums: public forums (required_token IS NULL) + token/HAT-gated forums + role-based forums';

-- Grant permissions
GRANT EXECUTE ON FUNCTION forums_accessible_by_identity(TEXT[], TEXT[]) TO anon, authenticated;

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- What changed:
-- 1. Added f_public CTE for forums with required_token IS NULL or ''
-- 2. Added condition: fc.pod_id IS NULL (public forums can't be pod forums)
-- 3. Added f_public to final UNION
--
-- Result: General forum now accessible to all logged-in users (including beta testers)
-- ============================================================================
