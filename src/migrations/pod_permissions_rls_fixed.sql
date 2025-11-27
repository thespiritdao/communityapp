-- RLS Policies for pod permission tables
-- Since pod_permission_lookup is a VIEW, we need to apply RLS to the underlying tables

-- First, let's check and create RLS for pod_role_permissions table (the actual table)
-- This table stores the role permissions for each pod

-- Enable RLS on pod_role_permissions if it's a table
ALTER TABLE pod_role_permissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public can view active pod role permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Authenticated users can view all pod role permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Pod leaders can manage permissions" ON pod_role_permissions;

-- Policy 1: Allow public/anon to view active pod role permissions (for checking access)
CREATE POLICY "Public can view active pod role permissions" 
ON pod_role_permissions 
FOR SELECT 
TO anon
USING (is_active = true);

-- Policy 2: Allow authenticated users to view all pod role permissions
CREATE POLICY "Authenticated users can view all pod role permissions" 
ON pod_role_permissions 
FOR SELECT 
TO authenticated
USING (true);

-- Policy 3: Allow pod leaders to manage permissions for their pods
-- Note: This is simplified - in production you'd check hat ownership
CREATE POLICY "Pod leaders can manage permissions" 
ON pod_role_permissions 
FOR ALL 
TO authenticated
USING (
  -- For now, allow authenticated users to manage
  -- In production, check if user has leader hat for this pod
  true
)
WITH CHECK (
  -- Same check for inserts/updates
  true
);

-- Grant appropriate permissions
GRANT SELECT ON pod_role_permissions TO anon;
GRANT ALL ON pod_role_permissions TO authenticated;
GRANT ALL ON pod_role_permissions TO service_role;

-- If there's a pods table, enable RLS on it too
ALTER TABLE pods ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public can view active pods" ON pods;
DROP POLICY IF EXISTS "Authenticated users can view all pods" ON pods;
DROP POLICY IF EXISTS "Pod creators can manage their pods" ON pods;

-- Policy 1: Allow public to view active pods
CREATE POLICY "Public can view active pods" 
ON pods 
FOR SELECT 
TO anon
USING (is_active = true);

-- Policy 2: Allow authenticated users to view all pods
CREATE POLICY "Authenticated users can view all pods" 
ON pods 
FOR SELECT 
TO authenticated
USING (true);

-- Policy 3: Allow pod creators to manage their pods
CREATE POLICY "Pod creators can manage their pods" 
ON pods 
FOR ALL 
TO authenticated
USING (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM pod_members 
    WHERE pod_members.pod_id = pods.id 
    AND pod_members.user_id = auth.uid()
    AND pod_members.role = 'leader'
  )
)
WITH CHECK (
  created_by = auth.uid() OR
  EXISTS (
    SELECT 1 FROM pod_members 
    WHERE pod_members.pod_id = pods.id 
    AND pod_members.user_id = auth.uid()
    AND pod_members.role = 'leader'
  )
);

-- Grant permissions for pods table
GRANT SELECT ON pods TO anon;
GRANT ALL ON pods TO authenticated;
GRANT ALL ON pods TO service_role;

-- Since pod_permission_lookup is a VIEW, grant SELECT permissions on it
GRANT SELECT ON pod_permission_lookup TO anon;
GRANT SELECT ON pod_permission_lookup TO authenticated;
GRANT SELECT ON pod_permission_lookup TO service_role;

-- Create indexes for better performance on the base tables
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_pod_id ON pod_role_permissions(pod_id);
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_hat_id ON pod_role_permissions(hat_id);
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_is_active ON pod_role_permissions(is_active);
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_permissions ON pod_role_permissions USING gin(permissions);

CREATE INDEX IF NOT EXISTS idx_pods_created_by ON pods(created_by);
CREATE INDEX IF NOT EXISTS idx_pods_is_active ON pods(is_active);