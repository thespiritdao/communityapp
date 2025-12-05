-- Fix RLS policies for events table to allow users to read their own events
-- Run this in your Supabase SQL editor

-- Drop existing SELECT policies if they exist
DROP POLICY IF EXISTS "Users can read their own events" ON events;
DROP POLICY IF EXISTS "Users can read events they created" ON events;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON events;

-- Create a comprehensive SELECT policy that allows users to read:
-- 1. Events they created (user_id matches)
-- 2. Published events (status = 'published')
CREATE POLICY "Users can read own and published events"
ON events
FOR SELECT
TO authenticated
USING (
  -- User can read their own events
  auth.uid() = user_id
  OR
  -- Anyone can read published events
  status = 'published'
);

-- Verify INSERT policy exists and allows authenticated users
-- This should already exist but let's verify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events'
    AND policyname = 'Users can create events'
  ) THEN
    CREATE POLICY "Users can create events"
    ON events
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Also ensure UPDATE and DELETE policies exist
DROP POLICY IF EXISTS "Users can update own events" ON events;
CREATE POLICY "Users can update own events"
ON events
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own events" ON events;
CREATE POLICY "Users can delete own events"
ON events
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Verify RLS is enabled on events table
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Show all policies on events table for verification
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'events'
ORDER BY policyname;
