-- Script to verify governance_votes RLS policies
-- Run this in Supabase SQL Editor to check current policy configuration

-- 1. Check if RLS is enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'governance_votes';

-- 2. List all policies on governance_votes
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
WHERE tablename = 'governance_votes'
ORDER BY policyname;

-- 3. Show the actual policy definitions with formatting
SELECT
    policyname AS "Policy Name",
    cmd AS "Command",
    CASE
        WHEN roles::text = '{authenticated}' THEN 'authenticated'
        WHEN roles::text = '{anon}' THEN 'anon'
        ELSE roles::text
    END AS "Roles",
    qual AS "USING clause",
    with_check AS "WITH CHECK clause"
FROM pg_policies
WHERE tablename = 'governance_votes'
ORDER BY
    CASE cmd
        WHEN 'SELECT' THEN 1
        WHEN 'INSERT' THEN 2
        WHEN 'UPDATE' THEN 3
        WHEN 'DELETE' THEN 4
    END;

-- 4. Verify table structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'governance_votes'
ORDER BY ordinal_position;

-- 5. Check constraints
SELECT
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    CASE con.contype
        WHEN 'c' THEN 'CHECK'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 't' THEN 'TRIGGER'
        WHEN 'x' THEN 'EXCLUSION'
    END AS constraint_type_desc,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
INNER JOIN pg_class rel ON rel.oid = con.conrelid
INNER JOIN pg_namespace nsp ON nsp.oid = connamespace
WHERE rel.relname = 'governance_votes'
ORDER BY constraint_type;

-- Expected results for correct configuration:
--
-- RLS should be ENABLED (rowsecurity = true)
--
-- Three policies should exist:
--   1. governance_votes_select_all (SELECT) - USING (true)
--   2. governance_votes_insert_own (INSERT) - WITH CHECK (voter_address = (auth.jwt() ->> 'wallet_address'))
--   3. governance_votes_update_own (UPDATE) - USING/WITH CHECK (voter_address = (auth.jwt() ->> 'wallet_address'))
--
-- The critical part: INSERT and UPDATE must check 'wallet_address' from JWT, NOT 'sub'
