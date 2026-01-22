-- Script to delete a pod and all related database entries
-- Pod ID: 96760362-c7d1-499c-97b0-359333caf228 (Test Pod)

BEGIN;

-- Store the pod ID as a variable
DO $$
DECLARE
  pod_to_delete UUID := '96760362-c7d1-499c-97b0-359333caf228';
BEGIN
  RAISE NOTICE 'Deleting pod: %', pod_to_delete;

  -- 1. Delete from active_pod_members (pod membership records)
  DELETE FROM active_pod_members WHERE pod_id = pod_to_delete;
  RAISE NOTICE 'Deleted active_pod_members records';

  -- 2. Delete from pod_role_permissions (role permissions)
  DELETE FROM pod_role_permissions WHERE pod_id = pod_to_delete;
  RAISE NOTICE 'Deleted pod_role_permissions records';

  -- 3. Delete from governance_votes (if pod-related votes exist)
  DELETE FROM governance_votes WHERE pod_id = pod_to_delete;
  RAISE NOTICE 'Deleted governance_votes records';

  -- 4. Delete from pod_modules (if pod has modules)
  DELETE FROM pod_modules WHERE pod_id = pod_to_delete;
  RAISE NOTICE 'Deleted pod_modules records';

  -- 5. Delete from pod_invitations (if any pending invites)
  DELETE FROM pod_invitations WHERE pod_id = pod_to_delete;
  RAISE NOTICE 'Deleted pod_invitations records';

  -- 6. Delete from treasury_transactions (if any treasury activity)
  DELETE FROM treasury_transactions WHERE pod_id = pod_to_delete;
  RAISE NOTICE 'Deleted treasury_transactions records';

  -- 7. Delete from events (if any pod events)
  DELETE FROM events WHERE pod_id = pod_to_delete;
  RAISE NOTICE 'Deleted events records';

  -- 8. Delete from bounties (if any pod bounties)
  DELETE FROM bounties WHERE pod_id = pod_to_delete;
  RAISE NOTICE 'Deleted bounties records';

  -- 9. Finally, delete the pod itself
  DELETE FROM pods WHERE id = pod_to_delete;
  RAISE NOTICE 'Deleted pod record';

  RAISE NOTICE 'Pod deletion complete!';
END $$;

-- Review changes before committing
-- If everything looks good, uncomment the next line:
-- COMMIT;

-- If you want to rollback instead:
ROLLBACK;
