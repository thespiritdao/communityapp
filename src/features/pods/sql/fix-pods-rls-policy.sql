-- Fix RLS policy for pods table to allow pod creation
-- Run this in Supabase SQL Editor

-- Drop existing restrictive policy if it exists
DROP POLICY IF EXISTS "Allow authenticated users to read all pods" ON pods;

-- Create comprehensive RLS policies for pods table
-- Allow authenticated users to read all pods
CREATE POLICY "Allow authenticated users to read all pods" ON pods
FOR SELECT 
TO authenticated 
USING (true);

-- Allow authenticated users to create pods
CREATE POLICY "Allow authenticated users to create pods" ON pods
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow pod creators and leads to update their pods
CREATE POLICY "Allow pod leads to update pods" ON pods
FOR UPDATE 
TO authenticated 
USING (
    -- User is the creator
    created_by_address = (
        SELECT wallet_address 
        FROM user_profiles 
        WHERE user_id = auth.uid()
    )
    OR
    -- User is one of the pod leads
    (
        SELECT wallet_address 
        FROM user_profiles 
        WHERE user_id = auth.uid()
    ) = ANY(pod_leads)
);

-- Allow pod creators and leads to delete their pods (if needed)
CREATE POLICY "Allow pod leads to delete pods" ON pods
FOR DELETE 
TO authenticated 
USING (
    -- User is the creator
    created_by_address = (
        SELECT wallet_address 
        FROM user_profiles 
        WHERE user_id = auth.uid()
    )
    OR
    -- User is one of the pod leads
    (
        SELECT wallet_address 
        FROM user_profiles 
        WHERE user_id = auth.uid()
    ) = ANY(pod_leads)
);

-- Verify the policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'pods';