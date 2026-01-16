-- Check Beta Testers Pod creation history and missing proxy

SELECT
  id,
  name,
  created_at,
  blockchain_pod_id,
  management_hat_id,
  membership_hat_id,
  proxy_contract_address,
  treasury_contract_address,
  is_active,
  created_by
FROM pods
WHERE id = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb'
