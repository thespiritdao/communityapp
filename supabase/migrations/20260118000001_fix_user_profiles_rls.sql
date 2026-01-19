-- Fix user_profiles RLS to allow RLS policies to read wallet_address
-- This is required for pod_modules and chat_groups RLS policies to work

-- Drop existing policies that might be blocking
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON user_profiles;
DROP POLICY IF EXISTS "Users can read all profiles" ON user_profiles;

-- Enable RLS on user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read ALL user_profiles
-- This is necessary because RLS policies on other tables need to look up wallet_address
-- The lookup happens in the context of the authenticated user, so they need SELECT access
CREATE POLICY "Authenticated users can read all profiles" ON user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Grant necessary permissions
GRANT SELECT ON user_profiles TO authenticated;
GRANT INSERT, UPDATE ON user_profiles TO authenticated;

COMMENT ON POLICY "Authenticated users can read all profiles" ON user_profiles IS
  'Allows RLS policies on other tables to look up wallet_address. Without this, pod_modules and chat_groups RLS policies will fail.';
