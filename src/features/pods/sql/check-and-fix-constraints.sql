-- Check the exact constraints on your pods table
SELECT 
    column_name, 
    data_type, 
    character_maximum_length,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'pods' 
AND column_name IN ('management_hat_id', 'membership_hat_id', 'name', 'description');

-- If management_hat_id is varchar(50), we need to alter it
-- HAT IDs are 66 characters long (0x + 64 hex characters)

-- Option 1: Alter the column to accommodate full HAT IDs
ALTER TABLE pods 
ALTER COLUMN management_hat_id TYPE varchar(70);

ALTER TABLE pods 
ALTER COLUMN membership_hat_id TYPE varchar(70);

-- Option 2: Use shortened HAT IDs for display but store full ones
-- Let's use full ones since smart contracts need them

-- Now insert with proper length
INSERT INTO pods (
    id,
    name,
    description,
    management_hat_id,
    created_by_address,
    status,
    pod_leads,
    pod_metadata,
    pod_image_url
) VALUES (
    gen_random_uuid(),
    'Executive Pod',
    'Main governance pod',
    '0x0000008800010000000000000000000000000000000000000000000000000000',
    '0xYOUR_WALLET_ADDRESS_HERE',
    'active',
    ARRAY[]::text[],
    '{"migrated_from_hats": true}'::jsonb,
    'https://ui-avatars.com/api/?name=Executive+Pod&size=400'
);

INSERT INTO pods (
    id,
    name,
    description,
    management_hat_id,
    created_by_address,
    status,
    pod_leads,
    pod_metadata,
    pod_image_url
) VALUES (
    gen_random_uuid(),
    'Development Pod', 
    'Technical development pod',
    '0x0000008800020000000000000000000000000000000000000000000000000000',
    '0xYOUR_WALLET_ADDRESS_HERE',
    'active',
    ARRAY[]::text[],
    '{"migrated_from_hats": true}'::jsonb,
    'https://ui-avatars.com/api/?name=Development+Pod&size=400'
);

-- Verify inserts
SELECT id, name, management_hat_id, status FROM pods;