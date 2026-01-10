-- Check pod_role_permissions table schema
-- Verify token_address column exists and is queryable

-- Check table structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'pod_role_permissions'
ORDER BY ordinal_position;

-- Check indexes
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'pod_role_permissions';

-- Try a direct query
SELECT
    pod_id,
    token_address,
    role_name,
    permissions,
    is_active
FROM pod_role_permissions
WHERE token_address = '0x0000008800010001000000000000000000000000000000000000000000000000'
LIMIT 5;
