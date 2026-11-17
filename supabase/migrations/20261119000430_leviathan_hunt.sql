-- 😡 The Leviathan, hunting — and the owner's hand on the one that's out.
--
--  · ENRAGED HUNT: it goes after players and plots nonstop. Each time it reaches a target it turns on the next:
--      - the owner's own list (any players and any plots, in order, round and round), or
--      - by itself: players about (where their explorer is right now, then their best plots), the rarest land around it,
--        or both in turn — never the same one twice in a row.
--    A hunted player is FOLLOWED: while it's on its way to them, it re-aims when their explorer moves (more than 2 km).
--    It keeps hunting at the end of every road (instead of roaming / escaping) until the owner calls it off or sends it
--    to retreat; it keeps its hunt through a dive under the sea and back.
--  · TARGETS OF YOUR CHOOSING: "go for these" / rampage / hunt take any mix of players and plots (up to 24).
--  · ADD HEALTH: raises its health and its health bar together (not only healing what it lost).
--  · SUMMON YOUR OWN: health, speed, and hunting from the moment it rises.
--  · FIND PLOTS: by plot number (or a link with it in), or a place name (the best plots around that city).

-- ---- who it's going after --------------------------------------------------------------------------------------------
/** the targets in what the owner sent: {targets: [{t:'player', id|name} | {t:'plot', gx, gy}]}, players: [...], player, plots: [[gx, gy]] */
create or replace function private.lev_hunt_list(p_args jsonb) returns jsonb language plpgsql stable as $$
declare v_out jsonb := '[]'::jsonb; x jsonb; v_who uuid; v_name text; v_q text; v_gx int; v_gy int;
begin
  for x in
    select v from jsonb_array_elements(coalesce(p_args -> 'targets', '[]'::jsonb)) v
    union all select jsonb_build_object('t', 'player', 'id', v #>> '{}') from jsonb_array_elements(coalesce(p_args -> 'players', '[]'::jsonb)) v
    union all select jsonb_build_object('t', 'player', 'id', p_args ->> 'player') where nullif(p_args ->> 'player', '') is not null
    union all select jsonb_build_object('t', 'plot', 'gx', v -> 0, 'gy', v -> 1) from jsonb_array_elements(coalesce(p_args -> 'plots', '[]'::jsonb)) v
  loop
    exit when jsonb_array_length(v_out) >= 24;
    if x ->> 't' = 'plot' then
      v_gx := (x ->> 'gx')::int; v_gy := (x ->> 'gy')::int;
      if v_gx is null or v_gy is null or v_gx not between 0 and 4194303 or v_gy not between 0 and 4194303 then raise exception 'bad_plot' using errcode = 'P0001'; end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'plot', 'gx', v_gx, 'gy', v_gy,
                 'name', (select pr.username from public.world_plots w join public.profiles pr on pr.id = w.owner_id where w.gx = v_gx and w.gy = v_gy)));
    else
      v_q := coalesce(nullif(x ->> 'id', ''), x ->> 'name');
      v_who := null;
      select pr.id, pr.username into v_who, v_name from public.profiles pr
       where pr.id::text = v_q or lower(pr.username) = lower(ltrim(coalesce(v_q, ''), '@')) limit 1;
      if v_who is null then raise exception 'player_not_found' using errcode = 'P0001'; end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('t', 'player', 'id', v_who, 'name', v_name));
    end if;
  end loop;
  return v_out;
end $$;

/** where a target is: a player — where their explorer is right now, then their two best plots; a plot — the plot */
create or replace function private.lev_hunt_pts(p_t jsonb) returns jsonb language plpgsql stable as $$
declare e record; v_id uuid;
begin
  if p_t ->> 't' = 'plot' then
    return jsonb_build_array(jsonb_build_array(round(private.lng_of((p_t ->> 'gx')::int + 0.5)::numeric, 5), round(private.lat_of((p_t ->> 'gy')::int + 0.5)::numeric, 5)));
  end if;
  v_id := (p_t ->> 'id')::uuid;
  select * into e from private.explorer_now(v_id);
  return (case when e.lng is not null then jsonb_build_array(jsonb_build_array(round(e.lng::numeric, 5), round(e.lat::numeric, 5))) else '[]'::jsonb end)
      || coalesce((select jsonb_agg(q.pt order by q.o) from (
           select row_number() over (order by r.sort desc nulls last, w.claimed_at desc) o,
                  jsonb_build_array(round(private.lng_of(w.gx + 0.5)::numeric, 5), round(private.lat_of(w.gy + 0.5)::numeric, 5)) pt
             from public.world_plots w left join public.plot_rarities r on r.id = w.rarity
            where w.owner_id = v_id order by r.sort desc nulls last, w.claimed_at desc limit 2) q), '[]'::jsonb);
