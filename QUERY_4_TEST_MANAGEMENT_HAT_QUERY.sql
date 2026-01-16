-- Query 4: Test if you can query pods by management_hat_id
-- This is the query that's failing with 406 error

SELECT
  id,
  name,
  blockchain_pod_id,
  management_hat_id,
  proxy_contract_address
FROM pods
WHERE management_hat_id = '3666553158177675993961018944868017452954589368035793794453283394289664'
