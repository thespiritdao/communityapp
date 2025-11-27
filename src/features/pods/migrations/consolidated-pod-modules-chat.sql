-- Consolidated Migration for Pod Modules and Chat Management
-- This is a clean version that avoids the hats_owned column issue

-- ==============================================
-- PART 1: CHAT GROUPS MANAGEMENT
-- ==============================================

-- Add new columns to chat_groups if they don't exist
ALTER TABLE chat_groups 
ADD COLUMN IF NOT EXISTS pod_id UUID REFERENCES pods(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'both' CHECK (access_level IN ('managers', 'members', 'both')),
ADD COLUMN IF NOT EXISTS created_by_address TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_groups_pod_id ON chat_groups(pod_id);
CREATE INDEX IF NOT EXISTS idx_chat_groups_active ON chat_groups(is_active);

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Pod managers can create chat groups" ON chat_groups;
DROP POLICY IF EXISTS "Pod managers can update their chat groups" ON chat_groups;
DROP POLICY IF EXISTS "Pod managers can delete their chat groups" ON chat_groups;
DROP POLICY IF EXISTS "Users can view active chat groups" ON chat_groups;

-- Create new RLS policies for chat management
-- Note: HAT ownership is verified on-chain in the application layer
CREATE POLICY "Pod managers can create chat groups" ON chat_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = chat_groups.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Pod managers can update their chat groups" ON chat_groups
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = chat_groups.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Pod managers can delete their chat groups" ON chat_groups
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = chat_groups.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Users can view active chat groups" ON chat_groups
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ==============================================
-- PART 2: POD MODULES SYSTEM
-- ==============================================

-- Create pod_modules table if it doesn't exist
CREATE TABLE IF NOT EXISTS pod_modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pod_id UUID REFERENCES pods(id) ON DELETE CASCADE UNIQUE,
  
  -- Module flags
  chat_enabled BOOLEAN DEFAULT false,
  forum_enabled BOOLEAN DEFAULT false,
  treasury_enabled BOOLEAN DEFAULT true,
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

-- Create or replace trigger to update timestamp
CREATE OR REPLACE FUNCTION update_pod_modules_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_pod_modules_timestamp ON pod_modules;
CREATE TRIGGER update_pod_modules_timestamp
  BEFORE UPDATE ON pod_modules
  FOR EACH ROW
  EXECUTE FUNCTION update_pod_modules_timestamp();

-- Enable RLS
ALTER TABLE pod_modules ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view pod modules" ON pod_modules;
DROP POLICY IF EXISTS "Pod managers can update modules" ON pod_modules;
DROP POLICY IF EXISTS "Pod managers can create modules" ON pod_modules;

-- Create RLS policies
CREATE POLICY "Anyone can view pod modules" ON pod_modules
  FOR SELECT
  TO authenticated
  USING (true);

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

-- ==============================================
-- PART 3: DATA INITIALIZATION
-- ==============================================

-- Initialize modules for existing pods (only if not already exists)
INSERT INTO pod_modules (pod_id, treasury_enabled)
SELECT id, true FROM pods
WHERE NOT EXISTS (
  SELECT 1 FROM pod_modules WHERE pod_modules.pod_id = pods.id
)
ON CONFLICT (pod_id) DO NOTHING;

-- Enable all features for Executive Pod
UPDATE pod_modules 
SET 
  chat_enabled = true,
  forum_enabled = true,
  events_enabled = true,
  bounties_enabled = true,
  treasury_enabled = true
WHERE pod_id IN (
  SELECT id FROM pods WHERE name = 'Executive Pod'
);

-- ==============================================
-- VERIFICATION QUERIES (optional - to check results)
-- ==============================================

-- Check if migration was successful
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Chat groups table columns: %', 
    (SELECT string_agg(column_name, ', ') 
     FROM information_schema.columns 
     WHERE table_name = 'chat_groups' 
     AND column_name IN ('pod_id', 'is_active', 'access_level', 'created_by_address'));
  
  RAISE NOTICE 'Pod modules table exists: %', 
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'pod_modules');
    
  RAISE NOTICE 'Executive Pod modules enabled: %',
    (SELECT row_to_json(pm.*) FROM pod_modules pm 
     JOIN pods p ON p.id = pm.pod_id 
     WHERE p.name = 'Executive Pod' LIMIT 1);
END $$;