-- Delete Test Pod and all related records
-- ============================================================================
-- Pod ID: 96760362-c7d1-499c-97b0-359333caf228
-- Pod Name: Test Pod
--
-- WARNING: This will permanently delete the pod and ALL related data:
-- - Role permissions
-- - Modules configuration
-- - Members
-- - Forum categories
-- - Chat groups and messages
-- - Bounties
-- - Events (organized by this pod)
-- - Proposals (pod reference will be nullified)
-- ============================================================================

BEGIN;

\set pod_id '96760362-c7d1-499c-97b0-359333caf228'

\echo '============================================';
\echo 'DELETING TEST POD AND ALL RELATIONS';
\echo '============================================';
\echo '';
\echo 'Pod ID: 96760362-c7d1-499c-97b0-359333caf228';
\echo 'Pod Name: Test Pod';
\echo '';

-- Step 1: Delete chat messages (must delete before chat_groups due to FK)
\echo 'Step 1: Deleting chat messages...';
DELETE FROM chat_messages
WHERE group_id IN (
  SELECT id FROM chat_groups WHERE pod_id = :'pod_id'
);
\echo '✓ Chat messages deleted';
\echo '';

-- Step 2: Delete chat group members (must delete before chat_groups due to FK)
\echo 'Step 2: Deleting chat group members...';
DELETE FROM chat_group_members
WHERE group_id IN (
  SELECT id FROM chat_groups WHERE pod_id = :'pod_id'
);
\echo '✓ Chat group members deleted';
\echo '';

-- Step 3: Delete chat groups
\echo 'Step 3: Deleting chat groups...';
DELETE FROM chat_groups
WHERE pod_id = :'pod_id';
\echo '✓ Chat groups deleted';
\echo '';

-- Step 4: Delete forum threads (must delete before forum_categories due to FK)
\echo 'Step 4: Deleting forum threads...';
DELETE FROM forum_threads
WHERE category_id IN (
  SELECT id FROM forum_categories WHERE pod_id = :'pod_id'
);
\echo '✓ Forum threads deleted';
\echo '';

-- Step 5: Delete forum categories
\echo 'Step 5: Deleting forum categories...';
DELETE FROM forum_categories
WHERE pod_id = :'pod_id';
\echo '✓ Forum categories deleted';
\echo '';

-- Step 6: Delete event attendees (must delete before events due to FK)
\echo 'Step 6: Deleting event attendees...';
DELETE FROM event_attendees
WHERE event_id IN (
  SELECT id FROM events WHERE organizing_pod_id = :'pod_id'
);
\echo '✓ Event attendees deleted';
\echo '';

-- Step 7: Delete event required tokens (must delete before events due to FK)
\echo 'Step 7: Deleting event required tokens...';
DELETE FROM event_required_tokens
WHERE event_id IN (
  SELECT id FROM events WHERE organizing_pod_id = :'pod_id'
);
\echo '✓ Event required tokens deleted';
\echo '';

-- Step 8: Delete or update events
\echo 'Step 8: Deleting events organized by this pod...';
DELETE FROM events
WHERE organizing_pod_id = :'pod_id';
\echo '✓ Events deleted';
\echo '';

\echo 'Step 8b: Nullifying fund_recipient_pod_id for other events...';
UPDATE events
SET fund_recipient_pod_id = NULL
WHERE fund_recipient_pod_id = :'pod_id';
\echo '✓ Fund recipient references updated';
\echo '';

-- Step 9: Delete bounty applications (must delete before bounties due to FK)
\echo 'Step 9: Deleting bounty applications...';
DELETE FROM bounty_applications
WHERE bounty_id IN (
  SELECT id FROM bounties WHERE pod_id = :'pod_id'
);
\echo '✓ Bounty applications deleted';
\echo '';

-- Step 10: Delete bounties
\echo 'Step 10: Deleting bounties...';
DELETE FROM bounties
WHERE pod_id = :'pod_id';
\echo '✓ Bounties deleted';
\echo '';

-- Step 11: Delete pod role permissions
\echo 'Step 11: Deleting pod role permissions...';
DELETE FROM pod_role_permissions
WHERE pod_id = :'pod_id';
\echo '✓ Pod role permissions deleted';
\echo '';

-- Step 12: Delete pod members
\echo 'Step 12: Deleting pod members...';
DELETE FROM pod_members
WHERE pod_id = :'pod_id';
\echo '✓ Pod members deleted';
\echo '';

-- Step 13: Delete pod modules
\echo 'Step 13: Deleting pod modules...';
DELETE FROM pod_modules
WHERE pod_id = :'pod_id';
\echo '✓ Pod modules deleted';
\echo '';

-- Step 14: Delete membership applications
\echo 'Step 14: Deleting membership applications...';
DELETE FROM membership_applications
WHERE pod_id = :'pod_id';
\echo '✓ Membership applications deleted';
\echo '';

-- Step 15: Nullify proposal references
\echo 'Step 15: Nullifying proposal pod references...';
UPDATE proposals
SET related_pod_id = NULL
WHERE related_pod_id = :'pod_id';
\echo '✓ Proposal references updated';
\echo '';

-- Step 16: Check for child pods (warn but don't delete)
\echo 'Step 16: Checking for child pods...';
DO $$
DECLARE
  child_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO child_count
  FROM pods
  WHERE parent_pod_id = '96760362-c7d1-499c-97b0-359333caf228';

  IF child_count > 0 THEN
    RAISE NOTICE '⚠️  WARNING: This pod has % child pod(s)!', child_count;
    RAISE NOTICE '   Nullifying parent_pod_id for child pods...';

    UPDATE pods
    SET parent_pod_id = NULL
    WHERE parent_pod_id = '96760362-c7d1-499c-97b0-359333caf228';

    RAISE NOTICE '✓ Child pods updated (parent reference removed)';
  ELSE
    RAISE NOTICE '✓ No child pods found';
  END IF;
END $$;
\echo '';

-- Step 17: Finally, delete the pod itself
\echo 'Step 17: Deleting the pod record...';
DELETE FROM pods
WHERE id = :'pod_id';
\echo '✓ Pod deleted';
\echo '';

\echo '============================================';
\echo 'DELETION COMPLETE';
\echo '============================================';
\echo '';
\echo 'Test Pod has been permanently deleted.';
\echo '';

COMMIT;

\echo 'Transaction committed successfully.';
\echo '';
