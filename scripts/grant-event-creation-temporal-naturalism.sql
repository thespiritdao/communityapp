-- Grant eventCreation permission to leader role in Temporal naturalism
-- ============================================================================

BEGIN;

-- Show current state
\echo '============================================';
\echo 'BEFORE: Current Permissions';
\echo '============================================';
\echo '';

SELECT
  p.name as pod_name,
  prp.role_name,
  prp.permissions->>'eventCreation' as event_creation_before,
  prp.permissions->>'forumAccess' as forum_access,
  prp.permissions->>'chatAccess' as chat_access
FROM pod_role_permissions prp
JOIN pods p ON p.id = prp.pod_id
WHERE p.name = 'Temporal naturalism'
  AND prp.role_name = 'leader'
  AND prp.is_active = true;

\echo '';
\echo 'Granting eventCreation permission...';
\echo '';

-- Grant the permission
UPDATE pod_role_permissions
SET permissions = permissions || '{"eventCreation": true}'::jsonb,
    updated_at = NOW()
WHERE pod_id = (SELECT id FROM pods WHERE name = 'Temporal naturalism')
  AND role_name = 'leader'
  AND is_active = true;

-- Show updated state
\echo '';
\echo '============================================';
\echo 'AFTER: Updated Permissions';
\echo '============================================';
\echo '';

SELECT
  p.name as pod_name,
  prp.role_name,
  prp.permissions->>'eventCreation' as event_creation_after,
  prp.permissions->>'forumAccess' as forum_access,
  prp.permissions->>'chatAccess' as chat_access,
  prp.updated_at
FROM pod_role_permissions prp
JOIN pods p ON p.id = prp.pod_id
WHERE p.name = 'Temporal naturalism'
  AND prp.role_name = 'leader'
  AND prp.is_active = true;

COMMIT;

\echo '';
\echo '============================================';
\echo 'PERMISSION GRANTED SUCCESSFULLY';
\echo '============================================';
\echo '';
\echo 'Next steps:';
\echo '1. Go to /events/create';
\echo '2. Click the refresh button (🔄) next to "Organizing Pod"';
\echo '3. "Temporal naturalism" should now appear in the dropdown';
\echo '';
