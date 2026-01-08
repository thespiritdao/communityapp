-- Fix Beta Tester role name trailing space
-- This removes the trailing space from 'Beta Tester ' -> 'Beta Tester'

-- Check current Beta Tester role names
SELECT id, pod_id, role_name, token_address
FROM pod_role_permissions
WHERE role_name LIKE 'Beta Tester%';

-- Update the role name to remove trailing space
UPDATE pod_role_permissions
SET
  role_name = TRIM(role_name),
  updated_at = CURRENT_TIMESTAMP,
  updated_by = 'system-migration'
WHERE role_name LIKE 'Beta Tester%'
  AND role_name != TRIM(role_name);

-- Verify the fix
SELECT id, pod_id, role_name, token_address
FROM pod_role_permissions
WHERE role_name LIKE 'Beta Tester%';

-- Also check active_pod_members table if it exists
-- UPDATE active_pod_members
-- SET role_name = TRIM(role_name)
-- WHERE role_name LIKE 'Beta Tester%'
--   AND role_name != TRIM(role_name);
