-- RLS Policies for pod_permission_lookup table
-- This table stores pod role permissions and should be readable by all authenticated users
-- but only writable by pod leaders/admins

-- Enable RLS on pod_permission_lookup
ALTER TABLE pod_permission_lookup ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public can view active pod permissions" ON pod_permission_lookup;
DROP POLICY IF EXISTS "Authenticated users can view all pod permissions" ON pod_permission_lookup;
DROP POLICY IF EXISTS "Pod leaders can update permissions" ON pod_permission_lookup;
DROP POLICY IF EXISTS "System can insert new permissions" ON pod_permission_lookup;

-- Policy 1: Allow public to view active pod permissions (for checking access)
CREATE POLICY "Public can view active pod permissions" 
ON pod_permission_lookup 
FOR SELECT 
TO public
USING (is_active = true);

-- Policy 2: Allow authenticated users to view all pod permissions
CREATE POLICY "Authenticated users can view all pod permissions" 
ON pod_permission_lookup 
FOR SELECT 
TO authenticated
USING (true);

-- Policy 3: Allow pod leaders to update permissions for their pods
-- Note: This requires checking if the user has the leader hat for the pod
-- Since we can't directly check blockchain state in RLS, this would need
-- to be handled at the application level or through a stored procedure
CREATE POLICY "Pod leaders can update permissions" 
ON pod_permission_lookup 
FOR UPDATE 
TO authenticated
USING (
  -- Check if user is in the pod_members table as a leader
  EXISTS (
    SELECT 1 FROM pod_members 
    WHERE pod_members.pod_id = pod_permission_lookup.pod_id 
    AND pod_members.user_id = auth.uid()
    AND pod_members.role = 'leader'
  )
);

-- Policy 4: Allow system/service role to insert new permissions
-- This is used when creating new pods or roles
CREATE POLICY "System can insert new permissions" 
ON pod_permission_lookup 
FOR INSERT 
TO authenticated
WITH CHECK (
  -- Only allow inserts if the user is creating a pod
  -- This would typically be handled by your pod creation service
  EXISTS (
    SELECT 1 FROM pods 
    WHERE pods.id = pod_permission_lookup.pod_id 
    AND pods.created_by = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pod_permission_lookup_pod_id ON pod_permission_lookup(pod_id);
CREATE INDEX IF NOT EXISTS idx_pod_permission_lookup_hat_id ON pod_permission_lookup(hat_id);
CREATE INDEX IF NOT EXISTS idx_pod_permission_lookup_is_active ON pod_permission_lookup(is_active);
CREATE INDEX IF NOT EXISTS idx_pod_permission_lookup_permissions ON pod_permission_lookup USING gin(permissions);

-- Grant appropriate permissions
GRANT SELECT ON pod_permission_lookup TO anon;
GRANT ALL ON pod_permission_lookup TO authenticated;
GRANT ALL ON pod_permission_lookup TO service_role;