-- Fix RLS policies for pod_modules table
-- This migration adds Row-Level Security policies to allow pod managers to read and modify pod modules

-- Drop existing policies if any
DROP POLICY IF EXISTS "pod_modules_select_policy" ON pod_modules;
DROP POLICY IF EXISTS "pod_modules_insert_policy" ON pod_modules;
DROP POLICY IF EXISTS "pod_modules_update_policy" ON pod_modules;
DROP POLICY IF EXISTS "pod_modules_delete_policy" ON pod_modules;

-- Enable RLS on pod_modules table
ALTER TABLE pod_modules ENABLE ROW LEVEL SECURITY;

-- Allow users to read pod_modules for any pod they have access to
-- (This is generous - any authenticated user can see module configuration)
CREATE POLICY "pod_modules_select_policy" ON pod_modules
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
  );

-- Allow pod managers to insert new pod_modules entries
-- A user can insert if they are in the pod's pod_leads array
CREATE POLICY "pod_modules_insert_policy" ON pod_modules
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND auth.uid()::text = ANY(pods.pod_leads)
    )
  );

-- Allow pod managers to update pod_modules
-- A user can update if they are in the pod's pod_leads array
CREATE POLICY "pod_modules_update_policy" ON pod_modules
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND auth.uid()::text = ANY(pods.pod_leads)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND auth.uid()::text = ANY(pods.pod_leads)
    )
  );

-- Allow pod managers to delete pod_modules (unlikely to be needed, but included for completeness)
CREATE POLICY "pod_modules_delete_policy" ON pod_modules
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = pod_modules.pod_id
      AND auth.uid()::text = ANY(pods.pod_leads)
    )
  );

-- Grant necessary permissions to authenticated users
GRANT SELECT ON pod_modules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON pod_modules TO authenticated;

-- Add helpful comment
COMMENT ON TABLE pod_modules IS 'Stores module configuration (chat, forum, treasury, etc.) for each pod. RLS enforced: any authenticated user can read, only pod leaders can modify.';
