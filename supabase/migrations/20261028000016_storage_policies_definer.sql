-- @supabase-only  (skipped by the local PGlite runtime and the test harness)
-- v0.5 stopped players reading public.artwork_publications directly (it ties a
-- player to map coordinates). Two storage policies still read that table as the
-- uploading player, so every upload failed with "permission denied for table
-- artwork_publications" — including profile pictures, because Postgres checks
-- every insert policy on storage.objects. They now ask a narrow function instead,
-- which only answers about the caller's own publications.
create or replace function public.my_publication_status(p_id text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select a.status from public.artwork_publications a
  where a.id::text = p_id and a.owner_id = auth.uid()
$$;
revoke all on function public.my_publication_status(text) from public, anon;
grant execute on function public.my_publication_status(text) to authenticated, service_role;

drop policy if exists "submissions: owner can upload while uploading" on storage.objects;
create policy "submissions: owner can upload while uploading" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_publication_status((storage.foldername(name))[2]) = 'uploading');

drop policy if exists "processed: artist can read own" on storage.objects;
create policy "processed: artist can read own" on storage.objects for select to authenticated
  using (bucket_id = 'processed' and public.my_publication_status((storage.foldername(name))[1]) is not null);
