-- Simple Pod Role Permissions Migration
-- Customize the values below with your actual pod and HAT data

-- Step 1: First, let's see what pods you have
SELECT 
    id, 
    name, 
    management_hat_id, 
    membership_hat_id, 
    pod_leads,
    created_by_address,
    is_active
FROM pods 
ORDER BY name;

-- Step 2: Manual insertion for each pod (customize these)
-- Replace the UUIDs and HAT IDs with your actual values

-- Example for Executive Pod:
INSERT INTO pod_role_permissions (
    pod_id,
    hat_id, 
    role_name,
    permissions,
    eligibility_criteria,
    max_holders,
    current_holders,
    is_active,
    created_by,
    updated_by
) VALUES 
-- Executive Pod Leader Role
(
    'YOUR_EXECUTIVE_POD_UUID_HERE'::uuid,  -- Replace with actual executive pod ID
    '0x0000008800010000000000000000000000000000000000000000000000000000',  -- Replace with actual HAT ID
    'Executive Pod Leader',
    '{
        "chatAccess": true,
        "governanceParticipation": true,
        "eventCreation": true,
        "treasuryViewing": true,
        "memberManagement": true,
        "subPodCreation": true,
        "roleAssignment": true,
        "forumModeration": true,
        "bountyManagement": true,
        "marketplaceAccess": true
    }'::jsonb,
    '[
        {
            "type": "agreement_signed",
            "agreement_hash": "executive_pod_accountability"
        }
    ]'::jsonb,
    5,
    1,  -- Update with actual current count
    true,
    'system',  -- Replace with actual creator address if known
    'system'
),
-- Executive Pod Member Role  
(
    'YOUR_EXECUTIVE_POD_UUID_HERE'::uuid,  -- Same pod ID
    '0x0000008800020000000000000000000000000000000000000000000000000000',  -- Replace with actual member HAT ID
    'Executive Pod Member',
    '{
        "chatAccess": true,
        "governanceParticipation": true,
        "eventCreation": false,
        "treasuryViewing": false,
        "memberManagement": false,
        "subPodCreation": false,
        "roleAssignment": false,
        "forumModeration": false,
        "bountyManagement": false,
        "marketplaceAccess": true
    }'::jsonb,
    '[
        {
            "type": "token_balance",
            "contract_address": "0xYourMembershipTokenAddress",
            "minimum_amount": "1"
        }
    ]'::jsonb,
    100,
    0,  -- Will be populated by indexer
    true,
    'system',
    'system'
);

-- Step 3: Add more pods as needed
-- Copy the pattern above for each pod you have

-- Example template for additional pods:
/*
INSERT INTO pod_role_permissions (pod_id, hat_id, role_name, permissions, eligibility_criteria, max_holders, current_holders, is_active, created_by, updated_by) VALUES 
-- Pod Leader
('YOUR_POD_UUID'::uuid, 'YOUR_LEADER_HAT_ID', 'Pod Name Leader', 
 '{"chatAccess": true, "governanceParticipation": true, "eventCreation": true, "treasuryViewing": true, "memberManagement": true, "subPodCreation": true, "roleAssignment": true, "forumModeration": false, "bountyManagement": true, "marketplaceAccess": true}'::jsonb,
 '[{"type": "agreement_signed", "agreement_hash": "pod_accountability"}]'::jsonb,
 3, 1, true, 'system', 'system'),
-- Pod Member  
('YOUR_POD_UUID'::uuid, 'YOUR_MEMBER_HAT_ID', 'Pod Name Member',
 '{"chatAccess": true, "governanceParticipation": true, "eventCreation": false, "treasuryViewing": false, "memberManagement": false, "subPodCreation": false, "roleAssignment": false, "forumModeration": false, "bountyManagement": false, "marketplaceAccess": true}'::jsonb,
 '[{"type": "token_balance", "contract_address": "0xTokenAddress", "minimum_amount": "1"}]'::jsonb,
 50, 0, true, 'system', 'system');
*/

-- Step 4: Update pods table with HAT IDs if needed
UPDATE pods SET 
    management_hat_id = '0x0000008800010000000000000000000000000000000000000000000000000000',  -- Replace with actual
    membership_hat_id = '0x0000008800020000000000000000000000000000000000000000000000000000'   -- Replace with actual
WHERE id = 'YOUR_EXECUTIVE_POD_UUID_HERE'::uuid;

-- Step 5: Verify the data
SELECT 
    p.name as pod_name,
    prp.role_name,
    prp.hat_id,
    prp.is_active,
    jsonb_pretty(prp.permissions) as permissions
FROM pods p
JOIN pod_role_permissions prp ON p.id = prp.pod_id
ORDER BY p.name, prp.role_name;

-- Step 6: Check that everything looks correct
SELECT 
    COUNT(*) as total_roles,
    COUNT(CASE WHEN is_active THEN 1 END) as active_roles,
    COUNT(DISTINCT pod_id) as pods_with_roles
FROM pod_role_permissions;