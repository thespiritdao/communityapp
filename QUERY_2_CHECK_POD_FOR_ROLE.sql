-- Query 2: Find which pod the Treasury role belongs to
-- This should show the pod details including proxy_contract_address

SELECT
  p.id AS pod_id,
  p.name AS pod_name,
  p.management_hat_id,
  p.proxy_contract_address,
  prp.role_name,
  prp.token_address AS role_hat_id
FROM pod_role_permissions prp
JOIN pods p ON prp.pod_id = p.id
WHERE prp.token_address = '0x000000880001000b001000000000000000000000000000000000000000000000'
