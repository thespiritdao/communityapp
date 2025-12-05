-- Run this in Supabase SQL Editor to diagnose performance issues

-- 1. Check if wallet_address has an index
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'user_profiles'
ORDER BY indexname;

-- 2. Check table size (if too large, queries will be slow)
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    n_live_tup as row_count
FROM pg_stat_user_tables
WHERE tablename = 'user_profiles';

-- 3. Check for slow queries (if any exist)
SELECT
    query,
    calls,
    mean_exec_time,
    max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%user_profiles%'
ORDER BY mean_exec_time DESC
LIMIT 5;