end $$;

/** who or what it goes after by itself: a player about (the nearer, the likelier) or the rarest land around it */
create or replace function private.lev_hunt_pick(p jsonb, p_kind text, p_skip jsonb) returns jsonb language plpgsql volatile as $$
declare v_lng float8 := (p ->> 'lng')::float8; v_lat float8 := (p ->> 'lat')::float8; t jsonb; c int[];
begin
  if p_kind = 'players' then
    select jsonb_build_object('t', 'player', 'id', pl.id, 'name', pr.username) into t
      from public.explorers e join public.players pl on pl.id = e.player_id join public.profiles pr on pr.id = pl.id
     where pl.status = 'active' and pl.last_active_at > now() - interval '7 days' and not p_skip @> jsonb_build_array(pl.id::text)
       and private.haversine_m(v_lng, v_lat, e.lng, e.lat) < 2500000
     order by random() / (1 + private.haversine_m(v_lng, v_lat, e.lng, e.lat) / 400000) desc limit 1;
    if t is null then
      select jsonb_build_object('t', 'player', 'id', pl.id, 'name', pr.username) into t
        from public.players pl join public.profiles pr on pr.id = pl.id
       where pl.status = 'active' and pl.last_active_at > now() - interval '7 days' and not p_skip @> jsonb_build_array(pl.id::text)
         and exists (select 1 from public.world_plots w where w.owner_id = pl.id)
       order by random() limit 1;
    end if;
    return t;
  end if;
  c := private.lev_cell(v_lng, v_lat);
  select jsonb_build_object('t', 'plot', 'gx', w.gx, 'gy', w.gy, 'name', pr.username) into t
    from public.world_plots w join public.plot_rarities r on r.id = w.rarity join public.profiles pr on pr.id = w.owner_id
   where w.owner_id is not null and w.gx between c[1] - 90000 and c[1] + 90000 and w.gy between c[2] - 90000 and c[2] + 90000
     and not p_skip @> jsonb_build_array(w.gx || ',' || w.gy)
   order by r.sort desc, random() limit 1;
  return t;
end $$;

/** on to the next one (p_advance), or re-aim at the same one (a player who moved). Null when there's nobody to hunt. */
create or replace function private.lev_hunt_next(p_id uuid, p_advance boolean default true) returns public.leviathans language plpgsql as $$
declare l public.leviathans; p jsonb; h jsonb; v_list jsonb; n int; i int; k int; t jsonb; v_pts jsonb; v_kind text; v_skip jsonb; v_key text; v_recent jsonb;
  v_owner uuid; v_name text;
