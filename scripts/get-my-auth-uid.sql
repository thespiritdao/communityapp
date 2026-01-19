-- Get My Current Auth UID
-- Run this in Supabase SQL Editor while logged in

SELECT
  'My Current Authentication' as info,
  auth.uid() as my_current_user_id,
  auth.email() as my_current_email,
  CASE
    WHEN auth.uid() IS NULL THEN '❌ NOT LOGGED IN'
    WHEN EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid()) THEN '✅ Has user_profiles entry'
    ELSE '❌ NO user_profiles entry - NEED TO CREATE ONE'
  END as profile_status;

-- Show which profile should match (by email)
SELECT
  'Matching Profiles by Email' as info,
  user_id,
  wallet_address,
  email,
  CASE
    WHEN user_id = auth.uid() THEN '✅ THIS IS MY PROFILE'
    ELSE '⚠️  Different user_id'
  END as match_status
FROM user_profiles
WHERE email = auth.email()
ORDER BY user_id;
