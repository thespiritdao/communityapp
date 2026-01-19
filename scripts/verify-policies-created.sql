-- Verify that nuclear script actually created the policies correctly

-- 1. Show all policies on pod_modules
SELECT
  '=== pod_modules POLICIES ===' as section,
  policyname,
  cmd as command,
  CASE
    WHEN cmd = 'SELECT' THEN qual::text
    WHEN cmd IN ('INSERT', 'UPDATE', 'DELETE') THEN with_check::text
    ELSE 'N/A'
  END as policy_definition,
  CASE
    WHEN (with_check::text LIKE '%wallet_address%user_profiles%' OR qual::text LIKE '%wallet_address%user_profiles%') THEN '✅ Uses wallet lookup'
    WHEN (with_check::text LIKE '%auth.uid()%pod_leads%' OR qual::text LIKE '%auth.uid()%pod_leads%') THEN '❌ BROKEN (uses auth.uid)'
    ELSE '❓ Check manually'
  END as status
FROM pg_policies
WHERE tablename = 'pod_modules'
ORDER BY cmd, policyname;

-- 2. Show all policies on chat_groups
SELECT
  '=== chat_groups POLICIES ===' as section,
  policyname,
  cmd as command,
  CASE
    WHEN cmd = 'SELECT' THEN qual::text
    WHEN cmd IN ('INSERT', 'UPDATE', 'DELETE') THEN with_check::text
    ELSE 'N/A'
  END as policy_definition,
  CASE
    WHEN (with_check::text LIKE '%wallet_address%user_profiles%' OR qual::text LIKE '%wallet_address%user_profiles%') THEN '✅ Uses wallet lookup'
    WHEN (with_check::text LIKE '%auth.uid()%pod_leads%' OR qual::text LIKE '%auth.uid()%pod_leads%') THEN '❌ BROKEN (uses auth.uid)'
    ELSE '❓ Check manually'
  END as status
FROM pg_policies
WHERE tablename = 'chat_groups'
ORDER BY cmd, policyname;

-- 3. Show user_profiles SELECT policies
SELECT
  '=== user_profiles SELECT POLICIES ===' as section,
  policyname,
  qual::text as using_clause,
  CASE
    WHEN qual::text = 'true' THEN '✅ Allows all reads'
    WHEN qual::text LIKE '%auth.uid()%' THEN '✅ Can read own profile'
    ELSE '❓ Check manually'
  END as status
FROM pg_policies
WHERE tablename = 'user_profiles'
  AND cmd = 'SELECT';

-- 4. Count policies per table
SELECT
  '=== POLICY COUNTS ===' as section,
  tablename,
  COUNT(*) as total_policies,
  COUNT(*) FILTER (WHERE cmd = 'SELECT') as select_policies,
  COUNT(*) FILTER (WHERE cmd = 'INSERT') as insert_policies,
  COUNT(*) FILTER (WHERE cmd = 'UPDATE') as update_policies,
  COUNT(*) FILTER (WHERE cmd = 'DELETE') as delete_policies
FROM pg_policies
WHERE tablename IN ('pod_modules', 'chat_groups', 'user_profiles')
GROUP BY tablename
ORDER BY tablename;

-- 5. Test the actual lookup that RLS uses (run as authenticated user)
SELECT
  '=== TEST WALLET LOOKUP ===' as section,
  auth.uid() as my_user_id,
  (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) as my_wallet_from_lookup,
  CASE
    WHEN (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) IS NULL THEN '❌ Lookup returns NULL'
    ELSE '✅ Lookup works'
  END as lookup_status;

-- 6. Check if RLS is enabled
SELECT
  '=== RLS ENABLED ===' as section,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('pod_modules', 'chat_groups', 'user_profiles')
ORDER BY tablename;
