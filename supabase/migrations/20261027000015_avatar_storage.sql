-- @supabase-only  (skipped by the local PGlite runtime and the test harness)
-- Profile pictures: avatars/<uid>/<sha256>.webp|png|jpg, at most 400 KB, public read.
-- The app crops and re-encodes every picture to 256x256 before uploading (which
-- also strips camera metadata such as location); set_avatar_image() only accepts
-- paths inside the player's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 409600, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "avatars: owner can upload" on storage.objects;
create policy "avatars: owner can upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: owner can replace" on storage.objects;
create policy "avatars: owner can replace" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: owner can read" on storage.objects;
create policy "avatars: owner can read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
