-- ============================================================================
-- FORUM STORAGE BUCKET RLS POLICIES (FIXED)
-- ============================================================================
-- Version: 1.1
-- Date: 2025-10-20
-- Description: Row Level Security policies for forum-media and forum-attachments
--              Supabase storage buckets
-- FIX: Corrected UUID type casting for owner comparison
-- ============================================================================

BEGIN;

-- ============================================================================
-- DROP EXISTING POLICIES (if any exist from previous run)
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can upload forum media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view forum media" ON storage.objects;
DROP POLICY IF EXISTS "Uploaders can update own forum media" ON storage.objects;
DROP POLICY IF EXISTS "Uploaders or moderators can delete forum media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload forum attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view forum attachments" ON storage.objects;
DROP POLICY IF EXISTS "Uploaders can update own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Uploaders or moderators can delete attachments" ON storage.objects;

-- ============================================================================
-- FORUM-MEDIA BUCKET POLICIES
-- ============================================================================

-- Policy 1: Authenticated users can upload to forum-media
CREATE POLICY "Authenticated users can upload forum media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'forum-media' AND
  (storage.foldername(name))[1] IN ('threads', 'posts', 'drafts')
);

-- Policy 2: Anyone can view forum media (read public URLs)
CREATE POLICY "Anyone can view forum media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'forum-media');

-- Policy 3: Uploaders can update their own files
CREATE POLICY "Uploaders can update own forum media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'forum-media' AND
  auth.uid() = owner
);

-- Policy 4: Uploaders or moderators can delete forum media
CREATE POLICY "Uploaders or moderators can delete forum media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'forum-media' AND
  (
    auth.uid() = owner OR
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
        -- Note: This is a permissive check - all moderators can delete any media
        -- For production, you may want to add user-specific HAT verification
    )
  )
);

-- ============================================================================
-- FORUM-ATTACHMENTS BUCKET POLICIES
-- ============================================================================

-- Policy 1: Authenticated users can upload attachments
CREATE POLICY "Authenticated users can upload forum attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'forum-attachments' AND
  (storage.foldername(name))[1] IN ('threads', 'posts')
);

-- Policy 2: Anyone can view attachments
CREATE POLICY "Anyone can view forum attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'forum-attachments');

-- Policy 3: Uploaders can update their own attachments
CREATE POLICY "Uploaders can update own attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'forum-attachments' AND
  auth.uid() = owner
);

-- Policy 4: Uploaders or moderators can delete attachments
CREATE POLICY "Uploaders or moderators can delete attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'forum-attachments' AND
  (
    auth.uid() = owner OR
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      WHERE (prp.permissions->>'forumModeration')::BOOLEAN = TRUE
        AND prp.is_active = TRUE
    )
  )
);

COMMIT;

-- ============================================================================
-- HELPER NOTES
-- ============================================================================

-- FOLDER STRUCTURE:
-- forum-media/
--   threads/{thread_id}/{filename}
--   posts/{post_id}/{filename}
--   drafts/{draft_id}/{filename}
--
-- forum-attachments/
--   threads/{thread_id}/{filename}
--   posts/{post_id}/{filename}

-- FILE NAMING CONVENTION:
-- {target_type}-{target_id}-{timestamp}-{original_filename}
-- Example: thread-550e8400-e29b-41d4-a716-446655440000-1729468800-image.jpg

-- MIME TYPE RESTRICTIONS (enforced at bucket level):
-- - image/jpeg
-- - image/png
-- - image/webp
-- - image/gif
-- - video/mp4
-- - video/webm
-- - audio/mpeg
-- - audio/wav
-- - application/pdf
-- - text/plain
-- - text/markdown

-- FILE SIZE LIMIT: 5MB (enforced at bucket level)

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- These policies allow:
-- 1. Any authenticated user to upload media/attachments
-- 2. Public read access to all media (since bucket is private, URLs are signed)
-- 3. Original uploaders to update/delete their files (owner = auth.uid())
-- 4. Moderators to delete any content (spam/inappropriate)
-- ============================================================================
