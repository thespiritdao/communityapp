-- Diagnose why RLS policy is failing despite being correct
-- Run this while logged in as the user having issues

-- Step 1: What's my auth.uid() and wallet_address?
SELECT
  'My Identity' as check_type,
  auth.uid() as my_auth_uid,
  (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) as my_wallet_address,
  CASE
    WHEN (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) IS NULL
    THEN '❌ NO WALLET IN PROFILE'
    ELSE '✅ Wallet found'
  END as wallet_status;

-- Step 2: Show all pods where I should have access
SELECT
  'My Pods' as check_type,
  p.id,
  p.pod_name,
  p.created_by_address,
  p.pod_leads,
  CASE
    WHEN (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(p.pod_leads)
    THEN '✅ I am in pod_leads'
    WHEN p.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
    THEN '✅ I am creator'
    ELSE '❌ No access'
  END as my_access
FROM pods p
ORDER BY p.created_at DESC
LIMIT 10;

-- Step 3: Check if addresses are lowercase (case sensitivity issue)
SELECT
  'Case Sensitivity Check' as check_type,
  (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) as my_wallet_raw,
  (SELECT LOWER(wallet_address) FROM user_profiles WHERE user_id = auth.uid()) as my_wallet_lower,
  CASE
    WHEN (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) !=
         (SELECT LOWER(wallet_address) FROM user_profiles WHERE user_id = auth.uid())
    THEN '⚠️ MIXED CASE - Might cause issues'
    ELSE '✅ Already lowercase'
  END as case_status;

-- Step 4: Check a specific pod (replace 'YOUR_POD_ID' with actual pod ID having issues)
-- Uncomment and modify this query:
/*
SELECT
  'Specific Pod Check' as check_type,
  p.id,
  p.pod_name,
  (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) as my_wallet,
  p.pod_leads,
  p.created_by_address,
  (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(p.pod_leads) as in_pod_leads,
  p.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) as is_creator,
  -- This is what the RLS policy checks:
  (
    (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(p.pod_leads) OR
    p.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
  ) as would_rls_pass
FROM pods p
WHERE p.id = 'YOUR_POD_ID';
*/
