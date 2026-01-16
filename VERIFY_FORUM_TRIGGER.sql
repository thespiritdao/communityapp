-- Verification SQL for Forum Auto-Creation Trigger
-- Run this in Supabase SQL Editor to verify the trigger exists

-- 1. Check if the trigger function exists
SELECT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'create_pod_forum_category'
  AND n.nspname = 'public';

-- 2. Check if the trigger exists on pod_modules table
SELECT
  t.tgname AS trigger_name,
  t.tgenabled AS enabled,
  p.proname AS function_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'pod_modules'
  AND t.tgname = 'trigger_create_pod_forum';

-- 3. Test query: Check if your pod has a forum category
-- Replace 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb' with your pod ID
SELECT
  fc.id,
  fc.name,
  fc.description,
  fc.pod_id,
  fc.created_at,
  p.name AS pod_name
FROM forum_categories fc
LEFT JOIN pods p ON fc.pod_id = p.id
WHERE fc.pod_id = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb';

-- 4. Check pod_modules status for your pod
SELECT
  pm.pod_id,
  pm.forum_enabled,
  pm.updated_at,
  p.name AS pod_name
FROM pod_modules pm
JOIN pods p ON pm.pod_id = p.id
WHERE pm.pod_id = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb';
