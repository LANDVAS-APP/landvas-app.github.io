-- @supabase-only  (skipped by the local PGlite runtime and the test harness)
-- LANDVAS storage buckets and object policies
-- ---------------------------------------------------------------------------
-- drafts       private  drafts/<uid>/<sha256>.png        content-addressed draft tiles
-- submissions  private  submissions/<uid>/<pub>/<gx>_<gy>.png   flattened plot images to review
-- processed    private  processed/<pub>/<gx>_<gy>.png    re-encoded, validated images (worker)
-- public-art   public   tiles/<z>/<x>/<y>/<rev>.png, previews/<pub>.png, thumbs/<pub>.png (worker)
-- Only the worker (service role) writes to processed/ and public-art/.
-- Put a CDN in front of public-art: every object path is immutable.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('drafts', 'drafts', false, 1048576, array['image/png']),
  ('submissions', 'submissions', false, 1048576, array['image/png']),
  ('processed', 'processed', false, 4194304, array['image/png', 'image/webp']),
  ('public-art', 'public-art', true, 4194304, array['image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "drafts: owner can read" on storage.objects for select to authenticated
  using (bucket_id = 'drafts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "drafts: owner can upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'drafts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "submissions: owner can read" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "submissions: owner can upload while uploading" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.artwork_publications a
      where a.id::text = (storage.foldername(name))[2] and a.owner_id = auth.uid() and a.status = 'uploading'));

-- Pending previews: the artist and moderators can read processed images before
-- they become public (moderation review, "pending" status card).
create policy "processed: artist can read own" on storage.objects for select to authenticated
  using (
    bucket_id = 'processed'
    and exists (select 1 from public.artwork_publications a
                where a.id::text = (storage.foldername(name))[1] and a.owner_id = auth.uid()));

create policy "processed: moderators can read" on storage.objects for select to authenticated
  using (bucket_id = 'processed' and exists (select 1 from public.admin_roles r where r.player_id = auth.uid()));
