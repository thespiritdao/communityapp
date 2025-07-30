-- Create event-images storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png']
);

-- Create simple policy for all operations
CREATE POLICY "Allow all operations on event images"
ON storage.objects FOR ALL
USING (bucket_id = 'event-images')
WITH CHECK (bucket_id = 'event-images');