begin
  select * into l from public.leviathans where id = p_id for update;
  if l.id is null then return null; end if;
  h := coalesce(l.data -> 'hunt', '{}'::jsonb);
  p := private.lev_pos(l, now());
  v_list := coalesce(h -> 'targets', '[]'::jsonb); n := jsonb_array_length(v_list); i := coalesce((h ->> 'i')::int, 0);
  v_skip := coalesce(h -> 'recent', '[]'::jsonb);
  if not p_advance and h -> 'cur' is not null then
    t := h -> 'cur'; v_pts := private.lev_hunt_pts(t);
  elsif n > 0 then
    -- the owner's list, round and round (anyone it can't find right now is skipped)
    for k in 0 .. n - 1 loop
      t := v_list -> ((i + k) % n);
      v_pts := private.lev_hunt_pts(t);
      if jsonb_array_length(v_pts) > 0 then i := i + k + 1; exit; end if;
      t := null;
    end loop;
  end if;
  if t is null then
    -- by itself: players, plots, or one then the other
    v_kind := coalesce(h ->> 'auto', 'both');
    if v_kind = 'both' then v_kind := case when i % 2 = 0 then 'players' else 'plots' end; end if;
    t := private.lev_hunt_pick(p, v_kind, v_skip);
    if t is null then t := private.lev_hunt_pick(p, case v_kind when 'players' then 'plots' else 'players' end, v_skip); end if;
    if t is null then t := private.lev_hunt_pick(p, v_kind, '[]'::jsonb); end if;
    if t is null then return null; end if;
    i := i + 1;
    v_pts := private.lev_hunt_pts(t);
  end if;
  if v_pts is null or jsonb_array_length(v_pts) = 0 then return null; end if;
  l := private.lev_turn(l.id, v_pts, 1, case when l.status = 'warning' then 'warning' else 'enraged' end);
  v_key := case when t ->> 't' = 'plot' then (t ->> 'gx') || ',' || (t ->> 'gy') else t ->> 'id' end;
  v_recent := jsonb_build_array(v_key) || (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_skip) x where x #>> '{}' <> v_key);
  v_recent := (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from jsonb_array_elements(v_recent) with ordinality a(x, o) where o <= 3);
  if t ->> 't' = 'player' then v_owner := (t ->> 'id')::uuid; v_name := t ->> 'name';
  else select w.owner_id, pr.username into v_owner, v_name from public.world_plots w left join public.profiles pr on pr.id = w.owner_id where w.gx = (t ->> 'gx')::int and w.gy = (t ->> 'gy')::int;
  end if;
  update public.leviathans set data = (data - 'retreat') || jsonb_build_object(
           'hunt', h || jsonb_build_object('i', i, 'cur', t, 'recent', v_recent, 'aim', v_pts -> 0, 'aimed_at', now(), 'hunted', coalesce((h ->> 'hunted')::int, 0) + case when p_advance then 1 else 0 end),
           'targets', v_pts,
           'target', case when t ->> 't' = 'player' then jsonb_build_object('owner_name', v_name, 'player', true)
                          else jsonb_build_object('gx', (t ->> 'gx')::int, 'gy', (t ->> 'gy')::int, 'owner_name', v_name) end)
   where id = l.id returning * into l;
  if p_advance and l.status <> 'warning' then
    -- they're told it's coming, and the fight feed says who it's hunting
    if v_owner is not null then perform private.notify(v_owner, 'leviathan', null, jsonb_build_object('sub', 'coming', 'gen', l.gen, 'hunt', true, 'place', l.place)); end if;
    insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg)
    values (l.id, null, 'hunt', case when t ->> 't' = 'player' then 'is hunting @' || coalesce(v_name, '?') when v_name is not null then 'is going for @' || v_name || '’s plot' else 'is going for a plot' end, '😡', 0);
  end if;
  return l;
end $$;

/** a hunted player who moves is followed (while it's still on its way to them; at most once a minute, for 2 km+) */
create or replace function private.lev_hunt_follow(p_id uuid) returns void language plpgsql as $$
declare l public.leviathans; h jsonb; e record; v_aim jsonb; v_l public.leviathans;
begin
  select * into l from public.leviathans where id = p_id;
  h := l.data -> 'hunt';
  if not coalesce((h ->> 'on')::boolean, false) or not coalesce((h ->> 'follow')::boolean, true) or (h -> 'cur' ->> 't') is distinct from 'player' then return; end if;
  if (h ->> 'aimed_at')::timestamptz > now() - interval '1 minute' then return; end if;
  if (private.lev_pos(l, now()) ->> 'seg')::int > 0 then return; end if;
  select * into e from private.explorer_now((h -> 'cur' ->> 'id')::uuid);
  if e.lng is null then return; end if;
  v_aim := h -> 'aim';
  if v_aim is not null and private.haversine_m(e.lng, e.lat, (v_aim ->> 0)::float8, (v_aim ->> 1)::float8) < 2000 then return; end if;
  v_l := private.lev_hunt_next(p_id, false);
end $$;

-- at the end of every road a hunting Leviathan turns on its next target (instead of roaming or escaping)
create or replace function private.lev_road_end(p_id uuid) returns boolean language plpgsql as $$
declare l public.leviathans; p jsonb; r jsonb; v_l public.leviathans;
begin
  select * into l from public.leviathans where id = p_id for update;
  if coalesce((l.data -> 'hunt' ->> 'on')::boolean, false) and not coalesce((l.data ->> 'retreat')::boolean, false) then
    v_l := private.lev_hunt_next(p_id);
    if v_l.id is not null then return true; end if;
  end if;
  if coalesce((l.data ->> 'retreat')::boolean, false) or not coalesce((l.data ->> 'roam')::boolean, (private.lev_cfg() ->> 'roam')::boolean, true) then return false; end if;
  p := private.lev_pos(l, now());
  r := private.lev_roam(jsonb_build_array(p -> 'lng', p -> 'lat'));
  if r is null then return false; end if;
  l := private.lev_turn(l.id, r -> 'path', 1, case when l.hp <= l.hp_max * 0.5 then 'enraged' else 'walking' end);
  update public.leviathans set exit_sea = r ->> 'exit', data = (data - 'target' - 'targets') || jsonb_build_object('roams', coalesce((data ->> 'roams')::int, 0) + 1)
   where id = l.id;
  perform private.lev_feed((select lp.player_id from public.leviathan_players lp where lp.lev_id = l.id order by lp.dmg desc limit 1),
                           jsonb_build_object('sub', 'roams', 'gen', l.gen, 'place', private.lev_place((p ->> 'lng')::float8, (p ->> 'lat')::float8)));
  return true;
