-- Live counters for the public homepage (no personal data, no locations).
create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'players', (select count(*) from public.profiles where not is_hidden),
    'artworks', (select count(*) from public.artwork_publications where status = 'published'),
    'plots', (select count(*) from public.world_plots where owner_id is not null),
    'painted_plots', (select count(*) from public.world_plots where owner_id is not null and art_rev is not null),
    'server_time', now())
$$;
revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated, service_role;
