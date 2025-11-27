-- ============================================================================
-- POD-FORUM INTEGRATION MIGRATION
-- ============================================================================
-- Date: 2025-11-14
-- Purpose: Integrate forum module with pods
-- Changes:
--   1. Add pod_id to forum_categories to link forums to pods
--   2. Create auto-creation of forum categories when module is enabled
--   3. Update default permissions to include forumAccess and chatModeration
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD POD_ID TO FORUM_CATEGORIES
-- ============================================================================

-- Add pod_id column to link forum categories to pods
ALTER TABLE forum_categories
ADD COLUMN IF NOT EXISTS pod_id UUID REFERENCES pods(id) ON DELETE CASCADE;

-- Add index for performance when filtering by pod
CREATE INDEX IF NOT EXISTS idx_forum_categories_pod ON forum_categories(pod_id);

-- Add index for filtering by pod + active status
CREATE INDEX IF NOT EXISTS idx_forum_categories_pod_active ON forum_categories(pod_id)
WHERE pod_id IS NOT NULL;

COMMENT ON COLUMN forum_categories.pod_id IS 'Links forum category to a specific pod. NULL = global/community forum';

-- ============================================================================
-- 2. AUTO-CREATE FORUM CATEGORY WHEN MODULE IS ENABLED
-- ============================================================================

-- Function to create a forum category for a pod when forum module is enabled
CREATE OR REPLACE FUNCTION create_pod_forum_category()
RETURNS TRIGGER AS $$
DECLARE
  v_pod_name TEXT;
  v_category_id UUID;
  v_leader_hat_id TEXT;
BEGIN
  -- Only proceed if forum_enabled is being set to TRUE
  IF NEW.forum_enabled = TRUE AND (OLD.forum_enabled = FALSE OR OLD.forum_enabled IS NULL) THEN

    -- Get pod name
    SELECT name INTO v_pod_name
    FROM pods
    WHERE id = NEW.pod_id;

    -- Check if category already exists for this pod
    SELECT id INTO v_category_id
    FROM forum_categories
    WHERE pod_id = NEW.pod_id;

    -- If no category exists, create one
    IF v_category_id IS NULL THEN
      INSERT INTO forum_categories (name, description, pod_id, icon)
      VALUES (
        v_pod_name || ' Forum',
        'Discussion forum for ' || v_pod_name || ' members',
        NEW.pod_id,
        '💬'
      )
      RETURNING id INTO v_category_id;

      -- Get the leader HAT ID for this pod
      SELECT token_address INTO v_leader_hat_id
      FROM pod_role_permissions
      WHERE pod_id = NEW.pod_id
        AND role_name = 'Leader'
        AND is_active = TRUE
      LIMIT 1;

      -- If leader HAT exists, add it as required token for the forum
      IF v_leader_hat_id IS NOT NULL THEN
        INSERT INTO forum_category_required_tokens (forum_category_id, token_or_hat, source)
        VALUES (v_category_id, v_leader_hat_id, 'auto_pod_forum')
        ON CONFLICT (forum_category_id, token_or_hat) DO NOTHING;
      END IF;

      RAISE NOTICE 'Created forum category % for pod %', v_category_id, NEW.pod_id;
    ELSE
      RAISE NOTICE 'Forum category % already exists for pod %', v_category_id, NEW.pod_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on pod_modules table
DROP TRIGGER IF EXISTS trigger_create_pod_forum ON pod_modules;
CREATE TRIGGER trigger_create_pod_forum
AFTER UPDATE ON pod_modules
FOR EACH ROW
EXECUTE FUNCTION create_pod_forum_category();

COMMENT ON FUNCTION create_pod_forum_category() IS 'Automatically creates a forum category when a pod enables the forum module';

-- ============================================================================
-- 3. UPDATE DEFAULT ROLE PERMISSIONS
-- ============================================================================

-- Update all existing Leader roles to include forumAccess and chatModeration
UPDATE pod_role_permissions
SET permissions = jsonb_set(
  jsonb_set(
    permissions::jsonb,
    '{forumAccess}',
    'true'::jsonb
  ),
  '{chatModeration}',
  'true'::jsonb
)
WHERE role_name = 'Leader'
  AND is_active = TRUE
  AND (
    permissions->>'forumAccess' IS NULL
    OR permissions->>'chatModeration' IS NULL
  );

