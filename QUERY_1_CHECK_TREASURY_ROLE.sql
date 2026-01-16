-- Query 1: Check the Treasury role you just created
-- This will show if the agreement requirement was saved

SELECT
  id,
  pod_id,
  role_name,
  token_address AS hat_id,
  eligibility_criteria,
  created_at,
  updated_at
FROM pod_role_permissions
WHERE token_address = '0x000000880001000b001000000000000000000000000000000000000000000000'
ORDER BY updated_at DESC