end $$;

-- the heartbeat: a hunter starts hunting the moment it rises, and follows the player it's after
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.leviathan_tick()'::regprocedure);
  n := replace(d, $a$declare l public.leviathans; p jsonb;$a$, $a$declare l public.leviathans; v_hl public.leviathans; p jsonb;$a$);
  if n = d then raise exception 'leviathan hunt: tick declare anchor not found'; end if;
  d := n;
  n := replace(d, $a$    perform private.lev_feed(null, jsonb_build_object('sub', 'risen', 'where', l.origin, 'gen', l.gen));$a$,
                  $a$    perform private.lev_feed(null, jsonb_build_object('sub', 'risen', 'where', l.origin, 'gen', l.gen));
    if coalesce((l.data -> 'hunt' ->> 'on')::boolean, false) then
      v_hl := private.lev_hunt_next(l.id);
      if v_hl.id is not null then l := v_hl; end if;
    end if;$a$);
  if n = d then raise exception 'leviathan hunt: tick rise anchor not found'; end if;
  d := n;
  n := replace(d, $a$  -- the end of the road is the sea
  if (p ->> 'done')::boolean then$a$, $a$  -- hunting a player: it follows them
  if coalesce((l.data -> 'hunt' ->> 'on')::boolean, false) and not (p ->> 'done')::boolean then perform private.lev_hunt_follow(l.id); end if;
  -- the end of the road is the sea
  if (p ->> 'done')::boolean then$a$);
  if n = d then raise exception 'leviathan hunt: tick follow anchor not found'; end if;
  execute n;
  -- screens see that it's hunting (the owner sees the whole hunt)
  d := pg_get_functiondef('private.lev_state(uuid,boolean)'::regprocedure);
  n := replace(d, $a$'returns', coalesce((l.data ->> 'returns')::int, 0),$a$, $a$'returns', coalesce((l.data ->> 'returns')::int, 0), 'hunting', coalesce((l.data -> 'hunt' ->> 'on')::boolean, false),$a$);
  if n = d then raise exception 'leviathan hunt: state hunting anchor not found'; end if;
  d := n;
  n := replace(d, $a$'next_power_at', l.data -> 'next_power_at',$a$, $a$'next_power_at', l.data -> 'next_power_at', 'hunt', l.data -> 'hunt',$a$);
  if n = d then raise exception 'leviathan hunt: state reveal anchor not found'; end if;
  execute n;
end $$;

-- ---- finding plots for the owner: a plot number (or a link with one in), or a place --------------------------------
create or replace function public.admin_lev_find(p_q text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); m text[]; c public.world_cities; v_dc int; v_gx int; v_gy int; v_q text := trim(coalesce(p_q, ''));
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  -- a plot number as the game writes it ("2 123 456 · 1 234 567"), a link (…?fly=2123456,1234567), or two numbers
  if position('·' in v_q) > 0 then
    m := array[nullif(regexp_replace(split_part(v_q, '·', 1), '\D', '', 'g'), ''), nullif(regexp_replace(split_part(v_q, '·', 2), '\D', '', 'g'), '')];
    if m[1] is null or m[2] is null then m := null; end if;
  else
    m := coalesce(regexp_match(v_q, 'fly=(\d+),(\d+)'), regexp_match(v_q, '^\D*?(\d{2,7})\D+(\d{2,7})\D*$'));
  end if;
  if m is not null then
    v_gx := least(m[1]::bigint, 99999999)::int; v_gy := least(m[2]::bigint, 99999999)::int;
    if v_gx > 4194303 or v_gy > 4194303 then return jsonb_build_object('plots', '[]'::jsonb); end if;
    return jsonb_build_object('place', null, 'plots', jsonb_build_array(coalesce(
      (select jsonb_build_object('gx', w.gx, 'gy', w.gy, 'rarity', w.rarity, 'owner_name', pr.username, 'name', w.name)
         from public.world_plots w left join public.profiles pr on pr.id = w.owner_id where w.gx = v_gx and w.gy = v_gy),
      jsonb_build_object('gx', v_gx, 'gy', v_gy, 'rarity', null, 'owner_name', null, 'name', null))));
  end if;
  if length(trim(coalesce(p_q, ''))) < 2 then return jsonb_build_object('plots', '[]'::jsonb); end if;
  select * into c from public.world_cities x where lower(x.name) like lower(trim(p_q)) || '%' order by (lower(x.name) = lower(trim(p_q))) desc, x.pop desc limit 1;
  if c.id is null then return jsonb_build_object('place', null, 'plots', '[]'::jsonb); end if;
  -- ~30 km around it
  v_dc := ceil(30000 / greatest(40075016.7 / 4194304 * cos(radians(private.lat_of(c.gy + 0.5))), 0.5))::int;
  return jsonb_build_object('place', c.name || coalesce(', ' || c.state, ''), 'plots', coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('gx', w.gx, 'gy', w.gy, 'rarity', w.rarity, 'owner_name', pr.username, 'name', w.name) x
      from public.world_plots w join public.profiles pr on pr.id = w.owner_id left join public.plot_rarities r on r.id = w.rarity
     where w.gx between c.gx - v_dc and c.gx + v_dc and w.gy between c.gy - v_dc and c.gy + v_dc
     order by r.sort desc nulls last, w.claimed_at desc limit 40) q), '[]'::jsonb));
