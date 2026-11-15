-- Chat attachments: stop members listing every attachment in the bucket.
--
-- "Allow authenticated reads from attachments" let any signed-in member list
-- (and so find) every file in the attachments bucket, which holds direct-
-- message uploads. The app never lists this bucket: it stores each file's
-- public URL in the message. Listing is now limited to the uploader's own
-- files.
--
-- Remaining gap, tracked separately: the bucket is public, so anyone holding
-- a file URL can fetch it. Making it private needs signed URLs at render time.

begin;

drop policy if exists "Allow authenticated reads from attachments" on storage.objects;
drop policy if exists "Uploaders can list their own attachments" on storage.objects;
create policy "Uploaders can list their own attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and owner_id = (select auth.uid())::text);

commit;
