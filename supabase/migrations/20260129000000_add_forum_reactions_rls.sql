-- Add RLS policies for forum_post_reactions table
-- Allows users to read all reactions and create/delete their own reactions

-- Enable RLS on forum_post_reactions
ALTER TABLE forum_post_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read reactions
CREATE POLICY "Anyone can read forum reactions"
ON forum_post_reactions
FOR SELECT
USING (true);

-- Policy: Users can insert their own reactions
CREATE POLICY "Users can create their own reactions"
ON forum_post_reactions
FOR INSERT
WITH CHECK (
  auth.uid()::text = reactor_address
  OR
  lower(auth.uid()::text) = lower(reactor_address)
);

-- Policy: Users can delete their own reactions
CREATE POLICY "Users can delete their own reactions"
ON forum_post_reactions
FOR DELETE
USING (
  auth.uid()::text = reactor_address
  OR
  lower(auth.uid()::text) = lower(reactor_address)
);
