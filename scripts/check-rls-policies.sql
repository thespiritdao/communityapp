-- Check current RLS policies for pod_modules and chat_groups
-- Run this in your Supabase SQL Editor

-- 1. Check if RLS is enabled
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('pod_modules', 'chat_groups');

-- 2. List all RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles::text[],
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('pod_modules', 'chat_groups')
ORDER BY tablename, cmd, policyname;

-- 3. Check specifically for INSERT policies (these are the ones failing)
SELECT
  tablename,
  policyname,
  cmd,
  with_check
FROM pg_policies
WHERE tablename IN ('pod_modules', 'chat_groups')
  AND cmd = 'INSERT';
