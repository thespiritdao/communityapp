-- Check RLS policies on pods table
-- Run this in Supabase SQL Editor

-- 1. Check if RLS is enabled on pods table
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename = 'pods';

-- 2. List all policies on pods table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'pods';

-- 3. Test the problematic query (replace with your actual HAT ID)
-- This should return your pod if RLS allows it
SELECT
  id,
  name,
  blockchain_pod_id,
  management_hat_id,
  proxy_contract_address
FROM pods
WHERE management_hat_id = '3666553158177675993961018944868017452954589368035793794453283394289664';

-- 4. Check if your user can see ANY pods
SELECT
  id,
  name,
  management_hat_id,
  proxy_contract_address,
  created_at
FROM pods
ORDER BY created_at DESC
LIMIT 10;