end $$;
revoke all on function public.admin_lev_find(text) from public, anon;
grant execute on function public.admin_lev_find(text) to authenticated;

-- ---- the owner's controls ----------------------------------------------------------------------------------------------
create or replace function public.admin_leviathan(p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); l public.leviathans; p jsonb; a jsonb; v_pts jsonb; v_kmh numeric; v_min numeric; v_mult numeric; v_sea jsonb;
  v_heal bigint; u record; v_live boolean; v_max numeric; v_hp numeric; v_pace jsonb; v_frac numeric; v_list jsonb; t jsonb; v_l public.leviathans; v_auto text;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1 for update;
  v_live := l.id is not null;
  if p_action not in ('summon', 'status', 'resurface', 'dismiss') and not v_live then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_action in ('speed', 'target', 'rampage', 'retreat', 'stay', 'tiny', 'hide') and l.status = 'warning' then raise exception 'not_risen' using errcode = 'P0001'; end if;
  if v_live then p := private.lev_pos(l, now()); end if;
  case p_action
    when 'summon' then
      if v_live then raise exception 'leviathan_active' using errcode = 'P0001'; end if;
      v_list := case when coalesce((p_args -> 'hunt' ->> 'on')::boolean, false) then private.lev_hunt_list(coalesce(p_args -> 'hunt', '{}'::jsonb)) end;
      l := private.lev_spawn(least(greatest(coalesce((p_args ->> 'warn_min')::numeric, 60), 0), 1440));
      -- your own: its health, its pace, and hunting from the moment it rises
      if nullif(p_args ->> 'hp', '') is not null then
        v_hp := (p_args ->> 'hp')::numeric;
        if v_hp < 1 or v_hp > 1e12 then raise exception 'invalid_hp' using errcode = 'P0001'; end if;
        update public.leviathans set hp_max = v_hp::bigint, hp = v_hp::bigint, data = data || jsonb_build_object('loot_hp', least(v_hp, coalesce((data ->> 'loot_hp')::numeric, v_hp))) where id = l.id returning * into l;
      end if;
      if nullif(p_args ->> 'mult', '') is not null then
        update public.leviathans set speed_kmh = least(greatest(base_kmh * least(greatest((p_args ->> 'mult')::numeric, 0.05), 100), 1), 5000) where id = l.id returning * into l;
      end if;
      if v_list is not null then
        v_auto := coalesce(nullif(p_args -> 'hunt' ->> 'auto', ''), 'both');
        if v_auto not in ('players', 'plots', 'both') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
        update public.leviathans set data = data || jsonb_build_object('hunt', jsonb_build_object('on', true, 'targets', v_list, 'i', 0, 'auto', v_auto,
               'follow', coalesce((p_args -> 'hunt' ->> 'follow')::boolean, true), 'recent', '[]'::jsonb)) where id = l.id returning * into l;
      end if;
      perform private.audit('leviathan.summon', 'leviathan', l.id::text, p_args || jsonb_build_object('origin', l.origin));
    when 'dismiss' then
      -- (with none out: the one waiting under the sea goes for good)
      if not v_live then select * into l from public.leviathans where status = 'submerged' order by spawned_at desc limit 1 for update; end if;
      if l.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
      update public.leviathans set status = 'ended', ended_at = now() where id = l.id returning * into l;
      perform private.audit('leviathan.dismiss', 'leviathan', l.id::text, '{}'::jsonb);
    when 'submerge' then
      l := private.lev_submerge(l.id, p_args);
      perform private.audit('leviathan.submerge', 'leviathan', l.id::text, p_args);
    when 'resurface' then
      if v_live then raise exception 'leviathan_active' using errcode = 'P0001'; end if;
      l := private.lev_resurface(null, p_args);
      perform private.audit('leviathan.resurface', 'leviathan', l.id::text, p_args || jsonb_build_object('strength', l.strength, 'hp_max', l.hp_max));
    when 'set_hp' then
      -- a set amount (keeping its wounds, or full) — or "lasts N more hours at the pace it's being hit now" (keeping its wounds)
      v_frac := least(greatest(l.hp::numeric / greatest(l.hp_max, 1), 0.05), 1);
      if p_args ->> 'mode' = 'hours' then
        v_pace := private.lev_pace(l);
        if v_pace is null then raise exception 'not_risen' using errcode = 'P0001'; end if;
        v_hp := greatest(1, round((v_pace ->> 'dph')::numeric * least(greatest(coalesce((p_args ->> 'hours')::numeric, 9), 0.25), 240)));
        v_max := round(v_hp / v_frac);
      else
        v_max := (p_args ->> 'hp')::numeric;
        if v_max is null or v_max < 1 or v_max > 1e12 then raise exception 'invalid_hp' using errcode = 'P0001'; end if;
        v_hp := case when coalesce((p_args ->> 'keep')::boolean, true) then greatest(1, round(v_max * l.hp / greatest(l.hp_max, 1))) else v_max end;
      end if;
      v_max := least(greatest(v_max, v_hp, 1), 1e12); v_hp := least(v_hp, v_max);
      v_heal := round(v_hp - l.hp)::bigint;
      update public.leviathans set hp_max = v_max::bigint, hp = v_hp::bigint, roar_at = now(),
             data = data || jsonb_build_object('loot_hp', least(v_max, coalesce((data ->> 'loot_hp')::numeric, hp_max)))
       where id = l.id returning * into l;
      if v_heal > 0 then insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, null, 'heal', 'Drew strength from the deep', '🌊', v_heal); end if;
      perform private.audit('leviathan.set_hp', 'leviathan', l.id::text, p_args || jsonb_build_object('hp', v_hp, 'hp_max', v_max));
    when 'add_hp' then
      -- more health, and a bigger health bar to hold it (by an amount, or a % of the bar)
      v_heal := case when nullif(p_args ->> 'pct', '') is not null then round(l.hp_max * least(greatest((p_args ->> 'pct')::numeric, 1), 1000) / 100) else (p_args ->> 'hp')::numeric end;
      if v_heal is null or v_heal < 1 or l.hp_max + v_heal > 1e12 then raise exception 'invalid_hp' using errcode = 'P0001'; end if;
      update public.leviathans set hp_max = hp_max + v_heal, hp = hp + v_heal, roar_at = now() where id = l.id returning * into l;
      insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, null, 'heal', 'Grew stronger', '💪', v_heal);
      perform private.audit('leviathan.add_hp', 'leviathan', l.id::text, jsonb_build_object('hp', v_heal));
    when 'hunt' then
      if coalesce((p_args ->> 'on')::boolean, true) then
        -- ENRAGED: players and plots, nonstop (your list round and round, or whoever it finds)
        v_list := private.lev_hunt_list(p_args);
        v_auto := coalesce(nullif(p_args ->> 'auto', ''), l.data -> 'hunt' ->> 'auto', 'both');
        if v_auto not in ('players', 'plots', 'both') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
        update public.leviathans set data = (data - 'retreat') || jsonb_build_object('hunt', jsonb_build_object('on', true, 'targets', v_list, 'i', 0, 'auto', v_auto,
               'follow', coalesce((p_args ->> 'follow')::boolean, true), 'recent', '[]'::jsonb, 'hunted', coalesce((data -> 'hunt' ->> 'hunted')::int, 0)))
         where id = l.id returning * into l;
        if nullif(p_args ->> 'mult', '') is not null then
          v_kmh := least(greatest(private.lev_base(l) * least(greatest((p_args ->> 'mult')::numeric, 0.05), 100), 1), 5000);
          if l.rampage_until > now() then update public.leviathans set data = data || jsonb_build_object('cruise_kmh', v_kmh) where id = l.id returning * into l;
          else l := private.lev_set_speed(l.id, v_kmh); end if;
        end if;
        if l.status <> 'warning' then
          insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, null, 'hunt', 'is ENRAGED — hunting players and plots nonstop', '😡', 0);
          v_l := private.lev_hunt_next(l.id);
          if v_l.id is null then update public.leviathans set status = 'enraged', roar_at = now() where id = l.id; end if;
        end if;
      else
        -- called off: it calms down (unless it's badly hurt) and roams on from here
        update public.leviathans set data = jsonb_set(data, '{hunt,on}', 'false'::jsonb) - 'target' - 'targets' where id = l.id returning * into l;
        if l.status <> 'warning' then
          a := private.lev_roam(jsonb_build_array(p -> 'lng', p -> 'lat'));
          if a is not null then
            l := private.lev_turn(l.id, a -> 'path', 1, case when l.hp <= l.hp_max * 0.5 then 'enraged' else 'walking' end);
            update public.leviathans set exit_sea = a ->> 'exit' where id = l.id returning * into l;
          else update public.leviathans set status = case when hp <= hp_max * 0.5 then 'enraged' else 'walking' end where id = l.id returning * into l;
          end if;
        end if;
      end if;
      perform private.audit('leviathan.hunt', 'leviathan', l.id::text, p_args);
    when 'speed' then
      -- km/h, or × its normal pace
      v_kmh := coalesce((p_args ->> 'kmh')::numeric, private.lev_base(l) * (p_args ->> 'mult')::numeric);
      if v_kmh is null or v_kmh < 1 or v_kmh > 5000 then raise exception 'invalid_speed' using errcode = 'P0001'; end if;
      if l.rampage_until > now() then
        -- (on a rampage: this is the pace it goes back to afterwards)
        update public.leviathans set data = data || jsonb_build_object('cruise_kmh', v_kmh) where id = l.id;
      else
        l := private.lev_set_speed(l.id, v_kmh);
      end if;
      perform private.audit('leviathan.speed', 'leviathan', l.id::text, jsonb_build_object('kmh', v_kmh));
    when 'heal' then
      v_heal := least(l.hp_max - l.hp, round(l.hp_max * least(greatest(coalesce((p_args ->> 'pct')::numeric, 10), 1), 100) / 100))::bigint;
      update public.leviathans set hp = hp + v_heal, roar_at = now() where id = l.id returning * into l;
      if v_heal > 0 then insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, null, 'heal', 'It drank the sea and healed', '🌊', v_heal); end if;
      perform private.audit('leviathan.heal', 'leviathan', l.id::text, jsonb_build_object('hp', v_heal));
    when 'retreat' then
      -- back to the sea, and away (no more roaming or hunting)
      v_sea := private.lev_nearest_sea((p ->> 'lng')::float8, (p ->> 'lat')::float8);
      if l.rampage_until > now() then l := private.lev_set_speed(l.id, coalesce((l.data ->> 'cruise_kmh')::numeric, private.lev_base(l))); end if;
      update public.leviathans set rampage_until = null, data = (data - 'cruise_kmh' - 'target' - 'targets' || jsonb_build_object('retreat', true))
             || case when data ? 'hunt' then jsonb_build_object('hunt', (data -> 'hunt') || '{"on": false}'::jsonb) else '{}'::jsonb end where id = l.id;
      l := private.lev_turn(l.id, jsonb_build_array(v_sea -> 'pt'), 1.6, 'fleeing');
      update public.leviathans set exit_sea = v_sea ->> 'name' where id = l.id returning * into l;
      perform private.lev_feed(null, jsonb_build_object('sub', 'fleeing', 'gen', l.gen, 'sea', v_sea ->> 'name'));
      perform private.audit('leviathan.retreat', 'leviathan', l.id::text, jsonb_build_object('sea', v_sea ->> 'name'));
    when 'stay' then
      -- it changes its mind: back inland
      update public.leviathans set data = data - 'retreat' where id = l.id returning * into l;
      if l.status = 'fleeing' then
        a := private.lev_roam(jsonb_build_array(p -> 'lng', p -> 'lat'));
        if a is not null then
          l := private.lev_turn(l.id, a -> 'path', 1, case when l.hp <= l.hp_max * 0.5 then 'enraged' else 'walking' end);
          update public.leviathans set exit_sea = a ->> 'exit' where id = l.id returning * into l;
        end if;
      end if;
      perform private.audit('leviathan.stay', 'leviathan', l.id::text, '{}'::jsonb);
    when 'roam' then
      update public.leviathans set data = data || jsonb_build_object('roam', coalesce((p_args ->> 'on')::boolean, true)) where id = l.id returning * into l;
      perform private.audit('leviathan.roam', 'leviathan', l.id::text, jsonb_build_object('on', p_args -> 'on'));
    when 'target', 'rampage' then
      -- any players and any plots, in order (then it carries on: hunting, roaming, or to the sea)
      v_list := private.lev_hunt_list(p_args);
      v_pts := '[]'::jsonb;
      for t in select x from jsonb_array_elements(v_list) x loop
        v_pts := v_pts || private.lev_hunt_pts(t);
      end loop;
      v_pts := (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from jsonb_array_elements(v_pts) with ordinality q(x, o) where o <= 24);
      if p_action = 'target' and jsonb_array_length(v_list) > 0 and jsonb_array_length(v_pts) = 0 then raise exception 'no_location' using errcode = 'P0001'; end if;
      if p_action = 'rampage' and jsonb_array_length(v_pts) = 0 then v_pts := private.lev_busy_spots(p, 5); end if;
      if jsonb_array_length(v_pts) = 0 then raise exception 'no_targets' using errcode = 'P0001'; end if;
      update public.leviathans set data = data - 'retreat' where id = l.id;
      if p_action = 'rampage' then
        v_min := least(greatest(coalesce((p_args ->> 'minutes')::numeric, 20), 1), 240);
        v_mult := least(greatest(coalesce((p_args ->> 'mult')::numeric, 8), 1.5), 50);
        -- (the pace to come back to: the one it had before this rampage)
        update public.leviathans set data = data || jsonb_build_object('cruise_kmh', coalesce((data ->> 'cruise_kmh')::numeric, speed_kmh)) where id = l.id;
        l := private.lev_go(l.id, v_pts, 1);
        l := private.lev_set_speed(l.id, least(greatest(private.lev_base(l) * v_mult, l.speed_kmh * 1.5), 5000));
        update public.leviathans set rampage_until = now() + make_interval(secs => (v_min * 60)::double precision) where id = l.id returning * into l;
      else
        l := private.lev_go(l.id, v_pts, 1);
      end if;
      t := v_list -> 0;
      update public.leviathans set data = data || jsonb_build_object('targets', v_pts, 'target',
               case when t is null then null
                    when t ->> 't' = 'player' then jsonb_build_object('owner_name', t ->> 'name', 'player', true, 'more', jsonb_array_length(v_list) - 1)
                    else jsonb_build_object('gx', (t ->> 'gx')::int, 'gy', (t ->> 'gy')::int, 'owner_name', t ->> 'name', 'more', jsonb_array_length(v_list) - 1) end)
       where id = l.id returning * into l;
      -- everyone it's coming for is told
      for u in select distinct x.owner_id from (
                 select (q.v ->> 'id')::uuid owner_id from jsonb_array_elements(v_list) q(v) where q.v ->> 't' = 'player'
                 union all select w.owner_id from jsonb_array_elements(v_list) q(v) join public.world_plots w on w.gx = (q.v ->> 'gx')::int and w.gy = (q.v ->> 'gy')::int where q.v ->> 't' = 'plot') x
               where x.owner_id is not null limit 30 loop
        perform private.notify(u.owner_id, 'leviathan', null, jsonb_build_object('sub', 'coming', 'gen', l.gen, 'rampage', p_action = 'rampage', 'place', l.place));
      end loop;
      perform private.audit('leviathan.' || p_action, 'leviathan', l.id::text, p_args);
    when 'tiny', 'hide' then
      v_min := least(greatest(coalesce((p_args ->> 'minutes')::numeric, 20), 0), 1440);
      l := private.lev_power(l.id, case p_action when 'tiny' then 'tiny' else 'hidden' end, v_min);
      perform private.audit('leviathan.' || p_action, 'leviathan', l.id::text, jsonb_build_object('minutes', v_min));
    when 'status' then null;
    else raise exception 'invalid_action' using errcode = 'P0001';
  end case;
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
  return private.lev_state(v_uid, true) || jsonb_build_object('cfg', private.lev_cfg(), 'hp_calc', private.lev_hp_calc(null), 'deep', private.lev_deep(v_uid),
    'pace', case when l.id is not null then private.lev_pace(l) end,
    'history', (select jsonb_agg(jsonb_build_object('gen', gen, 'status', status, 'origin', origin, 'spawned_at', spawned_at,
    'ended_at', ended_at, 'hp', hp, 'hp_max', hp_max, 'strength', strength, 'returns', coalesce((data ->> 'returns')::int, 0),
    'fighters', (select count(*) from public.leviathan_players p where p.lev_id = x.id and p.dmg > 0)) order by spawned_at desc)
    from (select * from public.leviathans order by spawned_at desc limit 12) x));
end $$;
