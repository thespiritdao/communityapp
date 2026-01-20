-- Fix forum categories with NULL required_token
-- Sets them to their pod's management_hat_id

BEGIN;

-- Show what will be updated
SELECT
  'Before Update' as status,
  fc.id,
  fc.name,
  fc.pod_id,
  fc.required_token as current_required_token,
  p.management_hat_id as pod_management_hat,
  CASE
    WHEN fc.required_token IS NULL THEN '❌ NULL - Will be updated'
    ELSE '✅ Has value'
  END as needs_update
FROM forum_categories fc
JOIN pods p ON p.id = fc.pod_id
WHERE fc.pod_id IS NOT NULL;

-- Update forum categories to use their pod's management_hat_id
UPDATE forum_categories fc
SET required_token = p.management_hat_id
FROM pods p
WHERE fc.pod_id = p.id
  AND fc.pod_id IS NOT NULL
  AND fc.required_token IS NULL
  AND p.management_hat_id IS NOT NULL;

-- Verify the update
SELECT
  'After Update' as status,
  fc.id,
  fc.name,
  fc.pod_id,
  fc.required_token as new_required_token,
  p.management_hat_id as pod_management_hat,
  CASE
    WHEN fc.required_token = p.management_hat_id THEN '✅ Matches pod HAT'
    WHEN fc.required_token IS NULL THEN '❌ Still NULL'
    ELSE '⚠️ Different value'
  END as status
FROM forum_categories fc
JOIN pods p ON p.id = fc.pod_id
WHERE fc.pod_id IS NOT NULL;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE '✅ Forum required_token fields updated!';
  RAISE NOTICE '';
  RAISE NOTICE 'What was done:';
  RAISE NOTICE '• Updated forum categories to use their pod''s management_hat_id';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Refresh /forum page';
  RAISE NOTICE '2. Your pod forum categories should now be visible!';
END $$;
