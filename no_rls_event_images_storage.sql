-- Create event-images storage bucket without RLS (for testing)

-- Create or update the storage bucket for event images (no RLS)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,  -- Public bucket
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Disable RLS on storage.objects for this bucket (for testing purposes only)
-- Note: This is less secure but will allow uploads without authentication issues

-- Remove all existing policies for this bucket
DROP POLICY IF EXISTS "Allow authenticated users to upload event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their own event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read of event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes of event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users full access to event images" ON storage.objects;

-- Temporarily disable RLS for testing (SECURITY WARNING: This disables all security)
-- Only use this for debugging/testing purposes
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS but with a permissive policy
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create a very permissive policy for the event-images bucket
CREATE POLICY "Allow all access to event images bucket"
ON storage.objects FOR ALL 
USING (bucket_id = 'event-images')
WITH CHECK (bucket_id = 'event-images');