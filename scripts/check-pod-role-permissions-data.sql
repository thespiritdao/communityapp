-- Check if pod_role_permissions has any data

-- Count total rows
SELECT COUNT(*) as total_rows
FROM pod_role_permissions;

-- Count rows for Executive Pod
SELECT COUNT(*) as exec_pod_rows
FROM pod_role_permissions
WHERE pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';

-- Show Executive Pod permissions if they exist
SELECT
    id,
    pod_id,
    token_address,
    role_name,
    permissions,
    is_active
FROM pod_role_permissions
WHERE pod_id = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'
LIMIT 10;

-- Show all pod_role_permissions entries
SELECT
    pod_id,
    token_address,
    role_name,
    is_active
FROM pod_role_permissions
ORDER BY created_at DESC
LIMIT 20;
