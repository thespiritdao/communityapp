-- RLS Policies for Pod Base Tables (Fixed Type Casting)
-- Apply RLS to the actual base tables that support the pod_permission_lookup view

-- =============================================================================
-- 1. PODS TABLE RLS
-- =============================================================================

ALTER TABLE pods ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public can view active pods" ON pods;
DROP POLICY IF EXISTS "Authenticated users can view all pods" ON pods;

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

-- =============================================================================
-- 2. POD_ROLE_PERMISSIONS TABLE RLS
-- =============================================================================

ALTER TABLE pod_role_permissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public can view active pod role permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Authenticated users can view all pod role permissions" ON pod_role_permissions;
DROP POLICY IF EXISTS "Pod leaders can manage permissions" ON pod_role_permissions;

-- Policy 1: Allow public/anon to view active pod role permissions (needed for marketplace access checks)
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

-- Policy 3: Allow pod leaders/admins to manage permissions for their pods
CREATE POLICY "Pod leaders can manage permissions" 
ON pod_role_permissions 
FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM pod_members 
    WHERE pod_members.pod_id = pod_role_permissions.pod_id 
    AND pod_members.user_id = auth.uid()::uuid
    AND pod_members.role IN ('leader', 'admin')
    AND pod_members.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM pod_members 
    WHERE pod_members.pod_id = pod_role_permissions.pod_id 
    AND pod_members.user_id = auth.uid()::uuid
    AND pod_members.role IN ('leader', 'admin')
    AND pod_members.is_active = true
  )
);

-- =============================================================================
-- 3. POD_MEMBERS TABLE RLS
-- =============================================================================

ALTER TABLE pod_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public can view active pod members" ON pod_members;
DROP POLICY IF EXISTS "Authenticated users can view all pod members" ON pod_members;
DROP POLICY IF EXISTS "Pod leaders can manage members" ON pod_members;
DROP POLICY IF EXISTS "Users can view their own membership" ON pod_members;

-- Policy 1: Allow public to view active pod members (basic info)
CREATE POLICY "Public can view active pod members" 
ON pod_members 
FOR SELECT 
TO anon
USING (is_active = true);

-- Policy 2: Allow authenticated users to view all pod members
CREATE POLICY "Authenticated users can view all pod members" 
ON pod_members 
FOR SELECT 
TO authenticated
USING (true);

-- Policy 3: Allow users to view/manage their own membership
CREATE POLICY "Users can view their own membership" 
ON pod_members 
FOR ALL 
TO authenticated
USING (user_id = auth.uid()::uuid)
WITH CHECK (user_id = auth.uid()::uuid);

-- Policy 4: Allow pod leaders to manage members in their pods
CREATE POLICY "Pod leaders can manage members" 
ON pod_members 
FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM pod_members pm 
    WHERE pm.pod_id = pod_members.pod_id 
    AND pm.user_id = auth.uid()::uuid
    AND pm.role IN ('leader', 'admin')
    AND pm.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM pod_members pm 
    WHERE pm.pod_id = pod_members.pod_id 
    AND pm.user_id = auth.uid()::uuid
    AND pm.role IN ('leader', 'admin')
    AND pm.is_active = true
  )
);

-- =============================================================================
-- 4. GRANT PERMISSIONS ON VIEWS
-- =============================================================================

-- Grant SELECT permissions on all the views (they inherit security from base tables)
GRANT SELECT ON pod_permission_lookup TO anon;
GRANT SELECT ON pod_permission_lookup TO authenticated;
GRANT SELECT ON pod_permission_lookup TO service_role;

GRANT SELECT ON pod_role_permissions_active TO anon;
GRANT SELECT ON pod_role_permissions_active TO authenticated;
GRANT SELECT ON pod_role_permissions_active TO service_role;

GRANT SELECT ON active_pod_members TO anon;
GRANT SELECT ON active_pod_members TO authenticated;
GRANT SELECT ON active_pod_members TO service_role;

GRANT SELECT ON pod_member_counts TO anon;
GRANT SELECT ON pod_member_counts TO authenticated;
GRANT SELECT ON pod_member_counts TO service_role;

GRANT SELECT ON pod_role_forum_access TO anon;
GRANT SELECT ON pod_role_forum_access TO authenticated;
GRANT SELECT ON pod_role_forum_access TO service_role;

-- =============================================================================
-- 5. GRANT PERMISSIONS ON BASE TABLES
-- =============================================================================

-- Grant permissions on base tables
GRANT SELECT ON pods TO anon;
GRANT ALL ON pods TO authenticated;
GRANT ALL ON pods TO service_role;

GRANT SELECT ON pod_role_permissions TO anon;
GRANT ALL ON pod_role_permissions TO authenticated;
GRANT ALL ON pod_role_permissions TO service_role;

GRANT SELECT ON pod_members TO anon;
GRANT ALL ON pod_members TO authenticated;
GRANT ALL ON pod_members TO service_role;

GRANT ALL ON pod_accountability_signatures TO authenticated;
GRANT ALL ON pod_accountability_signatures TO service_role;

GRANT ALL ON pod_role_permissions_history TO authenticated;
GRANT ALL ON pod_role_permissions_history TO service_role;

-- =============================================================================
-- 6. CREATE PERFORMANCE INDEXES
-- =============================================================================

-- Indexes for pods table
CREATE INDEX IF NOT EXISTS idx_pods_is_active ON pods(is_active);
CREATE INDEX IF NOT EXISTS idx_pods_name ON pods(name);

-- Indexes for pod_role_permissions table
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_pod_id ON pod_role_permissions(pod_id);
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_hat_id ON pod_role_permissions(hat_id);
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_is_active ON pod_role_permissions(is_active);
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_permissions ON pod_role_permissions USING gin(permissions);

-- Indexes for pod_members table
CREATE INDEX IF NOT EXISTS idx_pod_members_pod_id ON pod_members(pod_id);
CREATE INDEX IF NOT EXISTS idx_pod_members_user_id ON pod_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pod_members_role ON pod_members(role);
CREATE INDEX IF NOT EXISTS idx_pod_members_is_active ON pod_members(is_active);
CREATE INDEX IF NOT EXISTS idx_pod_members_pod_user ON pod_members(pod_id, user_id);