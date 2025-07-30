-- Fix storage policies for event-images bucket

-- First, drop any existing policies that might conflict
DROP POLICY IF EXISTS "Allow authenticated users to upload event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their own event images" ON storage.objects;

-- Create or update the storage bucket for event images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow authenticated users to insert (upload) objects
CREATE POLICY "Allow authenticated uploads to event images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'event-images');

-- Allow public read access to objects
CREATE POLICY "Allow public read of event images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'event-images');

-- Allow authenticated users to update their own uploads
CREATE POLICY "Allow authenticated updates to event images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'event-images')
WITH CHECK (bucket_id = 'event-images');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Allow authenticated deletes of event images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'event-images');

-- Alternative: If you want to allow all authenticated users regardless of ownership
-- You can uncomment these and comment out the above policies

-- CREATE POLICY "Allow all authenticated users full access to event images"
-- ON storage.objects FOR ALL TO authenticated
-- USING (bucket_id = 'event-images')
-- WITH CHECK (bucket_id = 'event-images');