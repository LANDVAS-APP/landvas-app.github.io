-- v0.7.2 A shared answer for the public counters.
--
-- public_stats (players, artworks, plots on the welcome page) counted whole tables on every visit, by everyone
-- including visitors who aren't signed in. That's cheap with hundreds of rows and seconds with millions. The counts
-- are now worked out at most every two minutes and shared by every caller; nobody can tell the difference.
create unlogged table if not exists private.shared_cache (
  key text primary key,
  value jsonb not null,
  at timestamptz not null default now()
);

create or replace function public.public_stats() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  select value into v from private.shared_cache where key = 'public_stats' and at > now() - interval '2 minutes';
  if v is null then
    v := jsonb_build_object(
      'players', (select count(*) from public.profiles where not is_hidden),
      'artworks', (select count(*) from public.artwork_publications where status = 'published'),
      'plots', (select count(*) from public.world_plots where owner_id is not null),
      'painted_plots', (select count(*) from public.world_plots where owner_id is not null and art_rev is not null));
    insert into private.shared_cache (key, value, at) values ('public_stats', v, now())
    on conflict (key) do update set value = excluded.value, at = excluded.at;
  end if;
  return v || jsonb_build_object('server_time', now());
end $$;
grant execute on function public.public_stats() to anon, authenticated;
