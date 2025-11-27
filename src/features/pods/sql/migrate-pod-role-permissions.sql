-- Migration Script: Populate pod_role_permissions for existing pods
-- This script creates default role permissions for all existing pods

-- Step 1: Check existing pods structure
-- Run this first to see what pods exist:
-- SELECT id, name, management_hat_id, membership_hat_id, pod_leads FROM pods WHERE is_active = true;

-- Step 2: Create default roles for all existing pods
DO $$
DECLARE
    pod_record RECORD;
    leader_hat_id TEXT;
    member_hat_id TEXT;
    leader_role_id UUID;
    member_role_id UUID;
BEGIN
    -- Loop through all active pods
    FOR pod_record IN 
        SELECT id, name, management_hat_id, membership_hat_id, pod_leads, created_by_address
        FROM pods 
        WHERE is_active = true OR is_active IS NULL
        ORDER BY created_at
    LOOP
        RAISE NOTICE 'Processing pod: % (ID: %)', pod_record.name, pod_record.id;
        
        -- Determine HAT IDs for this pod
        leader_hat_id := COALESCE(
            pod_record.management_hat_id,
            CASE 
                WHEN pod_record.name ILIKE '%executive%' THEN current_setting('app.executive_leader_hat_id', true)
                WHEN pod_record.name ILIKE '%dev%' THEN current_setting('app.dev_leader_hat_id', true)
                ELSE '0x' || lpad(to_hex((random() * 2^32)::bigint), 8, '0') || '00010000000000000000000000000000000000000000000000000000'
            END
        );
        
        member_hat_id := COALESCE(
            pod_record.membership_hat_id,
            CASE 
                WHEN pod_record.name ILIKE '%executive%' THEN current_setting('app.executive_member_hat_id', true)
                WHEN pod_record.name ILIKE '%dev%' THEN current_setting('app.dev_member_hat_id', true)
                ELSE '0x' || lpad(to_hex((random() * 2^32)::bigint), 8, '0') || '00020000000000000000000000000000000000000000000000000000'
            END
        );
        
        RAISE NOTICE '  Leader HAT: %, Member HAT: %', leader_hat_id, member_hat_id;
        
        -- Create Pod Leader role
        INSERT INTO pod_role_permissions (
            pod_id, hat_id, role_name, permissions, eligibility_criteria,
            max_holders, current_holders, is_active, 
            created_by, updated_by
        ) VALUES (
            pod_record.id,
            leader_hat_id,
            pod_record.name || ' Leader',
            jsonb_build_object(
                'chatAccess', true,
                'governanceParticipation', true,
                'eventCreation', true,
                'treasuryViewing', true,
                'memberManagement', true,
                'subPodCreation', true,
                'roleAssignment', true,
                'forumModeration', CASE WHEN pod_record.name ILIKE '%executive%' THEN true ELSE false END,
                'bountyManagement', true,
                'marketplaceAccess', true
            ),
            jsonb_build_array(
                jsonb_build_object(
                    'type', 'agreement_signed',
                    'agreement_hash', 'pod_accountability_statement'
                )
            ),
            CASE 
                WHEN pod_record.name ILIKE '%executive%' THEN 5
                ELSE 3
            END,
            CASE 
                WHEN pod_record.pod_leads IS NOT NULL THEN array_length(pod_record.pod_leads, 1)
                ELSE 0
            END,
            true,
            COALESCE(pod_record.created_by_address, 'system'),
            COALESCE(pod_record.created_by_address, 'system')
        )
        ON CONFLICT (pod_id, hat_id) DO UPDATE SET
            role_name = EXCLUDED.role_name,
            permissions = EXCLUDED.permissions,
            updated_at = NOW(),
            updated_by = EXCLUDED.updated_by
        RETURNING id INTO leader_role_id;
        
        -- Create Pod Member role
        INSERT INTO pod_role_permissions (
            pod_id, hat_id, role_name, permissions, eligibility_criteria,
            max_holders, current_holders, is_active,
            created_by, updated_by
        ) VALUES (
            pod_record.id,
            member_hat_id,
            pod_record.name || ' Member',
            jsonb_build_object(
                'chatAccess', true,
                'governanceParticipation', true,
                'eventCreation', false,
                'treasuryViewing', CASE WHEN pod_record.name ILIKE '%executive%' THEN true ELSE false END,
                'memberManagement', false,
                'subPodCreation', false,
                'roleAssignment', false,
                'forumModeration', false,
                'bountyManagement', false,
                'marketplaceAccess', true
            ),
            jsonb_build_array(
                jsonb_build_object(
                    'type', 'token_balance',
                    'contract_address', current_setting('app.membership_token_address', true),
                    'minimum_amount', '1'
                )
            ),
            CASE 
                WHEN pod_record.name ILIKE '%executive%' THEN 100
                ELSE 50
            END,
            0, -- Will be updated by indexer
            true,
            COALESCE(pod_record.created_by_address, 'system'),
            COALESCE(pod_record.created_by_address, 'system')
        )
        ON CONFLICT (pod_id, hat_id) DO UPDATE SET
            role_name = EXCLUDED.role_name,
            permissions = EXCLUDED.permissions,
            updated_at = NOW(),
            updated_by = EXCLUDED.updated_by
        RETURNING id INTO member_role_id;
        
        RAISE NOTICE '  Created roles - Leader ID: %, Member ID: %', leader_role_id, member_role_id;
        
        -- Update pods table with HAT IDs if they weren't set
        UPDATE pods 
        SET 
            management_hat_id = leader_hat_id,
            membership_hat_id = member_hat_id,
            updated_at = NOW()
        WHERE id = pod_record.id 
        AND (management_hat_id IS NULL OR membership_hat_id IS NULL);
        
    END LOOP;
    
    RAISE NOTICE 'Migration completed successfully!';
END $$;

-- Step 3: Verify the migration
SELECT 
    p.name as pod_name,
    prp.role_name,
    prp.hat_id,
    prp.permissions,
    prp.is_active,
    prp.created_at
FROM pods p
JOIN pod_role_permissions prp ON p.id = prp.pod_id
ORDER BY p.name, prp.role_name;

-- Step 4: Check summary statistics
SELECT 
    'Total Pods' as metric,
    COUNT(*) as count
FROM pods WHERE is_active = true OR is_active IS NULL
UNION ALL
SELECT 
    'Total Roles Created' as metric,
    COUNT(*) as count
FROM pod_role_permissions
UNION ALL
SELECT 
    'Active Roles' as metric,
    COUNT(*) as count
FROM pod_role_permissions WHERE is_active = true;

-- Step 5: Set app settings for environment variables (update these with your actual values)
-- You'll need to run these with your actual HAT IDs:

-- For Executive Pod:
-- SELECT set_config('app.executive_pod_id', 'your-executive-pod-uuid-here', false);
-- SELECT set_config('app.executive_leader_hat_id', '0x0000008800010000000000000000000000000000000000000000000000000000', false);
-- SELECT set_config('app.executive_member_hat_id', '0x0000008800020000000000000000000000000000000000000000000000000000', false);

-- For Dev Pod:
-- SELECT set_config('app.dev_leader_hat_id', '0x0000008800030000000000000000000000000000000000000000000000000000', false);
-- SELECT set_config('app.dev_member_hat_id', '0x0000008800040000000000000000000000000000000000000000000000000000', false);

-- For membership token:
-- SELECT set_config('app.membership_token_address', 'your-membership-token-contract-address', false);

COMMENT ON TABLE pod_role_permissions IS 'Migration completed - contains default roles for all existing pods';