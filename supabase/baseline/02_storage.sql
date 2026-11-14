-- Baseline step 2: storage buckets and their access policies.
-- Run after 01_schema.sql.


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', true, 5242880, NULL)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 5242880, array['image/jpeg', 'image/jpg', 'image/png'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('forum-attachments', 'forum-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'application/pdf', 'text/plain', 'text/markdown'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('forum-media', 'forum-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'application/pdf', 'text/plain', 'text/markdown'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hat-images', 'hat-images', true, 5242880, array['image/jpeg', 'image/jpg', 'image/png'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge-documents', 'knowledge-documents', true, NULL, NULL)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge-videos', 'knowledge-videos', true, NULL, NULL)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('place-images', 'place-images', false, 5242880, array['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pod-faces', 'pod-faces', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pod-images', 'pod-images', true, 2097152, array['image/jpeg', 'image/jpg', 'image/png'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product_images', 'product_images', true, 2097152, NULL)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile_images', 'profile_images', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('static', 'static', false, NULL, NULL)
on conflict (id) do nothing;

drop policy if exists "Allow Authenticated Users" on storage.objects;
create policy "Allow Authenticated Users" on storage.objects
  as permissive for select to public
  using (((auth.role() = 'authenticated'::text) AND (bucket_id = 'profile_images'::text)));

drop policy if exists "Allow all operations on event images" on storage.objects;
create policy "Allow all operations on event images" on storage.objects
  as permissive for all to public
  using ((bucket_id = 'event-images'::text))
  with check ((bucket_id = 'event-images'::text));

drop policy if exists "Allow authenticated deletes for attachments" on storage.objects;
create policy "Allow authenticated deletes for attachments" on storage.objects
  as permissive for delete to public
  using (((auth.uid() IS NOT NULL) AND (bucket_id = 'attachments'::text)));

drop policy if exists "Allow authenticated reads from attachments" on storage.objects;
create policy "Allow authenticated reads from attachments" on storage.objects
  as permissive for select to public
  using (((auth.uid() IS NOT NULL) AND (bucket_id = 'attachments'::text)));

drop policy if exists "Allow authenticated updates to attachments" on storage.objects;
create policy "Allow authenticated updates to attachments" on storage.objects
  as permissive for update to public
  using (((auth.uid() IS NOT NULL) AND (bucket_id = 'attachments'::text)));

drop policy if exists "Allow authenticated uploads to attachments" on storage.objects;
create policy "Allow authenticated uploads to attachments" on storage.objects
  as permissive for insert to public
  with check (((auth.uid() IS NOT NULL) AND (bucket_id = 'attachments'::text)));

drop policy if exists "Allow authenticated users to delete HAT images" on storage.objects;
create policy "Allow authenticated users to delete HAT images" on storage.objects
  as permissive for delete to authenticated
  using ((bucket_id = 'hat-images'::text));

drop policy if exists "Allow authenticated users to delete product images" on storage.objects;
create policy "Allow authenticated users to delete product images" on storage.objects
  as permissive for delete to authenticated
  using ((bucket_id = 'product_images'::text));

drop policy if exists "Allow authenticated users to update HAT images" on storage.objects;
create policy "Allow authenticated users to update HAT images" on storage.objects
  as permissive for update to authenticated
  using ((bucket_id = 'hat-images'::text));

drop policy if exists "Allow authenticated users to update product images" on storage.objects;
create policy "Allow authenticated users to update product images" on storage.objects
  as permissive for update to authenticated
  using ((bucket_id = 'product_images'::text));

drop policy if exists "Allow authenticated users to upload HAT images" on storage.objects;
create policy "Allow authenticated users to upload HAT images" on storage.objects
  as permissive for insert to authenticated
  with check ((bucket_id = 'hat-images'::text));

drop policy if exists "Allow authenticated users to upload event images" on storage.objects;
create policy "Allow authenticated users to upload event images" on storage.objects
  as permissive for insert to authenticated
  with check ((bucket_id = 'event-images'::text));

drop policy if exists "Allow public access to view product images" on storage.objects;
create policy "Allow public access to view product images" on storage.objects
  as permissive for select to public
  using ((bucket_id = 'product_images'::text));

drop policy if exists "Allow public read access to HAT images" on storage.objects;
create policy "Allow public read access to HAT images" on storage.objects
  as permissive for select to public
  using ((bucket_id = 'hat-images'::text));

drop policy if exists "Allow public read access to event images" on storage.objects;
create policy "Allow public read access to event images" on storage.objects
  as permissive for select to public
  using ((bucket_id = 'event-images'::text));

drop policy if exists "Allow users to delete their own event images" on storage.objects;
create policy "Allow users to delete their own event images" on storage.objects
  as permissive for delete to authenticated
  using ((bucket_id = 'event-images'::text));

drop policy if exists "Allow users to update their own event images" on storage.objects;
create policy "Allow users to update their own event images" on storage.objects
  as permissive for update to authenticated
  using ((bucket_id = 'event-images'::text))
  with check ((bucket_id = 'event-images'::text));

drop policy if exists "Anyone can read forum media" on storage.objects;
create policy "Anyone can read forum media" on storage.objects
  as permissive for select to public
  using ((bucket_id = 'forum-media'::text));

drop policy if exists "Anyone can view forum attachments" on storage.objects;
create policy "Anyone can view forum attachments" on storage.objects
  as permissive for select to public
  using ((bucket_id = 'forum-attachments'::text));

drop policy if exists "Anyone can view forum media" on storage.objects;
create policy "Anyone can view forum media" on storage.objects
  as permissive for select to public
  using ((bucket_id = 'forum-media'::text));

drop policy if exists "Authenticated users can delete pod images" on storage.objects;
create policy "Authenticated users can delete pod images" on storage.objects
  as permissive for delete to authenticated
  using ((bucket_id = 'pod-images'::text));

drop policy if exists "Authenticated users can delete their forum media" on storage.objects;
create policy "Authenticated users can delete their forum media" on storage.objects
  as permissive for delete to authenticated
  using (((bucket_id = 'forum-media'::text) AND (auth.uid() = owner)));

drop policy if exists "Authenticated users can update pod images" on storage.objects;
create policy "Authenticated users can update pod images" on storage.objects
  as permissive for update to authenticated
  using ((bucket_id = 'pod-images'::text))
  with check ((bucket_id = 'pod-images'::text));

drop policy if exists "Authenticated users can update their forum media" on storage.objects;
create policy "Authenticated users can update their forum media" on storage.objects
  as permissive for update to authenticated
  using (((bucket_id = 'forum-media'::text) AND (auth.uid() = owner)))
  with check (((bucket_id = 'forum-media'::text) AND (auth.uid() = owner)));

drop policy if exists "Authenticated users can upload" on storage.objects;
create policy "Authenticated users can upload" on storage.objects
  as permissive for insert to authenticated
  with check (((bucket_id = 'knowledge-videos'::text) OR (bucket_id = 'knowledge-documents'::text)));

drop policy if exists "Authenticated users can upload forum attachments" on storage.objects;
create policy "Authenticated users can upload forum attachments" on storage.objects
  as permissive for insert to authenticated
  with check (((bucket_id = 'forum-attachments'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['threads'::text, 'posts'::text]))));

drop policy if exists "Authenticated users can upload forum media" on storage.objects;
create policy "Authenticated users can upload forum media" on storage.objects
  as permissive for insert to authenticated
  with check ((bucket_id = 'forum-media'::text));

drop policy if exists "Authenticated users can upload pod images" on storage.objects;
create policy "Authenticated users can upload pod images" on storage.objects
  as permissive for insert to authenticated
  with check (((bucket_id = 'pod-images'::text) AND (auth.role() = 'authenticated'::text)));

drop policy if exists "Creators can delete their own files" on storage.objects;
create policy "Creators can delete their own files" on storage.objects
  as permissive for delete to authenticated
  using (((bucket_id = 'knowledge-videos'::text) OR (bucket_id = 'knowledge-documents'::text)));

drop policy if exists "Full access to product_images bucket" on storage.objects;
create policy "Full access to product_images bucket" on storage.objects
  as permissive for all to public
  using ((bucket_id = 'product_images'::text))
  with check ((bucket_id = 'product_images'::text));

drop policy if exists "Pod images are publicly accessible" on storage.objects;
create policy "Pod images are publicly accessible" on storage.objects
  as permissive for select to public
  using ((bucket_id = 'pod-images'::text));

drop policy if exists "Public can read" on storage.objects;
create policy "Public can read" on storage.objects
  as permissive for select to public
  using (((bucket_id = 'knowledge-videos'::text) OR (bucket_id = 'knowledge-documents'::text)));

drop policy if exists "Uploaders can update own attachments" on storage.objects;
create policy "Uploaders can update own attachments" on storage.objects
  as permissive for update to authenticated
  using (((bucket_id = 'forum-attachments'::text) AND (auth.uid() = owner)));

drop policy if exists "Uploaders can update own forum media" on storage.objects;
create policy "Uploaders can update own forum media" on storage.objects
  as permissive for update to authenticated
  using (((bucket_id = 'forum-media'::text) AND (auth.uid() = owner)));

drop policy if exists "Uploaders or moderators can delete attachments" on storage.objects;
create policy "Uploaders or moderators can delete attachments" on storage.objects
  as permissive for delete to authenticated
  using (((bucket_id = 'forum-attachments'::text) AND ((auth.uid() = owner) OR (EXISTS ( SELECT 1
   FROM pod_role_permissions prp
  WHERE ((((prp.permissions ->> 'forumModeration'::text))::boolean = true) AND (prp.is_active = true)))))));

drop policy if exists "Uploaders or moderators can delete forum media" on storage.objects;
create policy "Uploaders or moderators can delete forum media" on storage.objects
  as permissive for delete to authenticated
  using (((bucket_id = 'forum-media'::text) AND (auth.uid() = owner)));

drop policy if exists "allow authenticated deletes" on storage.objects;
create policy "allow authenticated deletes" on storage.objects
  as permissive for delete to public
  using (((auth.role() = 'authenticated'::text) AND (bucket_id = 'profile_images'::text)));

drop policy if exists "allow authenticated uploads" on storage.objects;
create policy "allow authenticated uploads" on storage.objects
  as permissive for insert to public
  with check (((auth.role() = 'authenticated'::text) AND (bucket_id = 'profile_images'::text)));

drop policy if exists "allow insert to authenticated users-update" on storage.objects;
create policy "allow insert to authenticated users-update" on storage.objects
  as permissive for update to public
  using (((auth.role() = 'authenticated'::text) AND (bucket_id = 'profile_images'::text)))
  with check ((bucket_id = 'profile_images'::text));

