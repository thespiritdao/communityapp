-- Check the EXACT policy definition for pod_modules INSERT
-- This will show us the actual WITH CHECK clause

SELECT
  '=== pod_modules INSERT Policy ===' as section,
  policyname,
  pg_get_expr(with_check, oid) as with_check_clause
FROM pg_policy
JOIN pg_class ON pg_policy.polrelid = pg_class.oid
WHERE pg_class.relname = 'pod_modules'
  AND polcmd = 'w'; -- 'w' = INSERT in pg_policy

-- Check chat_groups INSERT policy
SELECT
  '=== chat_groups INSERT Policy ===' as section,
  policyname,
  pg_get_expr(with_check, oid) as with_check_clause
FROM pg_policy
JOIN pg_class ON pg_policy.polrelid = pg_class.oid
WHERE pg_class.relname = 'chat_groups'
  AND polcmd = 'w';

-- Check pod_modules SELECT policy
SELECT
  '=== pod_modules SELECT Policy ===' as section,
  policyname,
  pg_get_expr(qual, oid) as using_clause
FROM pg_policy
JOIN pg_class ON pg_policy.polrelid = pg_class.oid
WHERE pg_class.relname = 'pod_modules'
  AND polcmd = 'r'; -- 'r' = SELECT

-- Show what columns exist on pod_modules
SELECT
  '=== pod_modules Columns ===' as section,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'pod_modules'
ORDER BY ordinal_position;
