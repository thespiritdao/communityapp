-- Force PostgREST to reload schema cache
-- Run this in Supabase SQL Editor if project restart didn't work

-- ============================================================================
-- METHOD 1: Send NOTIFY signals to PostgREST
-- ============================================================================

-- This tells PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

-- This tells PostgREST to reload its configuration
NOTIFY pgrst, 'reload config';

-- ============================================================================
-- METHOD 2: Disable and re-enable RLS (forces schema refresh)
-- ============================================================================

-- Disable RLS on affected tables
ALTER TABLE pod_modules DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_groups DISABLE ROW LEVEL SECURITY;

-- Wait a moment, then re-enable
ALTER TABLE pod_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_groups ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- METHOD 3: Update pg_catalog statistics (can trigger cache invalidation)
-- ============================================================================

-- Analyze the tables to update statistics
ANALYZE pod_modules;
ANALYZE chat_groups;
ANALYZE user_profiles;
ANALYZE pods;

-- ============================================================================
-- VERIFICATION: Check that RLS is enabled and policies exist
-- ============================================================================

SELECT
  'RLS Status Check' as info,
  tablename,
  rowsecurity as rls_enabled,
  (SELECT COUNT(*) FROM pg_policies WHERE pg_policies.tablename = pg_tables.tablename) as policy_count
FROM pg_tables
WHERE tablename IN ('pod_modules', 'chat_groups', 'user_profiles')
ORDER BY tablename;

-- Show the policies
SELECT
  'Policy Check' as info,
  tablename,
  policyname,
  cmd as command,
  CASE
    WHEN cmd = 'SELECT' THEN LEFT(qual::text, 50)
    WHEN cmd IN ('INSERT', 'UPDATE', 'DELETE') THEN LEFT(with_check::text, 50)
  END as policy_preview
FROM pg_policies
WHERE tablename IN ('pod_modules', 'chat_groups')
ORDER BY tablename, cmd, policyname;

-- ============================================================================
-- INSTRUCTIONS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Commands executed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Wait 10-15 seconds for PostgREST to process the NOTIFY signals';
  RAISE NOTICE '2. Hard refresh your browser (Ctrl+Shift+R)';
  RAISE NOTICE '3. Try creating a chat group or module again';
  RAISE NOTICE '4. If still failing, check Connection Pooling in Supabase Dashboard';
  RAISE NOTICE '   (Database → Connection Pooling → Restart if available)';
END $$;
