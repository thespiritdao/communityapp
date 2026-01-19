-- NUCLEAR OPTION: Force PostgREST to completely rebuild schema cache
-- FIXED VERSION: VACUUM commands run outside transaction

BEGIN;

-- ============================================================================
-- METHOD 1: Add a comment to the tables (forces schema version change)
-- ============================================================================

COMMENT ON TABLE pod_modules IS 'Pod feature module configuration - schema refreshed 2026-01-19';
COMMENT ON TABLE chat_groups IS 'Pod chat channel groups - schema refreshed 2026-01-19';

-- ============================================================================
-- METHOD 2: Send multiple NOTIFY signals
-- ============================================================================

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Send it twice for good measure
SELECT pg_sleep(1);
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- METHOD 3: Drop and recreate a harmless view (forces schema change)
-- ============================================================================

-- Create a view that PostgREST will see
DROP VIEW IF EXISTS _postgrest_cache_breaker CASCADE;
CREATE VIEW _postgrest_cache_breaker AS
SELECT
  current_timestamp as last_refreshed,
  'PostgREST schema cache cleared at ' || current_timestamp::text as message;

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'Schema cache refresh attempted' as status;
SELECT * FROM _postgrest_cache_breaker;

-- Show table comments to verify they were set
SELECT
  tablename,
  obj_description((schemaname||'.'||tablename)::regclass, 'pg_class') as table_comment
FROM pg_tables
WHERE tablename IN ('pod_modules', 'chat_groups');

-- ============================================================================
-- INSTRUCTIONS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Nuclear cache clear executed!';
  RAISE NOTICE '';
  RAISE NOTICE 'What we did:';
  RAISE NOTICE '1. Added comments to tables (schema version bump)';
  RAISE NOTICE '2. Sent multiple NOTIFY signals to PostgREST';
  RAISE NOTICE '3. Created a cache-breaking view';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Wait 15-20 seconds';
  RAISE NOTICE '2. Hard refresh your browser (Ctrl+Shift+R)';
  RAISE NOTICE '3. Check if SELECT queries work (no more 406 errors)';
  RAISE NOTICE '4. If still 406, restart Supabase project in dashboard';
END $$;
