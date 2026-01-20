-- Diagnostic: Show all records related to Test Pod before deletion
-- ============================================================================
-- Pod ID: 96760362-c7d1-499c-97b0-359333caf228
-- Pod Name: Test Pod

\echo '============================================';
\echo 'TEST POD DELETION DIAGNOSTIC';
\echo '============================================';
\echo '';

-- Store pod ID for easier querying
\set pod_id '96760362-c7d1-499c-97b0-359333caf228'

-- 1. Pod basic info
\echo '1. POD BASIC INFO';
\echo '----------------------------';
SELECT
  id, name, status, is_active, created_at,
  treasury_contract_address, management_hat_id
FROM pods
WHERE id = :'pod_id';

\echo '';
\echo '----------------------------';
\echo '';

-- 2. Pod role permissions
\echo '2. POD ROLE PERMISSIONS (will be deleted)';
\echo '----------------------------';
SELECT id, role_name, hat_id, is_active, permissions
FROM pod_role_permissions
WHERE pod_id = :'pod_id';

\echo '';
\echo '----------------------------';
\echo '';

-- 3. Pod modules
\echo '3. POD MODULES (will be deleted)';
\echo '----------------------------';
SELECT
  pod_id,
  chat_enabled,
  forum_enabled,
  events_enabled,
  bounties_enabled
FROM pod_modules
WHERE pod_id = :'pod_id';

\echo '';
\echo '----------------------------';
\echo '';

-- 4. Pod members
\echo '4. POD MEMBERS (will be deleted)';
\echo '----------------------------';
SELECT id, wallet_address, role, joined_at
FROM pod_members
WHERE pod_id = :'pod_id';

\echo '';
\echo '----------------------------';
\echo '';

-- 5. Forum categories
\echo '5. FORUM CATEGORIES (will be deleted)';
\echo '----------------------------';
SELECT id, name, description, pod_id, required_token
FROM forum_categories
WHERE pod_id = :'pod_id';

\echo '';
\echo '----------------------------';
\echo '';

-- 6. Events organized by this pod
\echo '6. EVENTS (organizing or recipient - will be updated/deleted)';
\echo '----------------------------';
SELECT id, title, status, organizing_pod_id, fund_recipient_pod_id
FROM events
WHERE organizing_pod_id = :'pod_id'
   OR fund_recipient_pod_id = :'pod_id';

\echo '';
\echo '----------------------------';
\echo '';

-- 7. Bounties
\echo '7. BOUNTIES (will be deleted)';
\echo '----------------------------';
SELECT id, title, status, pod_id
FROM bounties
WHERE pod_id = :'pod_id';

\echo '';
\echo '----------------------------';
\echo '';

-- 8. Chat groups
\echo '8. CHAT GROUPS (will be deleted)';
\echo '----------------------------';
SELECT id, name, pod_id, created_at
FROM chat_groups
WHERE pod_id = :'pod_id';

\echo '';
\echo '----------------------------';
\echo '';

-- 9. Proposals
\echo '9. PROPOSALS (will be updated - pod reference nullified)';
\echo '----------------------------';
SELECT id, title, status, related_pod_id
FROM proposals
WHERE related_pod_id = :'pod_id';

\echo '';
\echo '----------------------------';
\echo '';

-- 10. Child pods (if any)
\echo '10. CHILD PODS (WARNING: may need manual handling)';
\echo '----------------------------';
SELECT id, name, parent_pod_id
FROM pods
WHERE parent_pod_id = :'pod_id';

\echo '';
\echo '============================================';
\echo 'DIAGNOSTIC COMPLETE';
\echo '============================================';
\echo '';
\echo 'To proceed with deletion, run:';
\echo '  psql [connection] -f scripts/delete-test-pod.sql';
\echo '';
