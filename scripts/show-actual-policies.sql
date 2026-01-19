-- Show Actual RLS Policies Currently in Database
-- This will show us what's REALLY there vs what SHOULD be there

-- 1. Show pod_modules INSERT policy
SELECT
  'pod_modules INSERT Policy' as info,
  policyname,
  with_check
FROM pg_policies
WHERE tablename = 'pod_modules'
  AND cmd = 'INSERT';

-- 2. Show chat_groups INSERT policy
SELECT
  'chat_groups INSERT Policy' as info,
  policyname,
  with_check
FROM pg_policies
WHERE tablename = 'chat_groups'
  AND cmd = 'INSERT';

-- 3. Show user_profiles SELECT policies (needed for lookup)
SELECT
  'user_profiles SELECT Policies' as info,
  policyname,
  qual as using_clause
FROM pg_policies
WHERE tablename = 'user_profiles'
  AND cmd = 'SELECT';

-- 4. Count all policies
SELECT
  'Policy Count' as info,
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE tablename IN ('pod_modules', 'chat_groups', 'user_profiles')
GROUP BY tablename;
