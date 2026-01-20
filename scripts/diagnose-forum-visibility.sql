-- Diagnose why pod-based forum categories aren't showing up

-- Step 1: Show all forum categories with pod_id
SELECT
  'All Pod-Based Forum Categories' as info,
  id,
  name,
  description,
  pod_id,
  required_token,
  access_level,
  is_active,
  created_at
FROM forum_categories
WHERE pod_id IS NOT NULL
ORDER BY created_at DESC;

-- Step 2: Show the pods and their HAT IDs
SELECT
  'Pod HAT IDs' as info,
  p.id as pod_id,
  p.pod_name,
  p.token_address,
  p.management_hat_id,
  p.membership_hat_id
FROM pods p
ORDER BY p.created_at DESC
LIMIT 10;

-- Step 3: Show user's role permissions (HATs they should have)
SELECT
  'User Role Permissions (Expected HATs)' as info,
  prp.id,
  prp.pod_id,
  prp.role_name,
  prp.token_address as hat_id,
  p.pod_name,
  prp.is_active
FROM pod_role_permissions prp
JOIN pods p ON p.id = prp.pod_id
WHERE prp.is_active = true
ORDER BY prp.created_at DESC
LIMIT 20;

-- Step 4: Check if required_tokens match any role permissions
SELECT
  'Forum Categories vs Available HATs' as info,
  fc.name as forum_name,
  fc.required_token as forum_requires,
  fc.pod_id,
  p.pod_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE prp.token_address = fc.required_token
      AND prp.is_active = true
    )
    THEN '✅ Matching HAT exists'
    ELSE '❌ No matching HAT'
  END as has_matching_hat
FROM forum_categories fc
LEFT JOIN pods p ON p.id = fc.pod_id
WHERE fc.pod_id IS NOT NULL
ORDER BY fc.created_at DESC;

-- Step 5: Show what the query is looking for
-- This simulates what the app would query
SELECT
  'Simulated Query Check' as info,
  fc.id,
  fc.name,
  fc.required_token,
  fc.pod_id,
  fc.is_active,
  CASE
    WHEN fc.is_active = true AND fc.pod_id IS NOT NULL
    THEN '✅ Passes basic filter'
    ELSE '❌ Fails basic filter'
  END as basic_filter_status
FROM forum_categories fc
WHERE fc.pod_id IS NOT NULL
ORDER BY fc.created_at DESC;
