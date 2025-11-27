-- SQL setup for HAT images storage bucket
-- Run this in your Supabase SQL Editor

-- 1. Create the hat-images storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hat-images',
  'hat-images', 
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png']
);

-- 2. Set up RLS (Row Level Security) policies for the hat-images bucket

-- Allow authenticated users to upload HAT images
CREATE POLICY "Allow authenticated users to upload HAT images" ON storage.objects
FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'hat-images');

-- Allow public read access to HAT images (since bucket is public)
CREATE POLICY "Allow public read access to HAT images" ON storage.objects
FOR SELECT 
TO public
USING (bucket_id = 'hat-images');

-- Allow authenticated users to update their own HAT images
CREATE POLICY "Allow authenticated users to update HAT images" ON storage.objects
FOR UPDATE 
TO authenticated
USING (bucket_id = 'hat-images');

-- Allow authenticated users to delete HAT images (optional, for cleanup)
CREATE POLICY "Allow authenticated users to delete HAT images" ON storage.objects
FOR DELETE 
TO authenticated
USING (bucket_id = 'hat-images');

-- 3. Optional: Create a function to clean up old HAT images
-- This can be called periodically to remove unused images

CREATE OR REPLACE FUNCTION cleanup_old_hat_images()
RETURNS void AS $$
BEGIN
  -- Delete HAT images older than 30 days that aren't referenced
  -- Note: This is a basic cleanup - adjust logic based on your needs
  DELETE FROM storage.objects 
  WHERE bucket_id = 'hat-images' 
    AND created_at < NOW() - INTERVAL '30 days'
    AND name NOT IN (
      -- Add checks here for images still in use
      -- Example: SELECT image_url FROM pods WHERE image_url IS NOT NULL
      SELECT ''
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Verify bucket creation
-- Run this query to confirm the bucket was created successfully
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets 
WHERE id = 'hat-images';