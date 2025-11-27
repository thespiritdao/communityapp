-- Debug Query: Check Pod Role Permissions Data
-- Run this in Supabase SQL editor to diagnose the role permissions issue

-- 1. Check if the specific pod has any role permissions
SELECT 
    prp.id,
    prp.pod_id,
    prp.role_name,
    prp.hat_id,
    prp.is_active,
    prp.sync_status,
    prp.created_at
FROM pod_role_permissions prp 
WHERE prp.pod_id::text LIKE '%YOUR_POD_ID_HERE%'  -- Replace with actual pod ID
ORDER BY prp.created_at;

-- 2. Check all pods and their role counts
SELECT 
    p.id as pod_id,
    p.name as pod_name,
    p.management_hat_id,
    p.membership_hat_id,
    p.is_active as pod_active,
    COUNT(prp.id) as role_count
FROM pods p
LEFT JOIN pod_role_permissions prp ON p.id = prp.pod_id
WHERE p.is_active = true OR p.is_active IS NULL
GROUP BY p.id, p.name, p.management_hat_id, p.membership_hat_id, p.is_active
ORDER BY p.name;

-- 3. Check for the specific error ID mentioned in the logs
SELECT 
    prp.*,
    p.name as pod_name
FROM pod_role_permissions prp
LEFT JOIN pods p ON p.id = prp.pod_id
WHERE prp.id = '3683c466-60f3-4149-9fcc-696ff2b2cc1a';

-- 4. Find pods without role permissions
SELECT 
    p.id,
    p.name,
    p.management_hat_id,
    p.membership_hat_id,
    p.is_active
FROM pods p
LEFT JOIN pod_role_permissions prp ON p.id = prp.pod_id
WHERE prp.pod_id IS NULL
AND (p.is_active = true OR p.is_active IS NULL);

-- 5. Check for orphaned role permissions (roles without valid pods)
SELECT 
    prp.id,
    prp.pod_id,
    prp.role_name,
    prp.hat_id,
    p.name as pod_name
FROM pod_role_permissions prp
LEFT JOIN pods p ON p.id = prp.pod_id
WHERE p.id IS NULL;

-- 6. Create missing role permissions for active pods (if needed)
-- UNCOMMENT AND RUN IF YOU NEED TO MANUALLY CREATE ROLES:

/*
INSERT INTO pod_role_permissions (
    pod_id, hat_id, role_name, permissions, eligibility_criteria, 
    max_holders, current_holders, is_active, created_by, updated_by
)
SELECT 
    p.id as pod_id,
    COALESCE(p.management_hat_id, '0x0000008800010000000000000000000000000000000000000000000000000000') as hat_id,
    p.name || ' Leader' as role_name,
    '{"chatAccess": true, "governanceParticipation": true, "eventCreation": true, "treasuryViewing": true, "memberManagement": true, "subPodCreation": true, "roleAssignment": true, "forumModeration": false, "bountyManagement": true, "marketplaceAccess": true}'::jsonb as permissions,
    '[{"type": "agreement_signed", "agreement_hash": "accountability_statement"}]'::jsonb as eligibility_criteria,
    5 as max_holders,
    0 as current_holders,
    true as is_active,
    'system' as created_by,
    'system' as updated_by
FROM pods p
LEFT JOIN pod_role_permissions prp ON p.id = prp.pod_id AND prp.hat_id = p.management_hat_id
WHERE prp.pod_id IS NULL
AND (p.is_active = true OR p.is_active IS NULL)
AND p.management_hat_id IS NOT NULL

UNION ALL

SELECT 
    p.id as pod_id,
    COALESCE(p.membership_hat_id, '0x0000008800020000000000000000000000000000000000000000000000000000') as hat_id,
    p.name || ' Member' as role_name,
    '{"chatAccess": true, "governanceParticipation": true, "eventCreation": false, "treasuryViewing": false, "memberManagement": false, "subPodCreation": false, "roleAssignment": false, "forumModeration": false, "bountyManagement": false, "marketplaceAccess": true}'::jsonb as permissions,
    '[{"type": "token_balance", "contract_address": "0x123", "minimum_amount": "1"}]'::jsonb as eligibility_criteria,
    100 as max_holders,
    0 as current_holders,
    true as is_active,
    'system' as created_by,
    'system' as updated_by
FROM pods p
LEFT JOIN pod_role_permissions prp ON p.id = prp.pod_id AND prp.hat_id = p.membership_hat_id
WHERE prp.pod_id IS NULL
AND (p.is_active = true OR p.is_active IS NULL)
AND p.membership_hat_id IS NOT NULL;
*/