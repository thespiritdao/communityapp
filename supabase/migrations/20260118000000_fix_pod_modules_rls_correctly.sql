-- Fix RLS policies for pod_modules table (CORRECT VERSION)
-- Previous migration 20260113000000 was checking auth.uid() against pod_leads,
-- but pod_leads contains wallet addresses, not user IDs!
-- This migration fixes the policies to check wallet_address from user_profiles

-- Drop the broken policies from previous migration
DROP POLICY IF EXISTS "pod_modules_select_policy" ON pod_modules;
DROP POLICY IF EXISTS "pod_modules_insert_policy" ON pod_modules;
DROP POLICY IF EXISTS "pod_modules_update_policy" ON pod_modules;
DROP POLICY IF EXISTS "pod_modules_delete_policy" ON pod_modules;

-- Also drop policies from consolidated migration to avoid conflicts
DROP POLICY IF EXISTS "Anyone can view pod modules" ON pod_modules;
DROP POLICY IF EXISTS "Pod managers can update modules" ON pod_modules;
DROP POLICY IF EXISTS "Pod managers can create modules" ON pod_modules;

-- Enable RLS on pod_modules table
ALTER TABLE pod_modules ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to read pod_modules
CREATE POLICY "Anyone can view pod modules" ON pod_modules
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow pod managers to insert new pod_modules entries
-- Check if user's wallet_address is in pod_leads OR matches created_by_address
CREATE POLICY "Pod managers can create modules" ON pod_modules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- Allow pod managers to update pod_modules
CREATE POLICY "Pod managers can update modules" ON pod_modules
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- Allow pod managers to delete pod_modules (included for completeness)
CREATE POLICY "Pod managers can delete modules" ON pod_modules
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

-- Grant necessary permissions to authenticated users
GRANT SELECT ON pod_modules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON pod_modules TO authenticated;

-- Add helpful comment
COMMENT ON TABLE pod_modules IS 'Stores module configuration (chat, forum, treasury, etc.) for each pod. RLS enforced: any authenticated user can read, only pod leaders (pod_leads array or created_by_address) can modify.';
