-- Add chatAccess permission to leader roles that are missing it

-- First, let's see which roles are missing chatAccess
SELECT
  id,
  pod_id,
  role_name,
  token_address,
  permissions,
  CASE
    WHEN permissions::jsonb ? 'chatAccess' THEN 'Has chatAccess ✅'
    ELSE 'Missing chatAccess ❌'
  END as status
FROM pod_role_permissions
WHERE role_name ILIKE '%leader%'
  OR role_name ILIKE '%management%'
ORDER BY created_at DESC;

-- Now update all leader/management roles to include chatAccess
UPDATE pod_role_permissions
SET permissions = permissions::jsonb || '{"chatAccess": true}'::jsonb
WHERE (role_name ILIKE '%leader%' OR role_name ILIKE '%management%')
  AND NOT (permissions::jsonb ? 'chatAccess');

-- Verify the update
SELECT
  'After Update' as status,
  id,
  role_name,
  permissions::jsonb -> 'chatAccess' as chat_access
FROM pod_role_permissions
WHERE role_name ILIKE '%leader%'
  OR role_name ILIKE '%management%'
ORDER BY created_at DESC;