-- Update all existing Member roles to include forumAccess (but NOT chatModeration)
UPDATE pod_role_permissions
SET permissions = jsonb_set(
  permissions::jsonb,
  '{forumAccess}',
  'true'::jsonb
)
WHERE role_name = 'Member'
  AND is_active = TRUE
  AND permissions->>'forumAccess' IS NULL;

-- ============================================================================
-- 4. CREATE FUNCTION TO GET POD FORUMS
-- ============================================================================

-- Function to get all forum categories for pods where user has access
CREATE OR REPLACE FUNCTION get_user_pod_forums(user_address TEXT)
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
  category_description TEXT,
  category_icon TEXT,
  pod_id UUID,
  pod_name TEXT,
  has_forum_access BOOLEAN,
  has_moderation BOOLEAN
) AS $$
  SELECT DISTINCT
    fc.id AS category_id,
    fc.name AS category_name,
    fc.description AS category_description,
    fc.icon AS category_icon,
    fc.pod_id,
    p.name AS pod_name,
    COALESCE((prp.permissions->>'forumAccess')::BOOLEAN, FALSE) AS has_forum_access,
    COALESCE((prp.permissions->>'forumModeration')::BOOLEAN, FALSE) AS has_moderation
  FROM forum_categories fc
  JOIN pods p ON p.id = fc.pod_id
  JOIN pod_modules pm ON pm.pod_id = fc.pod_id
  JOIN pod_role_permissions prp ON prp.pod_id = fc.pod_id
  JOIN pod_memberships pmem ON pmem.pod_id = fc.pod_id
  WHERE pm.forum_enabled = TRUE
    AND pmem.wallet_address = user_address
    AND prp.token_address = pmem.hat_id
    AND prp.is_active = TRUE
    AND (prp.permissions->>'forumAccess')::BOOLEAN = TRUE;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_user_pod_forums(TEXT) IS 'Returns all pod forums the user can access based on their HAT permissions';

GRANT EXECUTE ON FUNCTION get_user_pod_forums(TEXT) TO anon, authenticated;

-- ============================================================================
-- 5. UPDATE EXISTING PODS WITH FORUM MODULE ENABLED
-- ============================================================================

-- Create forum categories for any existing pods that have forum module enabled
-- but don't have a forum category yet
DO $$
DECLARE
  v_pod RECORD;
  v_category_id UUID;
  v_leader_hat_id TEXT;
BEGIN
  FOR v_pod IN
    SELECT pm.pod_id, p.name
    FROM pod_modules pm
    JOIN pods p ON p.id = pm.pod_id
    LEFT JOIN forum_categories fc ON fc.pod_id = pm.pod_id
    WHERE pm.forum_enabled = TRUE
      AND fc.id IS NULL
  LOOP
    -- Create forum category for this pod
    INSERT INTO forum_categories (name, description, pod_id, icon)
    VALUES (
      v_pod.name || ' Forum',
      'Discussion forum for ' || v_pod.name || ' members',
      v_pod.pod_id,
      '💬'
    )
    RETURNING id INTO v_category_id;

    -- Get leader HAT for this pod
    SELECT token_address INTO v_leader_hat_id
    FROM pod_role_permissions
    WHERE pod_id = v_pod.pod_id
      AND role_name = 'Leader'
      AND is_active = TRUE
    LIMIT 1;

    -- Add leader HAT as required token
    IF v_leader_hat_id IS NOT NULL THEN
      INSERT INTO forum_category_required_tokens (forum_category_id, token_or_hat, source)
      VALUES (v_category_id, v_leader_hat_id, 'auto_pod_forum')
      ON CONFLICT (forum_category_id, token_or_hat) DO NOTHING;
    END IF;

    RAISE NOTICE 'Created forum category for existing pod: %', v_pod.name;
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary of changes:
-- 1. ✅ Added pod_id column to forum_categories
-- 2. ✅ Created auto-creation trigger for forum categories
-- 3. ✅ Updated existing role permissions to include forumAccess & chatModeration
-- 4. ✅ Created helper function to get user's accessible pod forums
-- 5. ✅ Backfilled forum categories for existing pods with module enabled
--
-- Next steps:
-- - Update forum UI to filter by pod forums
-- - Implement chat moderation UI
-- ============================================================================
