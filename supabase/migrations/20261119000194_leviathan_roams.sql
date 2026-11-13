-- 🐉 The Leviathan doesn't slip away on its own any more: when it reaches the end of its road (the sea), it turns back
-- inland and keeps roaming — through real cities, drawn to players — until it falls, or the owner sends it back to the
-- sea ("retreat"). A Leviathan already walking (or fleeing) picks this up as it is: nothing about it is reset.
--
-- game_config.leviathan.roam = false brings back the old way (it escapes when it reaches the sea).

/** a new road from where it stands: the best city near it (whatever way it's facing), inland city to city towards
 * players, then the nearest sea. null when there's nowhere to go. */
create or replace function private.lev_roam(p_from jsonb) returns jsonb language plpgsql volatile as $$
declare v_homes jsonb; v_cur jsonb := p_from; v_prev jsonb := p_from; v_path jsonb := '[]'::jsonb; v_seen int[] := '{}'; v_next record; i int; v_exit jsonb;
  v_lng double precision := (p_from ->> 0)::float8; v_lat double precision := (p_from ->> 1)::float8;
begin
  -- one home spot per active player
  select coalesce(jsonb_agg(jsonb_build_array(private.lng_of(w.gx + 0.5), private.lat_of(w.gy + 0.5))), '[]'::jsonb) into v_homes
    from (select distinct on (wp.owner_id) wp.gx, wp.gy from public.world_plots wp join public.players p on p.id = wp.owner_id
           where p.status = 'active' and p.last_active_at > now() - interval '14 days' order by wp.owner_id, wp.claimed_at limit 3000) w;
  -- back to land: a big city close by, the more players around it the better
  select x.id, jsonb_build_array(round(private.lng_of(x.gx + 0.5)::numeric, 5), round(private.lat_of(x.gy + 0.5)::numeric, 5)) pt into v_next
    from public.world_cities x
   where x.pop >= 80000 and private.haversine_m(v_lng, v_lat, private.lng_of(x.gx + 0.5), private.lat_of(x.gy + 0.5)) between 20000 and 600000
   order by ln(x.pop) + 1.6 * ln(1 + (select count(*) from jsonb_array_elements(v_homes) h
                                       where private.haversine_m(private.lng_of(x.gx + 0.5), private.lat_of(x.gy + 0.5), (h ->> 0)::float8, (h ->> 1)::float8) < 300000)) + random() * 1.5 desc
   limit 1;
  if v_next.id is null then
    select x.id, jsonb_build_array(round(private.lng_of(x.gx + 0.5)::numeric, 5), round(private.lat_of(x.gy + 0.5)::numeric, 5)) pt into v_next
      from public.world_cities x where x.pop >= 80000
     order by private.haversine_m(v_lng, v_lat, private.lng_of(x.gx + 0.5), private.lat_of(x.gy + 0.5)) offset 1 limit 1;
  end if;
  if v_next.id is null then return null; end if;
  v_path := jsonb_build_array(v_next.pt); v_seen := array[v_next.id]; v_cur := v_next.pt;
  -- inland: city to city, never doubling back, drawn to big cities and to players
  for i in 1 .. 6 loop
    select x.id, jsonb_build_array(round(private.lng_of(x.gx + 0.5)::numeric, 5), round(private.lat_of(x.gy + 0.5)::numeric, 5)) pt into v_next from (
      select w.*, private.haversine_m((v_cur ->> 0)::float8, (v_cur ->> 1)::float8, private.lng_of(w.gx + 0.5), private.lat_of(w.gy + 0.5)) / 1000 d,
             cos(radians(degrees(atan2(private.lng_of(w.gx + 0.5) - (v_cur ->> 0)::float8, private.lat_of(w.gy + 0.5) - (v_cur ->> 1)::float8))
                         - degrees(atan2((v_cur ->> 0)::float8 - (v_prev ->> 0)::float8, (v_cur ->> 1)::float8 - (v_prev ->> 1)::float8)))) dir
        from public.world_cities w
       where w.pop >= 80000 and not w.id = any(v_seen)
         and private.lat_of(w.gy + 0.5) between (v_cur ->> 1)::float8 - 5 and (v_cur ->> 1)::float8 + 5) x
     where x.d between 120 and 480 and x.dir > 0.2
     order by ln(x.pop) + 1.6 * ln(1 + (select count(*) from jsonb_array_elements(v_homes) h
                                         where private.haversine_m(private.lng_of(x.gx + 0.5), private.lat_of(x.gy + 0.5), (h ->> 0)::float8, (h ->> 1)::float8) < 300000)) + random() * 1.5 desc
     limit 1;
    exit when v_next.id is null;
    v_prev := v_cur; v_cur := v_next.pt;
    v_path := v_path || jsonb_build_array(v_cur); v_seen := v_seen || v_next.id;
  end loop;
  v_exit := private.lev_nearest_sea((v_cur ->> 0)::float8, (v_cur ->> 1)::float8);
  return jsonb_build_object('path', v_path || jsonb_build_array(v_exit -> 'pt'), 'exit', v_exit ->> 'name');
end $$;

/** at the end of its road: keep roaming (unless the owner sent it away, or roaming is switched off) */
create or replace function private.lev_road_end(p_id uuid) returns boolean language plpgsql as $$
declare l public.leviathans; p jsonb; r jsonb;
begin
  select * into l from public.leviathans where id = p_id for update;
  if coalesce((l.data ->> 'retreat')::boolean, false) or not coalesce((private.lev_cfg() ->> 'roam')::boolean, true) then return false; end if;
  p := private.lev_pos(l, now());
  r := private.lev_roam(jsonb_build_array(p -> 'lng', p -> 'lat'));
  if r is null then return false; end if;
  l := private.lev_turn(l.id, r -> 'path', 1, case when l.hp <= l.hp_max * 0.5 then 'enraged' else 'walking' end);
  update public.leviathans set exit_sea = r ->> 'exit', data = (data - 'target') || jsonb_build_object('roams', coalesce((data ->> 'roams')::int, 0) + 1)
   where id = l.id;
  perform private.lev_feed((select lp.player_id from public.leviathan_players lp where lp.lev_id = l.id order by lp.dmg desc limit 1),
                           jsonb_build_object('sub', 'roams', 'gen', l.gen, 'place', private.lev_place((p ->> 'lng')::float8, (p ->> 'lat')::float8)));
  return true;
end $$;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.leviathan_tick()'::regprocedure);
  n := replace(d, $a$  if (p ->> 'done')::boolean then perform private.lev_escape(l.id); return jsonb_build_object('escaped', l.id); end if;$a$,
                  $a$  if (p ->> 'done')::boolean then
    if private.lev_road_end(l.id) then return jsonb_build_object('roamed', l.id); end if;
    perform private.lev_escape(l.id); return jsonb_build_object('escaped', l.id);
  end if;$a$);
  if n = d then raise exception 'leviathan roams: tick anchor not found'; end if;
  execute n;
end $$;
