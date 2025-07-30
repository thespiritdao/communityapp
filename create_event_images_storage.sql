-- Create storage bucket for event images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png']
);

-- Create storage policy to allow authenticated users to upload
CREATE POLICY "Allow authenticated users to upload event images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'event-images');

-- Create storage policy to allow public read access
CREATE POLICY "Allow public read access to event images" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'event-images');

-- Create storage policy to allow users to delete their own uploads
CREATE POLICY "Allow users to delete their own event images" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'event-images');

-- Create storage policy to allow users to update their own uploads
CREATE POLICY "Allow users to update their own event images" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'event-images')
WITH CHECK (bucket_id = 'event-images');