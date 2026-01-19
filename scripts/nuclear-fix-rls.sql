-- NUCLEAR FIX: Drop ALL RLS policies and recreate them correctly
-- Run this if migrations aren't working

BEGIN;

-- ============================================================================
-- PART 1: Drop ALL existing policies (clean slate)
-- ============================================================================

-- Drop all pod_modules policies
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'pod_modules')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON pod_modules';
  END LOOP;
END $$;

-- Drop all chat_groups policies
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'chat_groups')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON chat_groups';
  END LOOP;
END $$;

-- Drop all user_profiles policies
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'user_profiles')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON user_profiles';
  END LOOP;
END $$;

-- ============================================================================
-- PART 2: Enable RLS on all tables
-- ============================================================================

ALTER TABLE pod_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 3: Create user_profiles policies (REQUIRED for lookups)
-- ============================================================================

-- Allow authenticated users to read all profiles (needed for RLS lookups)
CREATE POLICY "Authenticated users can read all profiles" ON user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 4: Create pod_modules policies (CORRECT VERSION)
-- ============================================================================

-- Anyone can view pod modules
CREATE POLICY "Anyone can view pod modules" ON pod_modules
  FOR SELECT
  TO authenticated
  USING (true);

-- Pod managers can INSERT modules
CREATE POLICY "Pod managers can create modules" ON pod_modules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- Pod managers can UPDATE modules
CREATE POLICY "Pod managers can update modules" ON pod_modules
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- Pod managers can DELETE modules
CREATE POLICY "Pod managers can delete modules" ON pod_modules
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- ============================================================================
-- PART 5: Create chat_groups policies (CORRECT VERSION)
-- ============================================================================

-- Users can view active chat groups
CREATE POLICY "Users can view active chat groups" ON chat_groups
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Pod managers can create chat groups
CREATE POLICY "Pod managers can create chat groups" ON chat_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = chat_groups.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- Pod managers can update their chat groups
CREATE POLICY "Pod managers can update their chat groups" ON chat_groups
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = chat_groups.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- Pod managers can delete their chat groups
CREATE POLICY "Pod managers can delete their chat groups" ON chat_groups
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = chat_groups.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- ============================================================================
-- PART 6: Grant permissions
-- ============================================================================

GRANT SELECT ON user_profiles TO authenticated;
GRANT INSERT, UPDATE ON user_profiles TO authenticated;

GRANT SELECT ON pod_modules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON pod_modules TO authenticated;

GRANT SELECT ON chat_groups TO authenticated;
GRANT INSERT, UPDATE, DELETE ON chat_groups TO authenticated;

-- ============================================================================
-- PART 7: Verify what we created
-- ============================================================================

-- Show summary
DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies recreated successfully!';
  RAISE NOTICE 'pod_modules policies: %', (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'pod_modules');
  RAISE NOTICE 'chat_groups policies: %', (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'chat_groups');
  RAISE NOTICE 'user_profiles policies: %', (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'user_profiles');
END $$;

COMMIT;

-- Show the INSERT policies we just created
SELECT
  'Verification: INSERT Policies' as info,
  tablename,
  policyname,
  CASE
    WHEN with_check::text LIKE '%wallet_address%user_profiles%' THEN '✅ Uses wallet_address lookup'
    ELSE '❌ WRONG'
  END as status
FROM pg_policies
WHERE tablename IN ('pod_modules', 'chat_groups')
  AND cmd = 'INSERT'
ORDER BY tablename;
