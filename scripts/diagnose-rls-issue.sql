-- COMPREHENSIVE RLS DIAGNOSTIC
-- Run this in Supabase SQL Editor while logged in as the affected user
-- This will help identify why RLS policies are failing

-- ============================================================================
-- PART 1: Check your own authentication and profile
-- ============================================================================

-- Who am I?
SELECT
  'My User ID' as description,
  auth.uid() as value;

-- Do I have a user_profiles entry?
SELECT
  'My User Profile' as description,
  user_id,
  wallet_address,
  CASE
    WHEN wallet_address IS NULL THEN '❌ NULL - THIS IS A PROBLEM'
    ELSE '✅ Set'
  END as status
FROM user_profiles
WHERE user_id = auth.uid();

-- ============================================================================
-- PART 2: Check the pod configuration
-- ============================================================================

-- Pod details for the problematic pod
SELECT
  'Pod Configuration' as description,
  id,
  name,
  pod_leads,
  created_by_address,
  CASE
    WHEN created_by_address IS NULL THEN '⚠️  created_by_address is NULL'
    ELSE '✅ created_by_address is set'
  END as status
FROM pods
WHERE id = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';

-- ============================================================================
-- PART 3: Check if I have permission (simulate RLS check)
-- ============================================================================

-- Am I in pod_leads or the creator?
SELECT
  'Permission Check' as description,
  p.name as pod_name,
  up.wallet_address as my_wallet,
  p.pod_leads,
  p.created_by_address,
  CASE
    WHEN up.wallet_address = ANY(p.pod_leads) THEN '✅ In pod_leads'
    WHEN p.created_by_address = up.wallet_address THEN '✅ Is creator'
    ELSE '❌ NOT AUTHORIZED'
  END as permission_status
FROM pods p
CROSS JOIN user_profiles up
WHERE p.id = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0'
  AND up.user_id = auth.uid();

-- ============================================================================
-- PART 4: Check RLS policies on tables
-- ============================================================================

-- RLS enabled?
SELECT
  'RLS Enabled' as description,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('pod_modules', 'chat_groups', 'user_profiles')
ORDER BY tablename;

-- What INSERT policies exist?
SELECT
  'INSERT Policies' as description,
  tablename,
  policyname,
  CASE
    WHEN with_check::text LIKE '%wallet_address%' THEN '✅ Uses wallet_address'
    WHEN with_check::text LIKE '%auth.uid()%' THEN '❌ Uses auth.uid() directly (WRONG!)'
    ELSE '❓ Unknown check'
  END as policy_type,
  with_check
FROM pg_policies
WHERE tablename IN ('pod_modules', 'chat_groups')
  AND cmd = 'INSERT'
ORDER BY tablename;

-- ============================================================================
-- PART 5: Check user_profiles accessibility
-- ============================================================================

-- Can the RLS policy read user_profiles?
SELECT
  'user_profiles SELECT Policies' as description,
  policyname,
  qual as using_clause,
  CASE
    WHEN qual::text LIKE '%auth.uid()%' THEN '✅ Can read own profile'
    WHEN qual = 'true' THEN '✅ Can read all profiles'
    ELSE '❓ Complex policy'
  END as access_level
FROM pg_policies
WHERE tablename = 'user_profiles'
  AND cmd = 'SELECT';

-- ============================================================================
-- PART 6: Try to understand the exact RLS failure
-- ============================================================================

-- What happens when we manually run the RLS check?
WITH my_wallet AS (
  SELECT wallet_address
  FROM user_profiles
  WHERE user_id = auth.uid()
),
pod_info AS (
  SELECT
    id,
    name,
    pod_leads,
    created_by_address
  FROM pods
  WHERE id = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0'
)
SELECT
  'Manual RLS Check' as description,
  pi.name as pod_name,
  mw.wallet_address as my_wallet,
  pi.pod_leads,
  pi.created_by_address,
  (mw.wallet_address = ANY(pi.pod_leads)) as in_pod_leads,
  (pi.created_by_address = mw.wallet_address) as is_creator,
  (
    mw.wallet_address = ANY(pi.pod_leads) OR
    pi.created_by_address = mw.wallet_address
  ) as should_have_access
FROM my_wallet mw
CROSS JOIN pod_info pi;

-- ============================================================================
-- SUMMARY
-- ============================================================================

-- If any of these return FALSE or NULL, that's your problem!
SELECT
  'SUMMARY: What needs to be TRUE' as check_description,
  EXISTS(SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND wallet_address IS NOT NULL) as has_wallet_address,
  EXISTS(
    SELECT 1 FROM pods p
    JOIN user_profiles up ON (
      up.wallet_address = ANY(p.pod_leads) OR
      p.created_by_address = up.wallet_address
    )
    WHERE p.id = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0'
      AND up.user_id = auth.uid()
  ) as has_pod_permission;
