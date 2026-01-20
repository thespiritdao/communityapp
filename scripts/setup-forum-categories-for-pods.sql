-- Setup forum_categories table for pod integration
-- Adds necessary columns and RLS policies

BEGIN;

-- ============================================================================
-- PART 1: Add missing columns if they don't exist
-- ============================================================================

-- Add pod_id column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'forum_categories' AND column_name = 'pod_id'
  ) THEN
    ALTER TABLE forum_categories ADD COLUMN pod_id UUID REFERENCES pods(id) ON DELETE CASCADE;
    RAISE NOTICE '✅ Added pod_id column';
  ELSE
    RAISE NOTICE 'ℹ️ pod_id column already exists';
  END IF;
END $$;

-- Add is_active column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'forum_categories' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE forum_categories ADD COLUMN is_active BOOLEAN DEFAULT true;
    RAISE NOTICE '✅ Added is_active column';
  ELSE
    RAISE NOTICE 'ℹ️ is_active column already exists';
  END IF;
END $$;

-- Add access_level column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'forum_categories' AND column_name = 'access_level'
  ) THEN
    ALTER TABLE forum_categories ADD COLUMN access_level TEXT DEFAULT 'both' CHECK (access_level IN ('managers', 'members', 'both'));
    RAISE NOTICE '✅ Added access_level column';
  ELSE
    RAISE NOTICE 'ℹ️ access_level column already exists';
  END IF;
END $$;

-- Add required_token column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'forum_categories' AND column_name = 'required_token'
  ) THEN
    ALTER TABLE forum_categories ADD COLUMN required_token TEXT;
    RAISE NOTICE '✅ Added required_token column';
  ELSE
    RAISE NOTICE 'ℹ️ required_token column already exists';
  END IF;
END $$;

-- Add created_by_address column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'forum_categories' AND column_name = 'created_by_address'
  ) THEN
    ALTER TABLE forum_categories ADD COLUMN created_by_address TEXT;
    RAISE NOTICE '✅ Added created_by_address column';
  ELSE
    RAISE NOTICE 'ℹ️ created_by_address column already exists';
  END IF;
END $$;

-- ============================================================================
-- PART 2: Enable RLS
-- ============================================================================

ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 3: Drop existing policies (clean slate)
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'forum_categories')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON forum_categories';
    RAISE NOTICE 'Dropped policy: %', r.policyname;
  END LOOP;
END $$;

-- ============================================================================
-- PART 4: Create RLS policies (matching chat_groups pattern)
-- ============================================================================

-- Users can view active forum categories
CREATE POLICY "Users can view active forum categories" ON forum_categories
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Pod managers can create forum categories
CREATE POLICY "Pod managers can create forum categories" ON forum_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = forum_categories.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- Pod managers can update their forum categories
CREATE POLICY "Pod managers can update their forum categories" ON forum_categories
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = forum_categories.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- Pod managers can delete their forum categories
CREATE POLICY "Pod managers can delete their forum categories" ON forum_categories
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = forum_categories.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- ============================================================================
-- PART 5: Grant permissions
-- ============================================================================

GRANT SELECT ON forum_categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON forum_categories TO authenticated;

-- ============================================================================
-- PART 6: Verify setup
-- ============================================================================

SELECT
  '✅ Setup Complete' as status,
  COUNT(*) FILTER (WHERE cmd = 'SELECT') as select_policies,
  COUNT(*) FILTER (WHERE cmd = 'INSERT') as insert_policies,
  COUNT(*) FILTER (WHERE cmd = 'UPDATE') as update_policies,
  COUNT(*) FILTER (WHERE cmd = 'DELETE') as delete_policies
FROM pg_policies
WHERE tablename = 'forum_categories';

-- Show the policies
SELECT
  'Verification: Forum RLS Policies' as info,
  tablename,
  policyname,
  cmd,
  CASE
    WHEN with_check::text LIKE '%wallet_address%user_profiles%' THEN '✅ Uses wallet_address lookup'
    WHEN qual::text LIKE '%wallet_address%user_profiles%' THEN '✅ Uses wallet_address lookup'
    ELSE '❓ Check policy'
  END as status
FROM pg_policies
WHERE tablename = 'forum_categories'
ORDER BY cmd, policyname;

COMMIT;

-- ============================================================================
-- Instructions
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Forum categories setup complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'What was done:';
  RAISE NOTICE '1. Added pod integration columns (pod_id, is_active, access_level, etc.)';
  RAISE NOTICE '2. Enabled RLS on forum_categories table';
  RAISE NOTICE '3. Created RLS policies matching chat_groups pattern';
  RAISE NOTICE '4. Granted necessary permissions to authenticated users';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Test creating a forum category from pods/[id]/manage';
  RAISE NOTICE '2. Verify RLS policies work correctly';
  RAISE NOTICE '3. Check that forum categories appear in /forum';
END $$;
