-- Debug Query: Check RLS Policies on pod_role_permissions table
-- Run this in Supabase SQL editor to check Row Level Security policies

-- 1. Check if RLS is enabled on the table
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'pod_role_permissions';

-- 2. Check existing RLS policies
SELECT 
    pol.policyname,
    pol.cmd,
    pol.permissive,
    pol.roles,
    pol.qual,
    pol.with_check
FROM pg_policies pol 
WHERE pol.tablename = 'pod_role_permissions';

-- 3. Test if the specific record can be selected (this should work based on logs)
SELECT id, role_name, is_active, created_by, updated_by 
FROM pod_role_permissions 
WHERE id = '3683c466-60f3-4149-9fcc-696ff2b2cc1a';

-- 4. Test if we can update the record directly (this might fail due to RLS)
-- UNCOMMENT AND TEST:
/*
UPDATE pod_role_permissions 
SET is_active = NOT is_active, updated_at = NOW()
WHERE id = '3683c466-60f3-4149-9fcc-696ff2b2cc1a'
RETURNING *;
*/

-- 5. Create or update RLS policies if needed
-- UNCOMMENT IF POLICIES ARE MISSING OR INCORRECT:

/*
-- Enable RLS on the table
ALTER TABLE pod_role_permissions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all role permissions
DROP POLICY IF EXISTS "Allow read access to role permissions" ON pod_role_permissions;
CREATE POLICY "Allow read access to role permissions" 
ON pod_role_permissions FOR SELECT 
TO authenticated 
USING (true);

-- Allow authenticated users to update role permissions
DROP POLICY IF EXISTS "Allow update access to role permissions" ON pod_role_permissions;
CREATE POLICY "Allow update access to role permissions" 
ON pod_role_permissions FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Allow authenticated users to insert role permissions
DROP POLICY IF EXISTS "Allow insert access to role permissions" ON pod_role_permissions;
CREATE POLICY "Allow insert access to role permissions" 
ON pod_role_permissions FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to delete role permissions (for cleanup)
DROP POLICY IF EXISTS "Allow delete access to role permissions" ON pod_role_permissions;
CREATE POLICY "Allow delete access to role permissions" 
ON pod_role_permissions FOR DELETE 
TO authenticated 
USING (true);
*/