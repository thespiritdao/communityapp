-- Temporarily disable history logging to fix the immediate issue
-- Run this in Supabase SQL editor

-- 1. Check if there's a trigger creating history records
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'pod_role_permissions';

-- 2. Disable the history trigger temporarily (if it exists)
-- Replace 'trigger_name' with the actual trigger name from step 1
-- DROP TRIGGER IF EXISTS pod_role_permissions_history_trigger ON pod_role_permissions;

-- 3. Alternative: Fix the history table RLS policies instead
-- Check what policies exist on history table
SELECT policyname, cmd, permissive, roles, qual, with_check 
FROM pg_policies 
WHERE tablename = 'pod_role_permissions_history';

-- 4. Create missing policies for history table
DROP POLICY IF EXISTS "Authenticated users can insert history" ON pod_role_permissions_history;
CREATE POLICY "Authenticated users can insert history" 
ON pod_role_permissions_history FOR INSERT 
TO authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read history" ON pod_role_permissions_history;
CREATE POLICY "Authenticated users can read history" 
ON pod_role_permissions_history FOR SELECT 
TO authenticated 
USING (true);

-- 5. Check if RLS is enabled on history table
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'pod_role_permissions_history';