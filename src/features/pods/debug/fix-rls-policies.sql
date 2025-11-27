-- Fix RLS Policies for Wallet Authentication
-- The current policies expect Supabase Auth JWT, but the app uses wallet authentication
-- This creates wallet-compatible policies

-- 1. Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow read access to active role permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Pod managers can manage role permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Service role full access to role permissions" ON pod_role_permissions;

-- 2. Create wallet-friendly policies

-- Allow authenticated users to read ALL role permissions (not just active ones)
CREATE POLICY "Authenticated users can read role permissions" 
ON pod_role_permissions FOR SELECT 
TO authenticated 
USING (true);

-- Allow authenticated users to update role permissions
-- (Since your app handles authorization logic in the application layer)
CREATE POLICY "Authenticated users can update role permissions" 
ON pod_role_permissions FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Allow authenticated users to insert role permissions
CREATE POLICY "Authenticated users can insert role permissions" 
ON pod_role_permissions FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to delete role permissions (for cleanup)
CREATE POLICY "Authenticated users can delete role permissions" 
ON pod_role_permissions FOR DELETE 
TO authenticated 
USING (true);

-- Keep service role access for admin operations
CREATE POLICY "Service role full access to role permissions" 
ON pod_role_permissions FOR ALL 
TO service_role 
USING (true)
WITH CHECK (true);

-- Optional: More restrictive approach if you want database-level security
-- (Uncomment these and comment out the above if you want tighter control)

/*
-- Alternative: Pod-specific access based on wallet in pod_members table
CREATE POLICY "Pod members can read their pod role permissions" 
ON pod_role_permissions FOR SELECT 
TO authenticated 
USING (
    pod_id IN (
        SELECT pod_id::uuid 
        FROM pod_members 
        WHERE wallet = current_setting('request.jwt.claims', true)::json->>'sub'
        AND is_active = true
    )
);

CREATE POLICY "Pod leaders can manage their pod role permissions" 
ON pod_role_permissions FOR ALL 
TO authenticated 
USING (
    pod_id IN (
        SELECT pod_id::uuid 
        FROM pod_members 
        WHERE wallet = current_setting('request.jwt.claims', true)::json->>'sub'
        AND membership_type = 'leader'
        AND is_active = true
    )
)
WITH CHECK (
    pod_id IN (
        SELECT pod_id::uuid 
        FROM pod_members 
        WHERE wallet = current_setting('request.jwt.claims', true)::json->>'sub'
        AND membership_type = 'leader'
        AND is_active = true
    )
);
*/

-- 3. Verify the policies are applied correctly
SELECT 
    pol.policyname,
    pol.cmd,
    pol.permissive,
    pol.roles,
    pol.qual,
    pol.with_check
FROM pg_policies pol 
WHERE pol.tablename = 'pod_role_permissions'
ORDER BY pol.policyname;