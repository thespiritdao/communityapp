-- CRITICAL FIX: Normalize all wallet addresses to lowercase
-- This fixes RLS policy failures caused by case sensitivity

BEGIN;

-- ============================================================================
-- Show what will be changed
-- ============================================================================

SELECT '📊 Preview: Addresses that will be normalized' as status;

-- user_profiles
SELECT
  'user_profiles' as table_name,
  user_id,
  wallet_address as current_address,
  LOWER(wallet_address) as will_become,
  CASE
    WHEN wallet_address != LOWER(wallet_address) THEN '⚠️ Will change'
    ELSE '✅ Already lowercase'
  END as status
FROM user_profiles
WHERE wallet_address IS NOT NULL;

-- pods.created_by_address
SELECT
  'pods.created_by_address' as table_name,
  id as pod_id,
  name,
  created_by_address as current_address,
  LOWER(created_by_address) as will_become,
  CASE
    WHEN created_by_address != LOWER(created_by_address) THEN '⚠️ Will change'
    ELSE '✅ Already lowercase'
  END as status
FROM pods
WHERE created_by_address IS NOT NULL;

-- ============================================================================
-- Apply the fixes
-- ============================================================================

-- 1. Normalize user_profiles.wallet_address
UPDATE user_profiles
SET wallet_address = LOWER(wallet_address)
WHERE wallet_address IS NOT NULL
  AND wallet_address != LOWER(wallet_address);

-- 2. Normalize pods.created_by_address
UPDATE pods
SET created_by_address = LOWER(created_by_address)
WHERE created_by_address IS NOT NULL
  AND created_by_address != LOWER(created_by_address);

-- 3. Normalize each element in pods.pod_leads array
UPDATE pods
SET pod_leads = ARRAY(
  SELECT LOWER(unnest(pod_leads))
)
WHERE EXISTS (
  SELECT 1
  FROM unnest(pod_leads) as lead
  WHERE lead != LOWER(lead)
);

-- 4. Normalize chat_groups.created_by_address (if exists)
UPDATE chat_groups
SET created_by_address = LOWER(created_by_address)
WHERE created_by_address IS NOT NULL
  AND created_by_address != LOWER(created_by_address);

-- ============================================================================
-- Verify the fixes
-- ============================================================================

SELECT '✅ Verification: All addresses now lowercase' as status;

-- Check user_profiles
SELECT
  'user_profiles check' as check_type,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE wallet_address = LOWER(wallet_address)) as lowercase_count,
  COUNT(*) FILTER (WHERE wallet_address != LOWER(wallet_address)) as mixed_case_count,
  CASE
    WHEN COUNT(*) FILTER (WHERE wallet_address != LOWER(wallet_address)) = 0
    THEN '✅ All lowercase'
    ELSE '❌ Still has mixed case'
  END as status
FROM user_profiles
WHERE wallet_address IS NOT NULL;

-- Check pods
SELECT
  'pods check' as check_type,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE created_by_address = LOWER(created_by_address)) as lowercase_created_by,
  COUNT(*) FILTER (WHERE created_by_address != LOWER(created_by_address)) as mixed_case_created_by,
  CASE
    WHEN COUNT(*) FILTER (WHERE created_by_address != LOWER(created_by_address)) = 0
    THEN '✅ All lowercase'
    ELSE '❌ Still has mixed case'
  END as status
FROM pods
WHERE created_by_address IS NOT NULL;

-- Check pod_leads arrays
SELECT
  'pod_leads check' as check_type,
  p.id,
  p.name,
  p.pod_leads,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM unnest(p.pod_leads) as lead
      WHERE lead != LOWER(lead)
    )
    THEN '❌ Has mixed case'
    ELSE '✅ All lowercase'
  END as status
FROM pods p
WHERE p.pod_leads IS NOT NULL;

COMMIT;

-- ============================================================================
-- Instructions
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Address normalization complete!';
  RAISE NOTICE '';
  RAISE NOTICE 'All wallet addresses are now lowercase:';
  RAISE NOTICE '• user_profiles.wallet_address';
  RAISE NOTICE '• pods.created_by_address';
  RAISE NOTICE '• pods.pod_leads array elements';
  RAISE NOTICE '• chat_groups.created_by_address';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Hard refresh your browser (Ctrl+Shift+R)';
  RAISE NOTICE '2. Try creating a chat channel';
  RAISE NOTICE '3. RLS should now work correctly!';
END $$;
