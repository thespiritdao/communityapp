-- Check forum_categories table structure and add missing columns if needed

-- Step 1: Show current table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'forum_categories'
ORDER BY ordinal_position;

-- Step 2: Check if required columns exist
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_categories' AND column_name = 'pod_id')
    THEN '✅ pod_id exists'
    ELSE '❌ pod_id missing'
  END as pod_id_check,
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_categories' AND column_name = 'is_active')
    THEN '✅ is_active exists'
    ELSE '❌ is_active missing'
  END as is_active_check,
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_categories' AND column_name = 'access_level')
    THEN '✅ access_level exists'
    ELSE '❌ access_level missing'
  END as access_level_check,
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_categories' AND column_name = 'required_token')
    THEN '✅ required_token exists'
    ELSE '❌ required_token missing'
  END as required_token_check,
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'forum_categories' AND column_name = 'created_by_address')
    THEN '✅ created_by_address exists'
    ELSE '❌ created_by_address missing'
  END as created_by_address_check;

-- Step 3: Check RLS status
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'forum_categories';

-- Step 4: Show existing RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  CASE
    WHEN with_check::text LIKE '%wallet_address%user_profiles%' THEN '✅ Uses wallet_address lookup'
    WHEN with_check::text LIKE '%auth.uid()%' THEN '⚠️ Uses auth.uid() - may need wallet lookup'
    ELSE '❓ Check policy'
  END as policy_type
FROM pg_policies
WHERE tablename = 'forum_categories'
ORDER BY cmd, policyname;
