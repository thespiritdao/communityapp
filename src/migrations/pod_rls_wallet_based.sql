-- RLS Policies for Pod Base Tables (Wallet Address Based)
-- This version assumes user_id is a wallet address (text) not UUID

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

-- Policy 1: Allow public/anon to view active pod role permissions
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

-- Policy 3: For now, allow authenticated users to manage permissions
-- In production, you'd check wallet ownership of leader hats
CREATE POLICY "Pod leaders can manage permissions" 
ON pod_role_permissions 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- =============================================================================
-- 3. POD_MEMBERS TABLE RLS (if needed)
-- =============================================================================

-- Only enable if pod_members table exists and is used
-- Comment out if not needed

/*
ALTER TABLE pod_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active pod members" ON pod_members;
DROP POLICY IF EXISTS "Authenticated users can view all pod members" ON pod_members;

CREATE POLICY "Public can view active pod members" 
ON pod_members 
FOR SELECT 
TO anon
USING (is_active = true);

CREATE POLICY "Authenticated users can view all pod members" 
ON pod_members 
FOR SELECT 
TO authenticated
USING (true);

-- For management, we'd need to know how user_id is stored
-- If it's wallet address, we'd need custom logic
CREATE POLICY "Pod members can manage" 
ON pod_members 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);
*/

-- =============================================================================
-- 4. GRANT PERMISSIONS ON VIEWS
-- =============================================================================

-- Grant SELECT permissions on all the views
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