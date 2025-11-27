-- ==============================================================================
-- SUPABASE RLS POLICY AUDIT QUERIES
-- Run these in Supabase SQL Editor to audit current RLS configuration
-- ==============================================================================

-- 1. LIST ALL TABLES WITH RLS STATUS
-- ==============================================================================
SELECT
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. LIST ALL RLS POLICIES (DETAILED VIEW)
-- ==============================================================================
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd as command,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. POD-SPECIFIC TABLES RLS POLICIES
-- ==============================================================================
SELECT
    tablename,
    policyname,
    cmd as operation,
    roles,
    qual as policy_condition
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
    'pods',
    'pod_members',
    'active_pod_members',
    'pod_membership_applications',
    'pod_role_permissions',
    'pod_application_votes'
)
ORDER BY tablename, policyname;

-- 4. TREASURY-RELATED TABLES RLS POLICIES
-- ==============================================================================
SELECT
    tablename,
    policyname,
    cmd as operation,
    roles,
    qual as policy_condition
FROM pg_policies
WHERE schemaname = 'public'
AND tablename LIKE '%treasury%'
ORDER BY tablename, policyname;

-- 5. CHECK SPECIFIC TABLE: pod_members
-- ==============================================================================
SELECT
    policyname,
    cmd,
    roles,
    qual
FROM pg_policies
WHERE tablename = 'pod_members'
AND schemaname = 'public';

-- 6. CHECK AUTHENTICATION PATTERN USAGE
-- ==============================================================================
-- This checks if policies use the correct auth pattern
SELECT
    tablename,
    policyname,
    CASE
        WHEN qual LIKE '%user_profiles%' THEN 'Uses user_profiles (CORRECT)'
        WHEN qual LIKE '%auth.jwt()%wallet_address%' THEN 'Uses JWT wallet_address (MAY FAIL)'
        WHEN qual LIKE '%auth.uid()%' THEN 'Uses auth.uid() only'
        WHEN qual LIKE '%auth.role()%' THEN 'Uses auth.role() (PERMISSIVE)'
        ELSE 'Other pattern'
    END as auth_pattern,
    qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY auth_pattern, tablename;

-- 7. IDENTIFY PERMISSIVE POLICIES (POTENTIAL SECURITY CONCERNS)
-- ==============================================================================
SELECT
    tablename,
    policyname,
    cmd,
    roles,
    'PERMISSIVE: Anyone authenticated can access' as concern
FROM pg_policies
WHERE schemaname = 'public'
AND (
    qual LIKE '%auth.role() = ''authenticated''%'
    OR qual = 'true'
)
ORDER BY tablename, policyname;

-- 8. CHECK TABLES WITHOUT RLS ENABLED
-- ==============================================================================
SELECT
    tablename,
    'RLS NOT ENABLED - Potential security issue' as issue
FROM pg_tables
WHERE schemaname = 'public'
AND rowsecurity = false
AND tablename NOT LIKE 'pg_%'
AND tablename NOT IN ('migrations', 'schema_migrations')
ORDER BY tablename;

-- 9. VERIFY POD LEADER PERMISSION CHECKS
-- ==============================================================================
-- Shows which policies check for pod leadership
SELECT
    tablename,
    policyname,
    cmd,
    CASE
        WHEN qual LIKE '%membership_type = ''leader''%' THEN 'Checks leader role (GOOD)'
        WHEN qual LIKE '%pod_leads%' THEN 'Checks pod_leads array (GOOD)'
        ELSE 'No leader check (MAY BE ISSUE)'
    END as leader_check_status,
    qual
FROM pg_policies
WHERE schemaname = 'public'
AND (cmd = 'UPDATE' OR cmd = 'DELETE' OR cmd = 'INSERT' OR cmd = 'ALL')
ORDER BY leader_check_status, tablename;

-- 10. SUMMARY: TABLES WITH POTENTIAL ISSUES
-- ==============================================================================
WITH rls_status AS (
    SELECT
        t.tablename,
        t.rowsecurity as rls_enabled,
        COUNT(p.policyname) as policy_count,
        BOOL_OR(p.qual LIKE '%auth.role() = ''authenticated''%' OR p.qual = 'true') as has_permissive_policy
    FROM pg_tables t
    LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
    WHERE t.schemaname = 'public'
    AND t.tablename NOT LIKE 'pg_%'
    GROUP BY t.tablename, t.rowsecurity
)
SELECT
    tablename,
    CASE
        WHEN NOT rls_enabled THEN '🔴 CRITICAL: RLS disabled'
        WHEN policy_count = 0 THEN '🔴 CRITICAL: No RLS policies'
        WHEN has_permissive_policy THEN '⚠️ WARNING: Has permissive policies'
        ELSE '✅ OK: Has restrictive policies'
    END as status,
    policy_count as total_policies
FROM rls_status
ORDER BY
    CASE
        WHEN NOT rls_enabled THEN 1
        WHEN policy_count = 0 THEN 2
        WHEN has_permissive_policy THEN 3
        ELSE 4
    END,
    tablename;
