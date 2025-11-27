-- Migration Script: Fix Invalid Hat IDs
-- This script fixes the problematic hat ID that was causing the viem errors
-- The problematic ID: 0x0000008800010000000000000000000000000000000000000000000000000000
-- Converts to: 3666553158108626342376224590576965410952277887149484265825056831045632
-- Which is out of bounds for the Hats Protocol

BEGIN;

-- Backup the current data
CREATE TABLE IF NOT EXISTS hat_ids_backup AS
SELECT 
    table_name,
    column_name,
    old_value,
    new_value,
    migration_date
FROM (VALUES ('', '', '', '', NOW())) AS t(table_name, column_name, old_value, new_value, migration_date)
WHERE FALSE;

-- Insert backup records for all tables we're about to modify
INSERT INTO hat_ids_backup (table_name, column_name, old_value, new_value, migration_date)
SELECT 
    'pods' as table_name,
    'management_hat_id' as column_name,
    management_hat_id as old_value,
    '0x0000000000000000000000000000000000000000000000000000000000000001' as new_value,
    NOW() as migration_date
FROM pods 
WHERE management_hat_id = '0x0000008800010000000000000000000000000000000000000000000000000000';

INSERT INTO hat_ids_backup (table_name, column_name, old_value, new_value, migration_date)
SELECT 
    'pods' as table_name,
    'membership_hat_id' as column_name,
    membership_hat_id as old_value,
    '0x0000000000000000000000000000000000000000000000000000000000000002' as new_value,
    NOW() as migration_date
FROM pods 
WHERE membership_hat_id = '0x0000008800010000000000000000000000000000000000000000000000000000';

INSERT INTO hat_ids_backup (table_name, column_name, old_value, new_value, migration_date)
SELECT 
    'pod_role_permissions' as table_name,
    'hat_id' as column_name,
    hat_id as old_value,
    '0x0000000000000000000000000000000000000000000000000000000000000001' as new_value,
    NOW() as migration_date
FROM pod_role_permissions 
WHERE hat_id = '0x0000008800010000000000000000000000000000000000000000000000000000';

INSERT INTO hat_ids_backup (table_name, column_name, old_value, new_value, migration_date)
SELECT 
    'tokens' as table_name,
    'hat_id' as column_name,
    hat_id as old_value,
    '0x0000000000000000000000000000000000000000000000000000000000000001' as new_value,
    NOW() as migration_date
FROM tokens 
WHERE hat_id = '0x0000008800010000000000000000000000000000000000000000000000000000';

-- Update pods table - management hats
UPDATE pods 
SET management_hat_id = '0x0000000000000000000000000000000000000000000000000000000000000001'
WHERE management_hat_id = '0x0000008800010000000000000000000000000000000000000000000000000000';

-- Update pods table - membership hats (use a different ID for members)
UPDATE pods 
SET membership_hat_id = '0x0000000000000000000000000000000000000000000000000000000000000002'
WHERE membership_hat_id = '0x0000008800010000000000000000000000000000000000000000000000000000';

-- Update pod_role_permissions table
UPDATE pod_role_permissions 
SET hat_id = '0x0000000000000000000000000000000000000000000000000000000000000001'
WHERE hat_id = '0x0000008800010000000000000000000000000000000000000000000000000000';

-- Update tokens table
UPDATE tokens 
SET hat_id = '0x0000000000000000000000000000000000000000000000000000000000000001'
WHERE hat_id = '0x0000008800010000000000000000000000000000000000000000000000000000';

-- Update any eligibility criteria that reference the old hat ID
UPDATE pod_role_permissions 
SET eligibility_criteria = jsonb_set(
    eligibility_criteria,
    '{tokenRequirements}',
    (
        SELECT jsonb_agg(
            CASE 
                WHEN requirement->>'contractAddress' = '0x0000008800010000000000000000000000000000000000000000000000000000'
                THEN jsonb_set(requirement, '{contractAddress}', '"0x0000000000000000000000000000000000000000000000000000000000000001"')
                ELSE requirement
            END
        )
        FROM jsonb_array_elements(eligibility_criteria->'tokenRequirements') AS requirement
    )
)
WHERE eligibility_criteria ? 'tokenRequirements'
AND eligibility_criteria->'tokenRequirements' @> '[{"contractAddress": "0x0000008800010000000000000000000000000000000000000000000000000000"}]';

-- Add a comment about the migration
COMMENT ON TABLE hat_ids_backup IS 'Backup of hat IDs before fixing the invalid BigInt conversion issue. The problematic hat ID 0x0000008800010000000000000000000000000000000000000000000000000000 was causing viem Position out of bounds errors.';

-- Log the migration
INSERT INTO pod_role_permissions (
    id, 
    pod_id, 
    role_name, 
    hat_id, 
    permissions,
    eligibility_criteria,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    (SELECT id FROM pods LIMIT 1), -- Use the first pod as a placeholder
    'MIGRATION_LOG',
    '0x0000000000000000000000000000000000000000000000000000000000000001',
    '["migration"]'::jsonb,
    jsonb_build_object(
        'migration', jsonb_build_object(
            'type', 'fix_invalid_hat_ids',
            'date', NOW(),
            'description', 'Fixed invalid hat ID that was causing BigInt conversion errors',
            'old_hat_id', '0x0000008800010000000000000000000000000000000000000000000000000000',
            'new_hat_id', '0x0000000000000000000000000000000000000000000000000000000000000001'
        )
    ),
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Verify the changes
SELECT 
    'MIGRATION VERIFICATION' as status,
    COUNT(*) as affected_pods
FROM pods 
WHERE management_hat_id = '0x0000000000000000000000000000000000000000000000000000000000000001'
   OR membership_hat_id = '0x0000000000000000000000000000000000000000000000000000000000000002';

SELECT 
    'MIGRATION VERIFICATION' as status,
    COUNT(*) as affected_role_permissions
FROM pod_role_permissions 
WHERE hat_id = '0x0000000000000000000000000000000000000000000000000000000000000001';

SELECT 
    'MIGRATION VERIFICATION' as status,
    COUNT(*) as affected_tokens
FROM tokens 
WHERE hat_id = '0x0000000000000000000000000000000000000000000000000000000000000001';

COMMIT;

-- Instructions for reverting if needed:
-- To revert this migration, run:
-- 
-- BEGIN;
-- UPDATE pods SET management_hat_id = b.old_value 
-- FROM hat_ids_backup b 
-- WHERE b.table_name = 'pods' AND b.column_name = 'management_hat_id' AND pods.management_hat_id = b.new_value;
-- 
-- UPDATE pods SET membership_hat_id = b.old_value 
-- FROM hat_ids_backup b 
-- WHERE b.table_name = 'pods' AND b.column_name = 'membership_hat_id' AND pods.membership_hat_id = b.new_value;
-- 
-- UPDATE pod_role_permissions SET hat_id = b.old_value 
-- FROM hat_ids_backup b 
-- WHERE b.table_name = 'pod_role_permissions' AND b.column_name = 'hat_id' AND pod_role_permissions.hat_id = b.new_value;
-- 
-- UPDATE tokens SET hat_id = b.old_value 
-- FROM hat_ids_backup b 
-- WHERE b.table_name = 'tokens' AND b.column_name = 'hat_id' AND tokens.hat_id = b.new_value;
-- COMMIT;