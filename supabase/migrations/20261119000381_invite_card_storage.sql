-- @supabase-only  (skipped by the local PGlite runtime and the test harness)
-- Invite card pictures: invite-cards/<uid>/<sha256>.png, at most 700 KB, public read (chats show them in link
-- previews). The app draws the 1200x630 picture from the player's card; invite_card_image() only accepts paths inside
-- the player's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('invite-cards', 'invite-cards', true, 716800, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "invite-cards: owner can upload" on storage.objects;
create policy "invite-cards: owner can upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'invite-cards' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "invite-cards: owner can replace" on storage.objects;
create policy "invite-cards: owner can replace" on storage.objects for update to authenticated
  using (bucket_id = 'invite-cards' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "invite-cards: owner can read" on storage.objects;
create policy "invite-cards: owner can read" on storage.objects for select to authenticated
  using (bucket_id = 'invite-cards' and (storage.foldername(name))[1] = auth.uid()::text);
