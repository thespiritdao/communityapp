-- Check role agreements and eligibility criteria
-- Run this in Supabase SQL Editor
-- IMPORTANT: Run each query separately (copy/paste one at a time)

-- Query 1: Check the Treasury role you just created
SELECT
  id,
  pod_id,
  role_name,
  token_address AS hat_id,
  eligibility_criteria,
  permissions,
  created_at,
  updated_at
FROM pod_role_permissions
WHERE token_address = '0x000000880001000b001000000000000000000000000000000000000000000000'
ORDER BY updated_at DESC;
