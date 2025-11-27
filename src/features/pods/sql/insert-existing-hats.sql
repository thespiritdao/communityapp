-- Insert your existing HATS into the pods table
-- Run this in Supabase SQL Editor
-- Your table uses TEXT columns so HAT IDs will fit perfectly

-- First check if any pods already exist
SELECT id, name, management_hat_id FROM pods;

-- Insert Executive Pod
INSERT INTO pods (
    id,
    name,
    description,
    management_hat_id,
    membership_hat_id,
    parent_pod_id,
    created_by_address,
    status,
    treasury_contract_address,
    pod_leads,
    pod_metadata,
    pod_image_url
) VALUES (
    gen_random_uuid(),
    'Executive Pod',
    'Main governance and decision-making pod for SpiritDAO',
    '0x0000008800010000000000000000000000000000000000000000000000000000',
    null,
    null,
    '0x12a0cf22d632c859b793f852af03b9d515580244',
    'active',
    null,
    ARRAY[]::text[],
    '{
        "migrated_from_hats": true,
        "migration_date": "2025-01-14T12:00:00Z",
        "hat_id": "0x0000008800010000000000000000000000000000000000000000000000000000",
        "is_existing_hat": true,
        "pod_type": "executive"
    }'::jsonb,
    'https://ui-avatars.com/api/?name=Executive+Pod&size=400&background=bfe7c6&color=000&bold=true'
);

-- Insert Dev Pod  
INSERT INTO pods (
    id,
    name,
    description,
    management_hat_id,
    membership_hat_id,
    parent_pod_id,
    created_by_address,
    status,
    treasury_contract_address,
    pod_leads,
    pod_metadata,
    pod_image_url
) VALUES (
    gen_random_uuid(),
    'Development Pod',
    'Technical development and infrastructure pod',
    '0x0000008800020000000000000000000000000000000000000000000000000000',
    null,
    null,
    '0x12a0cf22d632c859b793f852af03b9d515580244',
    'active',
    null,
    ARRAY[]::text[],
    '{
        "migrated_from_hats": true,
        "migration_date": "2025-01-14T12:00:00Z",
        "hat_id": "0x0000008800020000000000000000000000000000000000000000000000000000",
        "is_existing_hat": true,
        "pod_type": "development"
    }'::jsonb,
    'https://ui-avatars.com/api/?name=Development+Pod&size=400&background=bfe7c6&color=000&bold=true'
);

-- Verify the inserts worked
SELECT id, name, management_hat_id, status FROM pods;