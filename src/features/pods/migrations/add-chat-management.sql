-- Add pod chat management fields to chat_groups table

-- Add new columns if they don't exist
ALTER TABLE chat_groups 
ADD COLUMN IF NOT EXISTS pod_id UUID REFERENCES pods(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'both' CHECK (access_level IN ('managers', 'members', 'both')),
ADD COLUMN IF NOT EXISTS created_by_address TEXT;

-- Create index for pod_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_chat_groups_pod_id ON chat_groups(pod_id);

-- Create index for active chats
CREATE INDEX IF NOT EXISTS idx_chat_groups_active ON chat_groups(is_active);

-- Update RLS policies for chat group management
-- Note: Hat ownership is checked on-chain in the application layer
CREATE POLICY "Pod managers can create chat groups" ON chat_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = chat_groups.pod_id
      AND (
        -- Check if user is a pod lead
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads) OR
        -- Check if user created the pod
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

-- Everyone can view active chat groups
CREATE POLICY "Users can view active chat groups" ON chat_groups
  FOR SELECT
  TO authenticated
  USING (is_active = true);