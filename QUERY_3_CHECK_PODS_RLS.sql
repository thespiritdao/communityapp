-- Query 3: Check RLS policies on pods table
-- This will show what SELECT policies exist

SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_clause
FROM pg_policies
WHERE tablename = 'pods'
  AND cmd = 'SELECT'
