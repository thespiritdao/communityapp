-- Verify My Profile - Run this in Supabase SQL Editor while logged in
-- This will show you your user_profiles data

-- Step 1: Who am I?
SELECT
  'Step 1: My Authentication' as step,
  auth.uid() as my_user_id,
  CASE
    WHEN auth.uid() IS NULL THEN '❌ NOT LOGGED IN - You must be logged in for this to work!'
    ELSE '✅ Logged in'
  END as auth_status;

-- Step 2: Do I have a user_profiles entry?
SELECT
  'Step 2: My User Profile Entry' as step,
  COUNT(*) as profile_count,
  CASE
    WHEN COUNT(*) = 0 THEN '❌ NO PROFILE FOUND - Need to create one'
    WHEN COUNT(*) = 1 THEN '✅ Profile exists'
    ELSE '⚠️  Multiple profiles (unexpected)'
  END as status
FROM user_profiles
WHERE user_id = auth.uid();

-- Step 3: What's in my profile?
SELECT
  'Step 3: My Profile Data' as step,
  user_id,
  wallet_address,
  email,
  CASE
    WHEN wallet_address IS NULL THEN '❌ wallet_address IS NULL - THIS IS THE PROBLEM!'
    WHEN wallet_address = '' THEN '❌ wallet_address IS EMPTY STRING'
    ELSE '✅ wallet_address is set to: ' || wallet_address
  END as wallet_status
FROM user_profiles
WHERE user_id = auth.uid();

-- Step 4: If no profile exists, show me all profiles (to debug)
-- This only runs if you have no profile
SELECT
  'Step 4: Debug - All Profiles' as step,
  user_id,
  wallet_address,
  email,
  'This profile does NOT match my auth.uid(): ' || auth.uid()::text as note
FROM user_profiles
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles WHERE user_id = auth.uid()
);
