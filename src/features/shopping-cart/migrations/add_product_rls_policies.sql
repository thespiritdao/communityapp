-- =====================================================
-- Marketplace Products RLS Policies for Optimized Access
-- =====================================================
-- This migration adds Row Level Security policies to filter products
-- at the database level based on user tokens and permissions
-- =====================================================

-- Enable RLS on products table if not already enabled
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe to re-run)
DROP POLICY IF EXISTS "Public products are viewable by everyone" ON products;
DROP POLICY IF EXISTS "Authenticated users can view accessible products" ON products;
DROP POLICY IF EXISTS "Product owners can manage their products" ON products;
DROP POLICY IF EXISTS "Executive pod can manage all products" ON products;

-- =====================================================
-- VIEW POLICIES
-- =====================================================

-- Policy 1: Public products (no token requirement) are viewable by everyone
CREATE POLICY "Public products are viewable by everyone"
ON products
FOR SELECT
USING (
  required_token IS NULL 
  OR required_token = ''
);

-- Policy 2: Authenticated users can view products based on their tokens
-- Note: This is a simplified policy. For full token checking, you'd need
-- a user_tokens table or function to check blockchain tokens
CREATE POLICY "Authenticated users can view accessible products"
ON products
FOR SELECT
TO authenticated
USING (
  -- Product has no token requirement
  required_token IS NULL 
  OR required_token = ''
  -- OR user is the owner
  OR owner_id = auth.uid()
  -- OR check token ownership (requires additional setup)
  -- This would need a function to verify token holdings
);

-- =====================================================
-- MANAGEMENT POLICIES  
-- =====================================================

-- Policy 3: Product owners can manage their own products
CREATE POLICY "Product owners can manage their products"
ON products
FOR ALL
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Policy 4: Executive pod members can manage all products
-- This requires a function to check pod membership
CREATE OR REPLACE FUNCTION is_executive_pod_member(user_address text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user has executive pod hat
  -- This would need to query the blockchain or a synced table
  -- For now, return false as placeholder
  RETURN FALSE;
END;
$$;

CREATE POLICY "Executive pod can manage all products"
ON products
FOR ALL
TO authenticated
USING (
  is_executive_pod_member((SELECT address FROM profiles WHERE user_id = auth.uid() LIMIT 1))
);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get user's accessible tokens
-- This would need to be implemented based on your token system
CREATE OR REPLACE FUNCTION get_user_tokens(user_address text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_tokens text[];
BEGIN
  -- Placeholder implementation
  -- In production, this would query blockchain data or a synced tokens table
  user_tokens := ARRAY[]::text[];
  RETURN user_tokens;
END;
$$;

-- Enhanced view policy using token checking
DROP POLICY IF EXISTS "Token-gated products for authenticated users" ON products;

CREATE POLICY "Token-gated products for authenticated users"
ON products
FOR SELECT
TO authenticated
USING (
  -- Public products
  required_token IS NULL 
  OR required_token = ''
  -- User owns the product
  OR owner_id = auth.uid()
  -- User has the required token
  OR required_token = ANY(
    get_user_tokens((SELECT address FROM profiles WHERE user_id = auth.uid() LIMIT 1))
  )
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for token-based filtering
CREATE INDEX IF NOT EXISTS idx_products_required_token ON products(required_token);

-- Index for owner-based queries
CREATE INDEX IF NOT EXISTS idx_products_owner_id ON products(owner_id);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_products_token_owner ON products(required_token, owner_id);

-- =====================================================
-- NOTES FOR IMPLEMENTATION
-- =====================================================
-- To fully implement server-side token gating, you'll need:
-- 1. A user_tokens table that syncs blockchain token holdings
-- 2. A pod_memberships table that tracks Hats Protocol roles
-- 3. Update the helper functions to query these tables
-- 4. Consider using pg_cron to periodically sync token data
-- =====================================================

COMMENT ON POLICY "Public products are viewable by everyone" ON products IS 
'Allows anyone to view products that have no token requirements';

COMMENT ON POLICY "Authenticated users can view accessible products" ON products IS 
'Filters products based on user authentication and token holdings';

COMMENT ON POLICY "Product owners can manage their products" ON products IS 
'Allows product creators to update and delete their own products';

COMMENT ON POLICY "Executive pod can manage all products" ON products IS 
'Grants full marketplace management to executive pod members';