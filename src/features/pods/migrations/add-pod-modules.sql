-- Pod Modules System
-- Allows pods to enable/disable features as needed

-- Create pod_modules table
CREATE TABLE IF NOT EXISTS pod_modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pod_id UUID REFERENCES pods(id) ON DELETE CASCADE UNIQUE,
  
  -- Module flags
  chat_enabled BOOLEAN DEFAULT false,
  forum_enabled BOOLEAN DEFAULT false,
  treasury_enabled BOOLEAN DEFAULT true, -- Most pods want treasury
  events_enabled BOOLEAN DEFAULT false,
  bounties_enabled BOOLEAN DEFAULT false,
  
  -- Module configurations (JSON for flexibility)
  chat_config JSONB DEFAULT '{}',
  forum_config JSONB DEFAULT '{}',
  treasury_config JSONB DEFAULT '{}',
  events_config JSONB DEFAULT '{}',
  bounties_config JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for pod lookups
CREATE INDEX IF NOT EXISTS idx_pod_modules_pod_id ON pod_modules(pod_id);

-- Create trigger to update timestamp
CREATE OR REPLACE FUNCTION update_pod_modules_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pod_modules_timestamp
  BEFORE UPDATE ON pod_modules
  FOR EACH ROW
  EXECUTE FUNCTION update_pod_modules_timestamp();

-- RLS Policies
ALTER TABLE pod_modules ENABLE ROW LEVEL SECURITY;

-- Everyone can view pod modules (to know what features are available)
CREATE POLICY "Anyone can view pod modules" ON pod_modules
  FOR SELECT
  TO authenticated
  USING (true);

-- Pod managers can update their pod's modules
-- Note: Hat ownership verification happens on-chain in the application
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

-- Pod managers can insert modules for their pod
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

-- Initialize modules for existing pods
INSERT INTO pod_modules (pod_id, treasury_enabled)
SELECT id, true FROM pods
WHERE NOT EXISTS (
  SELECT 1 FROM pod_modules WHERE pod_modules.pod_id = pods.id
);

-- Set Executive Pod to have all features enabled
UPDATE pod_modules 
SET 
  chat_enabled = true,
  forum_enabled = true,
  events_enabled = true,
  bounties_enabled = true
WHERE pod_id IN (
  SELECT id FROM pods WHERE name = 'Executive Pod'
);