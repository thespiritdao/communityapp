-- Simulate the exact RLS policy check to verify it SHOULD work
-- This bypasses PostgREST entirely and tests the SQL logic directly

-- ============================================================================
-- SETUP: Replace these with your actual values
-- ============================================================================

-- Your user ID (from DebugAuth)
\set user_id '663e69b6-aefe-4a2c-83fc-5c5ac822a101'

-- Your wallet address (from DebugAuth)
\set wallet '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48'

-- The pod ID you're testing with
-- REPLACE THIS WITH YOUR ACTUAL POD ID!
\set pod_id 'YOUR_POD_ID_HERE'

-- ============================================================================
-- TEST 1: Verify wallet lookup works
-- ============================================================================

SELECT
  '=== TEST 1: Wallet Lookup ===' as test,
  :user_id as provided_user_id,
  (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid) as wallet_from_lookup,
  :wallet as expected_wallet,
  CASE
    WHEN (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid) = :wallet
    THEN '✅ MATCH'
    ELSE '❌ NO MATCH'
  END as result;

-- ============================================================================
-- TEST 2: Verify pod permissions
-- ============================================================================

SELECT
  '=== TEST 2: Pod Permissions ===' as test,
  id as pod_id,
  created_by_address,
  pod_leads,
  CASE
    WHEN :wallet = ANY(pod_leads) THEN '✅ In pod_leads'
    ELSE '❌ Not in pod_leads'
  END as in_pod_leads,
  CASE
    WHEN created_by_address = :wallet THEN '✅ Is creator'
    ELSE '❌ Not creator'
  END as is_creator
FROM pods
WHERE id = :pod_id::uuid;

-- ============================================================================
-- TEST 3: Simulate the EXACT RLS policy check for INSERT on pod_modules
-- ============================================================================

SELECT
  '=== TEST 3: pod_modules INSERT Policy Simulation ===' as test,
  EXISTS (
    SELECT 1 FROM pods
    WHERE pods.id = :pod_id::uuid
    AND (
      (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid) = ANY(pods.pod_leads) OR
      pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid)
    )
  ) as policy_would_pass,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = :pod_id::uuid
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid)
      )
    )
    THEN '✅ INSERT should be ALLOWED'
    ELSE '❌ INSERT would be BLOCKED'
  END as result;

-- ============================================================================
-- TEST 4: Simulate the EXACT RLS policy check for INSERT on chat_groups
-- ============================================================================

SELECT
  '=== TEST 4: chat_groups INSERT Policy Simulation ===' as test,
  EXISTS (
    SELECT 1 FROM pods
    WHERE pods.id = :pod_id::uuid
    AND (
      (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid) = ANY(pods.pod_leads) OR
      pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid)
    )
  ) as policy_would_pass,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = :pod_id::uuid
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid)
      )
    )
    THEN '✅ INSERT should be ALLOWED'
    ELSE '❌ INSERT would be BLOCKED'
  END as result;

-- ============================================================================
-- TEST 5: Check GRANT permissions on tables
-- ============================================================================

SELECT
  '=== TEST 5: Table Permissions ===' as test,
  table_schema,
  table_name,
  privilege_type,
  grantee
FROM information_schema.table_privileges
WHERE table_name IN ('pod_modules', 'chat_groups', 'user_profiles')
  AND grantee IN ('authenticated', 'public', 'postgres')
ORDER BY table_name, privilege_type;

-- ============================================================================
-- DEBUG: Show the actual subquery results
-- ============================================================================

SELECT
  '=== DEBUG: Subquery Breakdown ===' as test,
  :user_id::uuid as user_id,
  (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid) as wallet_from_user_profiles,
  (SELECT pod_leads FROM pods WHERE id = :pod_id::uuid) as pod_leads_array,
  (SELECT created_by_address FROM pods WHERE id = :pod_id::uuid) as creator_address,
  (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid) = ANY(
    SELECT pod_leads FROM pods WHERE id = :pod_id::uuid
  ) as wallet_in_array_check,
  (SELECT created_by_address FROM pods WHERE id = :pod_id::uuid) =
    (SELECT wallet_address FROM user_profiles WHERE user_id = :user_id::uuid) as creator_match_check;
