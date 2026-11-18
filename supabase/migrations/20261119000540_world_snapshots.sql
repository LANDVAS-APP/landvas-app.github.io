-- World snapshots for the CDN (cdn.landvas.app, cdn/worker.js).
--
-- Some reads are the same for every player: where the Leviathan is and how it's doing, the hot zone, the giants and
-- wormholes on the map, the primordial plots, the trains and planes in the air. Each player asked the database for
-- them every 10–60 s. Now the CDN asks once per few seconds per Cloudflare location (GET /rest/v1/rpc/world_snapshot,
-- read-only, the public view: no player's own bits) and every player reads its copy — Cloudflare serves it, the
-- database doesn't see them. Each player's own part (your bombs, damage, loot, a hidden Leviathan you've spotted) comes
-- from leviathan_me, asked far less often. The app falls back to the old calls whenever the CDN isn't there.
--
-- The snapshots are built by the very functions the app always called, read as nobody (so they can't drift apart);
-- the two map layers now also say whose each thing is, so the app can tell what's yours.

-- whose giant / wormhole / primordial it is (the app works out "mine" from the snapshot)
select private.fn_patch('public.enchant_world()', $a$'mine', b.player_id = auth.uid(),$a$, $b$'mine', b.player_id = auth.uid(), 'owner_id', b.player_id,$b$);
select private.fn_patch('public.enchant_world()', $a$'mine', e.owner_id = auth.uid(),$a$, $b$'mine', e.owner_id = auth.uid(), 'owner_id', e.owner_id,$b$);
select private.fn_patch('public.primordials_world()', $a$'mine', w.owner_id = auth.uid(),$a$, $b$'mine', w.owner_id = auth.uid(), 'owner_id', w.owner_id,$b$);

-- the public view of one world thing, as nobody sees it (read-only: the CDN calls it with GET)
create or replace function public.world_snapshot(p_key text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v jsonb;
begin
  -- as nobody, whoever asks: a signed-in caller gets the same public view the CDN does (for this call's transaction)
  perform set_config('request.jwt.claims', '{}', true);
  v := case p_key
    when 'leviathan' then private.lev_state(null, false)
    when 'hot_zone' then public.hot_zone_today()
    when 'enchant_world' then public.enchant_world()
    when 'primordials' then public.primordials_world()
    when 'travel' then jsonb_build_object('items', public.travel_traffic())
  end;
  if v is null then return null; end if;
  return v || jsonb_build_object('snapshot', p_key, 'built_at', now());
end $$;
revoke all on function public.world_snapshot(text) from public;
grant execute on function public.world_snapshot(text) to anon, authenticated, service_role;

-- your own part of the Leviathan: what world_snapshot('leviathan') leaves out. (It also keeps the Leviathan's heartbeat
-- going when people look, like leviathan_state does.)
create or replace function public.leviathan_me()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_uid uuid := private.uid(); l public.leviathans; v jsonb; v_world_hides boolean;
begin
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
  if (l.id is not null and (l.last_tick is null or l.last_tick < now() - interval '30 seconds'))
     or (l.id is null and (now() >= private.lev_next_at()
                           or exists (select 1 from public.leviathans x where x.status = 'submerged' and (x.data ->> 'return_at')::timestamptz <= now()))) then
    perform private.leviathan_tick();
    select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
  end if;
  v := private.lev_state(v_uid, false);
  -- (the same rule lev_state uses for nobody)
  v_world_hides := l.id is not null and private.lev_hidden(l) and l.status <> 'warning';
  return jsonb_build_object(
    'server_time', v -> 'server_time',
    'me', v -> 'me',
    'loot', v -> 'last' -> 'loot',
    'deep_my_dmg', v -> 'deep' -> 'my_dmg',
    -- hidden from the world but spotted by you: you see it as it is
    'lev', case when v_world_hides and not coalesce((v -> 'lev' ->> 'hidden')::boolean, true) then v -> 'lev' end);
end $$;
revoke all on function public.leviathan_me() from public, anon;
grant execute on function public.leviathan_me() to authenticated, service_role;

-- where the CDN is (set by the deploy once cdn.landvas.app answers; empty: the app uses the old calls)
insert into public.game_config (key, value, description)
values ('cdn', '{"enabled": false}', 'The CDN the app reads world snapshots and pictures from (set by the deploy).')
on conflict (key) do nothing;
select private.fn_patch('public.app_config()', $a$|| jsonb_build_object('ota_builds',$a$, $b$|| jsonb_build_object('cdn', coalesce(private.cfg('cdn'), '{}'::jsonb), 'ota_builds',$b$);
