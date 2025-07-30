-- Simple storage policies for event-images bucket (less restrictive)

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to upload event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their own event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read of event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to event images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes of event images" ON storage.objects;

-- Create/update bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png'];

-- Single policy for all authenticated operations
CREATE POLICY "Allow authenticated users full access to event images"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'event-images')
WITH CHECK (bucket_id = 'event-images');

-- Public read policy
CREATE POLICY "Allow public read access to event images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'event-images');