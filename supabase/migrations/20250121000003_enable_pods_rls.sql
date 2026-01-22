-- Enable RLS on pods table and add comprehensive policies
-- This was previously disabled, which allowed unrestricted access

-- Enable RLS
ALTER TABLE pods ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone can read active pods
CREATE POLICY "Anyone can read active pods"
  ON pods
  FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

-- Policy 2: Pod leaders can update their pods
CREATE POLICY "Pod leaders can update their pods"
  ON pods
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt() ->> 'wallet_address' = ANY(pod_leads)
  );

-- Policy 3: Authenticated users can create pods
-- (Will be validated by application logic for governance approval)
CREATE POLICY "Authenticated users can create pods"
  ON pods
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy 4: Pod leaders can delete/deactivate their pods
CREATE POLICY "Pod leaders can delete their pods"
  ON pods
  FOR DELETE
  TO authenticated
  USING (
    auth.jwt() ->> 'wallet_address' = ANY(pod_leads)
  );

-- Policy 5: Service role has full access (for migrations, scripts, etc.)
CREATE POLICY "Service role full access to pods"
  ON pods
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE pods IS 'RLS enabled - Policies restrict access based on pod membership and leadership';
