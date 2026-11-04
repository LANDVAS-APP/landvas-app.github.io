-- v0.54 Find your way round: every plot you own (on Earth and out on every world) in one list, one tap to warp
-- there; who's on the world with you right now (tap to go to them); and how many plots are claimed on each world.

/** Each world at a glance: how many plots are claimed, how many explorers are there right now, and how many are yours. */
create or replace function public.planet_overview() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_home text;
begin
  select 'exo:' || home_seed into v_home from public.space_pilots where player_id = v_uid and home_seed is not null;
  return jsonb_build_object(
    'worlds', coalesce((select jsonb_agg(jsonb_build_object('world', w, 'rows', private.planet_rows(w), 'cols', private.planet_cols(w),
        'claimed', (select count(*) from public.planet_plots p where p.world = w),
        'mine', (select count(*) from public.planet_plots p where p.world = w and p.owner_id = v_uid),
        'here_now', (select count(*) from public.planet_presence pr where pr.world = w and pr.seen_at > now() - interval '60 seconds')) order by w)
      from (select jsonb_object_keys(private.planet_cfg() -> 'worlds') w union select v_home where v_home is not null) x
      where w <> 'exo'), '[]'::jsonb),
    'plots', coalesce((select jsonb_agg(jsonb_build_object('world', p.world, 'gx', p.gx, 'gy', p.gy, 'name', p.name, 'rarity', p.rarity,
        'rows', private.planet_rows(p.world), 'base', coalesce(jsonb_array_length(b.layout), 0)) order by p.world, p.claimed_at)
      from public.planet_plots p left join public.planet_bases b on b.world = p.world and b.gx = p.gx and b.gy = p.gy
      where p.owner_id = v_uid), '[]'::jsonb));
end $$;

/** Who's on this world with you right now (seen in the last minute), and where. */
create or replace function public.planet_here(p_world text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_shard int;
begin
  select shard into v_shard from public.planet_presence where player_id = v_uid and world = p_world;
  return coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(pr.player_id), 'd', to_jsonb(pr.d),
      'friend', private.friend_state(v_uid, pr.player_id) = 'friends', 'with_you', pr.shard = v_shard,
      'seen', extract(epoch from now() - pr.seen_at)::int) order by (private.friend_state(v_uid, pr.player_id) = 'friends') desc, pr.seen_at desc)
    from public.planet_presence pr
    where pr.world = p_world and pr.player_id <> v_uid and pr.seen_at > now() - interval '60 seconds' and private.visible_to(pr.player_id, v_uid)), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.planet_overview()', 'public.planet_here(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
