-- TEMPORARY: Bypass RLS for testing
-- This will help us confirm RLS is the issue vs something else

-- ⚠️ WARNING: This temporarily removes security - ONLY for testing!
-- You will need to re-run nuclear-fix-rls.sql after testing

BEGIN;

-- Disable RLS temporarily
ALTER TABLE pod_modules DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_groups DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT
  'RLS Status After Disable' as info,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('pod_modules', 'chat_groups')
ORDER BY tablename;

COMMIT;

-- ============================================================================
-- INSTRUCTIONS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '⚠️ RLS HAS BEEN TEMPORARILY DISABLED!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Try creating a chat group or module in your app';
  RAISE NOTICE '2. If it WORKS, the issue is definitely RLS policies';
  RAISE NOTICE '3. If it STILL FAILS, the issue is something else';
  RAISE NOTICE '4. After testing, re-enable RLS by running nuclear-fix-rls.sql';
  RAISE NOTICE '';
  RAISE NOTICE '🔴 DO NOT LEAVE RLS DISABLED - RE-ENABLE IT AFTER TESTING!';
END $$;
