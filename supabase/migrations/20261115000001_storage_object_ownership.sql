-- Storage: only the uploader may overwrite, move or delete a file.
--
-- Before this migration:
--   * event-images and product_images had "for all to public" policies with
--     no condition, so anyone holding the public anon key, signed in or not,
--     could upload, overwrite or delete files in them.
--   * In attachments, profile_images, hat-images, pod-images, product_images,
--     event-images and the knowledge buckets, any signed-in member could
--     overwrite or delete any other member's file.
--   * The forum-attachments delete rule allowed anyone to delete as soon as
--     any role anywhere carried forumModeration; it never looked at the caller.
--
-- Every client upload in the app writes a new, timestamped path, so no flow
-- relies on changing someone else's object. Moderation and clean-up that has
-- to touch other people's files runs server-side with the service role,
-- which these policies do not affect. Public read access is unchanged.
--
-- storage.objects.owner_id is set by the Storage API from the uploader's JWT.
-- Idempotent: safe on a database built from supabase/baseline/.

begin;

-- 1. Remove the unconditioned and caller-blind policies.
drop policy if exists "Allow all operations on event images" on storage.objects;
drop policy if exists "Full access to product_images bucket" on storage.objects;
drop policy if exists "Allow users to delete their own event images" on storage.objects;
drop policy if exists "Allow users to update their own event images" on storage.objects;
drop policy if exists "Allow authenticated users to delete product images" on storage.objects;
drop policy if exists "Allow authenticated users to update product images" on storage.objects;
drop policy if exists "Allow authenticated users to delete HAT images" on storage.objects;
drop policy if exists "Allow authenticated users to update HAT images" on storage.objects;
drop policy if exists "Authenticated users can delete pod images" on storage.objects;
drop policy if exists "Authenticated users can update pod images" on storage.objects;
drop policy if exists "Allow authenticated deletes for attachments" on storage.objects;
drop policy if exists "Allow authenticated updates to attachments" on storage.objects;
drop policy if exists "allow authenticated deletes" on storage.objects;
drop policy if exists "allow insert to authenticated users-update" on storage.objects;
drop policy if exists "Creators can delete their own files" on storage.objects;
drop policy if exists "Uploaders or moderators can delete attachments" on storage.objects;

-- 2. Uploads: signed-in members only (product_images had no insert policy of
--    its own; it relied on the public "for all" rule).
drop policy if exists "Members can upload product images" on storage.objects;
create policy "Members can upload product images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product_images');

-- 3. Overwrite / move / delete: the uploader only.
drop policy if exists "Uploaders can update their own files" on storage.objects;
create policy "Uploaders can update their own files" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('event-images', 'product_images', 'hat-images', 'pod-images',
                  'attachments', 'profile_images', 'knowledge-videos', 'knowledge-documents')
    and owner_id = (select auth.uid())::text
  )
  with check (owner_id = (select auth.uid())::text);

drop policy if exists "Uploaders can delete their own files" on storage.objects;
create policy "Uploaders can delete their own files" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('event-images', 'product_images', 'hat-images', 'pod-images',
                  'attachments', 'profile_images', 'knowledge-videos', 'knowledge-documents',
                  'forum-attachments')
    and owner_id = (select auth.uid())::text
  );

commit;
