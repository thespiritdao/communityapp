-- ============================================================================
-- UPDATE FORUM ACCESS VIEW - Migration 005
-- ============================================================================
-- Date: 2025-11-14
-- Purpose: Update pod_role_forum_access view to include forumAccess permission
--
-- Current: View only includes chatAccess, governanceParticipation, forumModeration
-- Update: Add forumAccess column (the new permission we added)
-- ============================================================================

BEGIN;

-- ============================================================================
-- RECREATE pod_role_forum_access VIEW WITH forumAccess
-- ============================================================================

-- Drop existing view
DROP VIEW IF EXISTS pod_role_forum_access CASCADE;

-- Recreate with forumAccess included
CREATE VIEW pod_role_forum_access AS
SELECT
  p.id AS pod_id,
  p.name AS pod_name,
  prp.token_address AS hat_id,
  prp.role_name,
  COALESCE((prp.permissions::JSONB->>'chatAccess')::BOOLEAN, FALSE) AS chat_access,
  COALESCE((prp.permissions::JSONB->>'forumAccess')::BOOLEAN, FALSE) AS forum_access,  -- 🆕 NEW
  COALESCE((prp.permissions::JSONB->>'governanceParticipation')::BOOLEAN, FALSE) AS governance_participation,
  COALESCE((prp.permissions::JSONB->>'forumModeration')::BOOLEAN, FALSE) AS forum_moderation
FROM pod_role_permissions prp
JOIN pods p ON p.id = prp.pod_id
WHERE prp.is_active = TRUE;

COMMENT ON VIEW pod_role_forum_access IS 'View of pod roles with forum-related permissions including forumAccess';

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- What changed:
-- 1. Added forum_access column to pod_role_forum_access view
-- 2. Extracts forumAccess permission from role permissions JSONB
-- 3. Defaults to FALSE if permission not set
--
-- Impact: Forum access checks can now use the dedicated forumAccess permission
-- ============================================================================
