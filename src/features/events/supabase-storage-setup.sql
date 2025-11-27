-- Create the event-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true);

-- Set up RLS policies for the event-images bucket

-- Policy to allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload event images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'event-images' 
    AND auth.role() = 'authenticated'
  );

-- Policy to allow public read access to event images
CREATE POLICY "Anyone can view event images" ON storage.objects
  FOR SELECT USING (bucket_id = 'event-images');

-- Policy to allow users to update/delete their own uploaded images
CREATE POLICY "Users can update their event images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'event-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their event images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'event-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Alternative policy based on event ownership (if preferred)
-- This would require storing event metadata in the file path
-- CREATE POLICY "Event owners can manage event images" ON storage.objects
--   FOR ALL USING (
--     bucket_id = 'event-images' 
--     AND EXISTS (
--       SELECT 1 FROM events 
--       WHERE events.id = (storage.foldername(name))[1]
--       AND events.user_id = auth.uid()
--     )
--   );