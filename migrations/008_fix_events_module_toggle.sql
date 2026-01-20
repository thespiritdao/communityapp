-- Migration 008: Fix events_accessible_by_identity to enforce module toggles
-- ============================================================================
-- Date: 2026-01-19
-- Purpose: Address critical authorization bypass vulnerability in events RPC
--
-- VULNERABILITY: The events_accessible_by_identity RPC function does not check
-- pod_modules.events_enabled, allowing users to access events from pods where
-- the events module has been disabled by pod managers.
--
-- SOLUTION: Add LEFT JOIN to pod_modules in all CTEs and filter by events_enabled
-- ============================================================================

BEGIN;

-- Drop the vulnerable version
DROP FUNCTION IF EXISTS events_accessible_by_identity(TEXT[], TEXT[]);

-- Create the secure version with module toggle checks
CREATE OR REPLACE FUNCTION events_accessible_by_identity(
  user_tokens TEXT[],    -- lowercased token addresses (ERC-20/721/NFT/etc.)
  user_hats   TEXT[]     -- lowercased hat IDs the wallet holds
)
RETURNS SETOF events
SECURITY DEFINER
LANGUAGE SQL STABLE AS $$
  WITH e_tokens AS (
    -- Events accessible via direct token ownership
    -- 🔒 SECURITY: Now checks pod_modules.events_enabled
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE ert.token_or_hat = ANY (user_tokens)
      AND (
        e.organizing_pod_id IS NULL  -- Allow non-pod events
        OR pm.events_enabled = TRUE  -- 🔒 Module toggle check
      )
  ),
  e_hats AS (
    -- Events accessible via direct hat ownership
    -- 🔒 SECURITY: Now checks pod_modules.events_enabled
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE ert.token_or_hat = ANY (user_hats)
      AND (
        e.organizing_pod_id IS NULL  -- Allow non-pod events
        OR pm.events_enabled = TRUE  -- 🔒 Module toggle check
      )
  ),
  e_roles AS (
    -- Events accessible via pod role permissions
    -- 🔒 SECURITY: Now checks pod_modules.events_enabled
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    JOIN pod_role_forum_access prfa
      ON prfa.hat_id = ert.token_or_hat AND prfa.forum_access = TRUE
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE ert.token_or_hat = ANY (user_hats)
      AND (
        e.organizing_pod_id IS NULL  -- Allow non-pod events
        OR pm.events_enabled = TRUE  -- 🔒 Module toggle check
      )
  ),
  e_no_requirements AS (
    -- Events with no token requirements (public events)
    -- 🔒 SECURITY: Now checks pod_modules.events_enabled
    SELECT DISTINCT e.*
    FROM events e
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE NOT EXISTS (
      SELECT 1 FROM event_required_tokens ert
      WHERE ert.event_id = e.id
    )
    AND (e.required_tokens IS NULL OR array_length(e.required_tokens, 1) IS NULL)
    AND (
      e.organizing_pod_id IS NULL  -- Allow non-pod events
      OR pm.events_enabled = TRUE  -- 🔒 Module toggle check
    )
  ),
  e_legacy_requirements AS (
    -- Handle legacy required_tokens column for backward compatibility
    -- 🔒 SECURITY: Now checks pod_modules.events_enabled
    SELECT DISTINCT e.*
    FROM events e
    CROSS JOIN unnest(e.required_tokens) AS token
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE e.required_tokens IS NOT NULL
      AND array_length(e.required_tokens, 1) > 0
      AND (
        LOWER(token) = ANY (user_tokens) OR
        LOWER(token) = ANY (user_hats)
      )
      AND (
        e.organizing_pod_id IS NULL  -- Allow non-pod events
        OR pm.events_enabled = TRUE  -- 🔒 Module toggle check
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

-- Update function comment to reflect security fix
COMMENT ON FUNCTION events_accessible_by_identity(TEXT[], TEXT[]) IS
  'Returns events accessible to user based on token/HAT holdings AND pod module enablement. Fixed in migration 008 to enforce events_enabled toggle.';

-- Grant execute permissions
REVOKE ALL ON FUNCTION events_accessible_by_identity(TEXT[],TEXT[]) FROM public;
GRANT EXECUTE ON FUNCTION events_accessible_by_identity(TEXT[],TEXT[]) TO anon, authenticated;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these queries after migration to verify the fix works:

-- 1. Check events that should be blocked (events_enabled = false)
DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'MIGRATION 008 APPLIED SUCCESSFULLY';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'What was fixed:';
  RAISE NOTICE '• events_accessible_by_identity now checks pod_modules.events_enabled';
  RAISE NOTICE '• All 5 CTEs (e_tokens, e_hats, e_roles, e_no_requirements, e_legacy_requirements) now filter by module toggle';
  RAISE NOTICE '• Non-pod events (organizing_pod_id IS NULL) remain accessible';
  RAISE NOTICE '';
  RAISE NOTICE 'Verification steps:';
  RAISE NOTICE '1. Disable events module for a test pod in Controls tab';
  RAISE NOTICE '2. Verify events from that pod no longer appear for members';
  RAISE NOTICE '3. Re-enable module and verify events reappear';
  RAISE NOTICE '';
  RAISE NOTICE 'Security impact:';
  RAISE NOTICE '• BEFORE: Users could access events from pods with events_enabled = false';
  RAISE NOTICE '• AFTER: Module toggle is now properly enforced';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- DIAGNOSTIC QUERY
-- ============================================================================
-- Use this to identify events that were accessible before fix but blocked after:

/*
SELECT
  e.id,
  e.title,
  e.organizing_pod_id,
  p.name as pod_name,
  pm.events_enabled as module_enabled,
  CASE
    WHEN pm.events_enabled = false THEN '✅ Now blocked (was vulnerable)'
    WHEN pm.events_enabled = true THEN '✅ Accessible (module ON)'
    WHEN e.organizing_pod_id IS NULL THEN '✅ Public event (no pod)'
    ELSE '⚠️ Unknown state'
  END as security_status
FROM events e
LEFT JOIN pods p ON e.organizing_pod_id = p.id
LEFT JOIN pod_modules pm ON p.id = pm.pod_id
WHERE e.status = 'published'
ORDER BY
  CASE WHEN pm.events_enabled = false THEN 0 ELSE 1 END,  -- Show blocked first
  e.created_at DESC;
*/

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
/*
-- To rollback this migration (restore vulnerable version):

CREATE OR REPLACE FUNCTION events_accessible_by_identity(
  user_tokens TEXT[],
  user_hats   TEXT[]
)
RETURNS SETOF events
SECURITY DEFINER
LANGUAGE SQL STABLE AS $$
  -- ... original vulnerable version without module checks ...
$$;

COMMENT ON FUNCTION events_accessible_by_identity(TEXT[], TEXT[]) IS
  'VULNERABLE VERSION - Does not check module toggles';
*/
