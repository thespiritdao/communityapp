-- Script to delete a pod and all related database entries
-- Pod ID: 96760362-c7d1-499c-97b0-359333caf228 (Test Pod)

BEGIN;

-- Store the pod ID as a variable
DO $$
DECLARE
  pod_to_delete UUID := '96760362-c7d1-499c-97b0-359333caf228';
  deleted_count INT;
BEGIN
  RAISE NOTICE 'Deleting pod: %', pod_to_delete;

  -- 1. Delete from hat_metadata_cache (underlying table for active_pod_members view)
  -- This stores the actual pod membership/leadership data
  DELETE FROM hat_metadata_cache
  WHERE metadata->>'podId' = pod_to_delete::text;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % hat_metadata_cache records', deleted_count;

  -- 2. Delete from pod_role_permissions (role permissions)
  DELETE FROM pod_role_permissions WHERE pod_id = pod_to_delete;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % pod_role_permissions records', deleted_count;

  -- 3. Skip governance_votes - uses hat_id, not pod_id (governance votes are for proposals)
  RAISE NOTICE 'Skipping governance_votes (not directly tied to pods)';

  -- 4. Delete from pod_modules (if pod has modules)
  DELETE FROM pod_modules WHERE pod_id = pod_to_delete;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % pod_modules records', deleted_count;

  -- 5. Delete from pod_members (if any members)
  DELETE FROM pod_members WHERE pod_id = pod_to_delete;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % pod_members records', deleted_count;

  -- 6. Delete from pod_application_votes (must delete BEFORE applications due to foreign key)
  DELETE FROM pod_application_votes
  WHERE application_id IN (SELECT id FROM pod_membership_applications WHERE pod_id = pod_to_delete);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % pod_application_votes records', deleted_count;

  -- 7. Delete from pod_membership_applications (if any applications)
  DELETE FROM pod_membership_applications WHERE pod_id = pod_to_delete;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % pod_membership_applications records', deleted_count;

  -- 8. Delete from pod_accountability_signatures (if any signatures)
  DELETE FROM pod_accountability_signatures WHERE pod_id = pod_to_delete;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % pod_accountability_signatures records', deleted_count;

  -- 9. Delete from pod_deletion_proposals (if any deletion proposals)
  DELETE FROM pod_deletion_proposals WHERE pod_id = pod_to_delete;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % pod_deletion_proposals records', deleted_count;

  -- 10. Delete from treasury_transactions (if any treasury activity)
  DELETE FROM treasury_transactions WHERE pod_id = pod_to_delete;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % treasury_transactions records', deleted_count;

  -- 11. Delete from events (if any pod events)
  DELETE FROM events
  WHERE organizing_pod_id::text = pod_to_delete::text
     OR fund_recipient_pod_id::text = pod_to_delete::text;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % events records', deleted_count;

  -- 12. Delete from bounties (if any pod bounties)
  DELETE FROM bounties WHERE pod_id = pod_to_delete;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % bounties records', deleted_count;

  -- 13. Finally, delete the pod itself
  DELETE FROM pods WHERE id = pod_to_delete;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % pod record(s)', deleted_count;

  RAISE NOTICE '✅ Pod deletion complete!';
END $$;

-- Review changes before committing
-- If everything looks good, uncomment the next line:
COMMIT;

-- If you want to rollback instead:
-- ROLLBACK;
