-- Diagnostic: Why isn't "Temporal naturalism" showing in event creation dropdown?
-- ============================================================================

\echo '============================================';
\echo 'EVENT CREATION PERMISSION DIAGNOSTIC';
\echo '============================================';
\echo '';

-- 1. Check pod_modules for events_enabled
\echo '1. POD MODULES - Events Module Status';
\echo '----------------------------';

SELECT
  p.id,
  p.name as pod_name,
  p.status as pod_status,
  p.is_active as pod_is_active,
  pm.events_enabled,
  pm.updated_at as module_last_updated,
  CASE
    WHEN pm.events_enabled = true THEN '✅ Events module ON'
    WHEN pm.events_enabled = false THEN '❌ Events module OFF'
    ELSE '⚠️ No module record'
  END as module_status
FROM pods p
LEFT JOIN pod_modules pm ON pm.pod_id = p.id
WHERE p.name IN ('Temporal naturalism', 'Executive Pod', 'Community Pod', 'Beta Testers Pod', 'Test Pod')
ORDER BY pm.events_enabled DESC NULLS LAST, p.name;

\echo '';
\echo '----------------------------';
\echo '';

-- 2. Check pod_role_permissions for eventCreation permission
\echo '2. ROLE PERMISSIONS - Event Creation Permission';
\echo '----------------------------';

SELECT
  p.id as pod_id,
  p.name as pod_name,
  prp.role_name,
  prp.hat_id,
  prp.permissions->'eventCreation' as event_creation_permission,
  prp.is_active as role_active,
  CASE
    WHEN prp.permissions->>'eventCreation' = 'true' THEN '✅ Has eventCreation'
    WHEN prp.permissions->>'eventCreation' = 'false' THEN '❌ Denied eventCreation'
    ELSE '⚠️ Permission not set'
  END as permission_status
FROM pods p
LEFT JOIN pod_role_permissions prp ON prp.pod_id = p.id
WHERE p.name IN ('Temporal naturalism', 'Executive Pod', 'Community Pod', 'Beta Testers Pod', 'Test Pod')
  AND prp.is_active = true
ORDER BY p.name, prp.role_name;

\echo '';
\echo '----------------------------';
\echo '';

-- 3. Combined check (what useEventManagementAccess does)
\echo '3. COMBINED CHECK - Both Module AND Permission';
\echo '----------------------------';

SELECT
  p.id as pod_id,
  p.name as pod_name,
  pm.events_enabled as module_enabled,
  prp.role_name,
  prp.permissions->>'eventCreation' as has_permission,
  CASE
    WHEN pm.events_enabled = true AND prp.permissions->>'eventCreation' = 'true'
      THEN '✅ WILL APPEAR in dropdown'
    WHEN pm.events_enabled = false
      THEN '❌ BLOCKED: Module OFF'
    WHEN prp.permissions->>'eventCreation' != 'true'
      THEN '❌ BLOCKED: No eventCreation permission'
    ELSE '⚠️ Unknown state'
  END as dropdown_status
FROM pods p
LEFT JOIN pod_modules pm ON pm.pod_id = p.id
LEFT JOIN pod_role_permissions prp ON prp.pod_id = p.id
WHERE p.name IN ('Temporal naturalism', 'Executive Pod', 'Community Pod', 'Beta Testers Pod', 'Test Pod')
  AND prp.is_active = true
  AND prp.role_name = 'leader'  -- Check leader roles specifically
ORDER BY
  CASE
    WHEN pm.events_enabled = true AND prp.permissions->>'eventCreation' = 'true' THEN 0
    ELSE 1
  END,
  p.name;

\echo '';
\echo '----------------------------';
\echo '';

-- 4. Show all permissions for Temporal naturalism leader role
\echo '4. TEMPORAL NATURALISM LEADER - All Permissions';
\echo '----------------------------';

SELECT
  p.name as pod_name,
  prp.role_name,
  prp.hat_id,
  jsonb_pretty(prp.permissions) as all_permissions
FROM pod_role_permissions prp
JOIN pods p ON p.id = prp.pod_id
WHERE p.name = 'Temporal naturalism'
  AND prp.role_name = 'leader'
  AND prp.is_active = true;

\echo '';
\echo '============================================';
\echo 'DIAGNOSTIC COMPLETE';
\echo '============================================';
\echo '';
\echo 'SOLUTION:';
\echo 'If "Temporal naturalism" is blocked due to missing eventCreation permission,';
\echo 'you need to grant it to the leader role:';
\echo '';
\echo '1. Go to /pods/[temporal-naturalism-id]/manage';
\echo '2. Click "Roles" tab';
\echo '3. Find "leader" role';
\echo '4. Enable "Event Creation" permission';
\echo '5. Click refresh button (🔄) on event creation page';
\echo '';
\echo 'OR run this SQL to grant it directly:';
\echo '';
\echo 'UPDATE pod_role_permissions';
\echo 'SET permissions = permissions || ''{"eventCreation": true}''::jsonb';
\echo 'WHERE pod_id = (SELECT id FROM pods WHERE name = ''Temporal naturalism'')';
\echo '  AND role_name = ''leader'';';
\echo '';
