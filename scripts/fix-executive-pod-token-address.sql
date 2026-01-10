-- Fix Executive Pod token_address mismatch

-- Current situation:
-- pod_role_permissions has: 0x0000008800010000000000000000000000000000000000000000000000000000
-- Ron's actual HAT ID is:    0x0000008800010001000000000000000000000000000000000000000000000000
--                                          ^^^^^ difference here

-- Check what token_address is actually used in pods and pod_members tables
SELECT
    'pods.management_hat_id' as source,
    management_hat_id as hat_id
FROM pods
WHERE id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'

UNION ALL

SELECT
    'pod_members.hat_id' as source,
    hat_id
FROM pod_members
WHERE pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'
AND membership_type = 'leader'
LIMIT 5;

-- Update pod_role_permissions to match the correct HAT ID
-- (Run this after confirming the correct HAT ID from above query)

-- UPDATE pod_role_permissions
-- SET token_address = '0x0000008800010001000000000000000000000000000000000000000000000000'
-- WHERE pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'
-- AND token_address = '0x0000008800010000000000000000000000000000000000000000000000000000';
