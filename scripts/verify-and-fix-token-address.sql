-- CRITICAL FIX: Executive Pod token_address mismatch
-- This is the ROOT CAUSE of Ron's permission failures

-- Step 1: Verify what the correct HAT ID should be
-- Run this first to confirm before updating

SELECT
    'pods.management_hat_id' as source,
    management_hat_id as hat_id,
    name as pod_name
FROM pods
WHERE id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'

UNION ALL

SELECT
    'pod_members.hat_id' as source,
    hat_id,
    wallet as pod_name
FROM pod_members
WHERE pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'
  AND membership_type = 'leader'
LIMIT 5;

-- Step 2: After confirming the correct HAT ID above, run this UPDATE
-- Expected correct value: 0x0000008800010001000000000000000000000000000000000000000000000000

UPDATE pod_role_permissions
SET token_address = '0x0000008800010001000000000000000000000000000000000000000000000000'
WHERE pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'
  AND token_address = '0x0000008800010000000000000000000000000000000000000000000000000000';

-- Step 3: Verify the update worked
SELECT
    pod_id,
    token_address,
    role_name,
    is_active
FROM pod_role_permissions
WHERE pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';
