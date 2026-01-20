-- Comprehensive Forum Permission System Audit
-- This script checks all layers of the forum permission infrastructure

\echo '==========================================';
\echo 'FORUM PERMISSION SYSTEM AUDIT';
\echo '==========================================';
\echo '';

-- ====================
-- 1. POD MODULES CHECK
-- ====================
\echo '1. POD MODULES CONFIGURATION';
\echo '----------------------------';
\echo 'Checking which pods have forum module enabled...';
\echo '';

SELECT
  p.id as pod_id,
  p.name as pod_name,
  pm.forum_enabled,
  pm.chat_enabled,
  pm.updated_at as module_config_updated,
  CASE
    WHEN pm.forum_enabled THEN '✅ Forum Enabled'
    ELSE '❌ Forum Disabled'
  END as status
FROM pods p
LEFT JOIN pod_modules pm ON p.id = pm.pod_id
ORDER BY pm.forum_enabled DESC, p.created_at DESC;

\echo '';
\echo '----------------------------';
\echo '';

-- ====================
-- 2. FORUM CATEGORIES
-- ====================
\echo '2. FORUM CATEGORIES';
\echo '----------------------------';
\echo 'All forum categories with their pod associations...';
\echo '';

SELECT
  fc.id as category_id,
  fc.name as category_name,
  fc.pod_id,
  p.name as pod_name,
  fc.required_token,
  fc.is_active,
  fc.access_level,
  pm.forum_enabled as pod_forum_enabled,
  CASE
    WHEN fc.pod_id IS NULL THEN '🌐 Global Forum'
    WHEN pm.forum_enabled THEN '✅ Pod Forum (Enabled)'
    WHEN NOT pm.forum_enabled THEN '❌ Pod Forum (Disabled)'
    ELSE '⚠️ Pod Forum (No Module Config)'
  END as category_status
FROM forum_categories fc
LEFT JOIN pods p ON fc.pod_id = p.id
LEFT JOIN pod_modules pm ON p.id = pm.pod_id
ORDER BY fc.pod_id IS NULL DESC, pm.forum_enabled DESC NULLS LAST, fc.created_at DESC;

\echo '';
\echo '----------------------------';
\echo '';

-- ====================
-- 3. RLS POLICIES
-- ====================
\echo '3. ROW LEVEL SECURITY POLICIES';
\echo '----------------------------';
\echo 'Checking RLS policies on forum tables...';
\echo '';

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as policy_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'forum_%'
ORDER BY tablename, policyname;

\echo '';
\echo '----------------------------';
\echo '';

-- ====================
-- 4. PERMISSION LOOKUP
-- ====================
\echo '4. POD ROLE PERMISSIONS';
\echo '----------------------------';
\echo 'Checking forumAccess permissions in pod roles...';
\echo '';

SELECT
  prp.id,
  prp.pod_id,
  p.name as pod_name,
  prp.role_name,
  prp.token_address,
  prp.permissions->'forumAccess' as forum_access_perm,
  prp.permissions->'forumModeration' as forum_moderation_perm,
  prp.permissions->'chatAccess' as chat_access_perm,
  prp.is_active,
  pm.forum_enabled as pod_forum_enabled,
  CASE
    WHEN NOT pm.forum_enabled THEN '⚠️ Pod Forum Module Disabled'
    WHEN prp.permissions->>'forumAccess' = 'true' THEN '✅ Has Forum Access'
    ELSE '❌ No Forum Access'
  END as access_status
FROM pod_role_permissions prp
JOIN pods p ON prp.pod_id = p.id
LEFT JOIN pod_modules pm ON p.id = pm.pod_id
WHERE prp.is_active = true
ORDER BY pm.forum_enabled DESC NULLS LAST, p.name, prp.role_name;

\echo '';
\echo '----------------------------';
\echo '';

-- ====================
-- 5. ACCESS CONTROL GAPS
-- ====================
\echo '5. POTENTIAL PERMISSION GAPS';
\echo '----------------------------';
\echo 'Identifying scenarios where permissions might bypass module toggles...';
\echo '';

SELECT
  '⚠️ ISSUE: Forum categories exist for pods with forum module DISABLED' as issue_type,
  COUNT(*) as affected_count
FROM forum_categories fc
JOIN pods p ON fc.pod_id = p.id
JOIN pod_modules pm ON p.id = pm.pod_id
WHERE pm.forum_enabled = false
  AND fc.is_active = true;

\echo '';

SELECT
  '⚠️ ISSUE: Active forum categories with NULL required_token' as issue_type,
  COUNT(*) as affected_count
FROM forum_categories fc
WHERE fc.required_token IS NULL
  AND fc.is_active = true;

\echo '';

SELECT
  '⚠️ ISSUE: Pod role permissions with forumAccess but pod forum module disabled' as issue_type,
  COUNT(*) as affected_count
FROM pod_role_permissions prp
JOIN pod_modules pm ON prp.pod_id = pm.pod_id
WHERE prp.permissions->>'forumAccess' = 'true'
  AND pm.forum_enabled = false
  AND prp.is_active = true;

\echo '';
\echo '----------------------------';
\echo '';

-- ====================
-- 6. DETAILED GAP ANALYSIS
-- ====================
\echo '6. DETAILED PERMISSION GAPS';
\echo '----------------------------';
\echo 'Specific forum categories that violate module toggle...';
\echo '';

SELECT
  fc.id as category_id,
  fc.name as category_name,
  p.name as pod_name,
  fc.required_token,
  fc.is_active as category_active,
  pm.forum_enabled as module_enabled,
  '❌ Forum accessible despite toggle OFF' as violation
FROM forum_categories fc
JOIN pods p ON fc.pod_id = p.id
JOIN pod_modules pm ON p.id = pm.pod_id
WHERE pm.forum_enabled = false
  AND fc.is_active = true;

\echo '';
\echo '----------------------------';
\echo '';

-- ====================
-- 7. RPC FUNCTION CHECK
-- ====================
\echo '7. RPC FUNCTION ANALYSIS';
\echo '----------------------------';
\echo 'Checking forums_accessible_by_identity RPC function...';
\echo '';

SELECT
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'forums_accessible_by_identity';

\echo '';
\echo '==========================================';
\echo 'AUDIT COMPLETE';
\echo '==========================================';
\echo '';
\echo 'KEY FINDINGS TO INVESTIGATE:';
\echo '1. Does the RPC function check pod_modules.forum_enabled?';
\echo '2. Do RLS policies check pod_modules.forum_enabled?';
\echo '3. Does the application UI check forum_enabled before showing categories?';
\echo '';
