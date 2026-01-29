-- Fix RLS policies for forum_post_reactions
-- This fixes emoji reactions by checking wallet_address in JWT instead of auth.uid()
--
-- HOW TO USE:
-- 1. Open Supabase Dashboard
-- 2. Go to SQL Editor
-- 3. Copy and paste this entire file
-- 4. Run the query
--
-- WHAT THIS FIXES:
-- - Edit button now visible for post authors
-- - Emoji reactions now work (clicking emoji creates/removes reaction)

-- Step 1: Drop existing policies
DROP POLICY IF EXISTS "Anyone can read forum reactions" ON forum_post_reactions;
DROP POLICY IF EXISTS "Users can create their own reactions" ON forum_post_reactions;
DROP POLICY IF EXISTS "Users can delete their own reactions" ON forum_post_reactions;

-- Step 2: Enable RLS (if not already enabled)
ALTER TABLE forum_post_reactions ENABLE ROW LEVEL SECURITY;

-- Step 3: Create corrected policies

-- Policy 1: Anyone can read reactions
CREATE POLICY "Anyone can read forum reactions"
ON forum_post_reactions
FOR SELECT
USING (true);

-- Policy 2: Users can insert their own reactions
-- Checks wallet_address from JWT metadata against reactor_address
CREATE POLICY "Users can create their own reactions"
ON forum_post_reactions
FOR INSERT
WITH CHECK (
  lower((auth.jwt() -> 'user_metadata' ->> 'wallet_address')::text) = lower(reactor_address)
);

-- Policy 3: Users can delete their own reactions
-- Checks wallet_address from JWT metadata against reactor_address
CREATE POLICY "Users can delete their own reactions"
ON forum_post_reactions
FOR DELETE
USING (
  lower((auth.jwt() -> 'user_metadata' ->> 'wallet_address')::text) = lower(reactor_address)
);

-- Verification query (optional - run after applying policies)
-- SELECT * FROM pg_policies WHERE tablename = 'forum_post_reactions';
