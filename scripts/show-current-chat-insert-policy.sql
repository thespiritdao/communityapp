-- Show the exact INSERT policy currently active for chat_groups

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'chat_groups'
  AND cmd = 'INSERT'
ORDER BY policyname;

-- Also show if the policy uses the correct wallet_address lookup
SELECT
  policyname,
  CASE
    WHEN with_check::text LIKE '%wallet_address%user_profiles%' THEN '✅ CORRECT - Uses wallet_address lookup'
    WHEN with_check::text LIKE '%auth.uid()%pod_leads%' THEN '❌ BROKEN - Tries to match UUID with wallet addresses'
    ELSE '❓ UNKNOWN - Check with_check column above'
  END as policy_status,
  length(with_check::text) as policy_length
FROM pg_policies
WHERE tablename = 'chat_groups'
  AND cmd = 'INSERT';

-- Show if user_profiles SELECT policy exists (required for lookups)
SELECT
  'user_profiles SELECT policy' as check_type,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ EXISTS'
    ELSE '❌ MISSING - This breaks wallet_address lookups!'
  END as status
FROM pg_policies
WHERE tablename = 'user_profiles'
  AND cmd = 'SELECT';
