-- 🐉 The Leviathan, under the owner's hand — and with powers of its own. Everything here works on a Leviathan that's
-- already walking: its health, the damage everyone has done and their loot standing are never reset.
--
-- Live controls (Admin → Leviathan, in the game and on admin.landvas.app):
--  · speed: any km/h (or × its normal pace) — the change takes effect from where it stands, it doesn't jump
--  · aim it: at a player (where their explorer is, then their best plots) or at plots you pick, at its own pace or on a
--    RAMPAGE (× its pace for so many minutes, the players it's coming for are told)
--  · retreat (it heads for the sea and escapes there), stay (it turns back inland), heal (+% of its health)
--  · keep roaming at the end of its road, or escape there
--  · powers: TINY (a speck on the map: half the ink bombs miss, it tramples a narrow path) and HIDDEN (gone from the
--    map: everyone sees only a hazy area, and has to zoom in and search to find it; only those who have found it in the
--    last 15 minutes can hit it — and the Oracle Eye's move reveals it to everyone)
-- On its own it uses a power every few hours (game_config.leviathan.powers_auto / power_every_h / power_min).

alter table public.leviathans add column if not exists base_kmh numeric;
alter table public.leviathans add column if not exists tiny_until timestamptz;
alter table public.leviathans add column if not exists hidden_until timestamptz;
alter table public.leviathans add column if not exists rampage_until timestamptz;
alter table public.leviathans add column if not exists hide_seq int not null default 0;
alter table public.leviathans add column if not exists hidden_trail int;
alter table public.leviathan_players add column if not exists spotted_at timestamptz;
alter table public.leviathan_players add column if not exists found_seq int not null default 0;

-- its normal pace: what it was given when it rose (a Leviathan from before this knew it only by its current speed)
update public.leviathans set base_kmh = round(speed_kmh / case status when 'fleeing' then 1.6 when 'enraged' then 1.25 else 1 end, 3) where base_kmh is null;

create or replace function private.lev_base(l public.leviathans) returns numeric language sql immutable as $$
  select coalesce(l.base_kmh, l.speed_kmh)
$$;
create or replace function private.lev_tiny(l public.leviathans) returns boolean language sql stable as $$ select coalesce(l.tiny_until > now(), false) $$;
create or replace function private.lev_hidden(l public.leviathans) returns boolean language sql stable as $$ select coalesce(l.hidden_until > now(), false) $$;

/** a new speed from where it stands: the distance walked so far is kept, so it doesn't jump */
create or replace function private.lev_set_speed(p_id uuid, p_kmh numeric) returns public.leviathans language plpgsql as $$
declare l public.leviathans; v_new numeric := least(greatest(p_kmh, 1), 5000);
begin
  l := private.lev_fold(p_id);
  update public.leviathans set walk_s = walk_s * speed_kmh / v_new, speed_kmh = v_new where id = p_id returning * into l;
  return l;
end $$;

/** a point a little way off — never giving away where it really is (moves every 10 minutes) */
create or replace function private.lev_haze(l public.leviathans, p jsonb) returns jsonb language plpgsql stable as $$
declare v_r numeric := private.lev_n('hidden_km', 60); h text := md5(l.id::text || ':' || l.hide_seq || ':' || floor(extract(epoch from now()) / 600));
  v_a double precision := ('x' || substr(h, 1, 6))::bit(24)::int / 16777215.0 * 2 * pi();
  v_d double precision := (0.15 + 0.55 * ('x' || substr(h, 7, 6))::bit(24)::int / 16777215.0) * v_r;
  v_lat double precision := (p ->> 'lat')::float8; v_lng double precision := (p ->> 'lng')::float8; c jsonb;
begin
  c := jsonb_build_object('lat', round((v_lat + v_d * cos(v_a) / 111.32)::numeric, 3),
                          'lng', round((v_lng + v_d * sin(v_a) / (111.32 * greatest(cos(radians(v_lat)), 0.05)))::numeric, 3));
  return c || jsonb_build_object('km', v_r, 'place', private.lev_place((c ->> 'lng')::float8, (c ->> 'lat')::float8));
end $$;

/** has this player found it (in the last 15 minutes)? */
create or replace function private.lev_spotted(l public.leviathans, p_uid uuid) returns boolean language sql stable as $$
  select coalesce((select lp.spotted_at > now() - interval '15 minutes' from public.leviathan_players lp where lp.lev_id = l.id and lp.player_id = p_uid), false)
$$;

/** turn a power on (or off) */
create or replace function private.lev_power(p_id uuid, p_power text, p_min numeric) returns public.leviathans language plpgsql as $$
declare l public.leviathans; v_until timestamptz := case when p_min > 0 then now() + make_interval(secs => (least(p_min, 1440) * 60)::double precision) end;
begin
  select * into l from public.leviathans where id = p_id for update;
  if p_power = 'tiny' then
    update public.leviathans set tiny_until = v_until, roar_at = now() where id = p_id returning * into l;
  elsif p_power = 'hidden' then
    -- a new hiding: the trail stops where it vanished, and everyone has to find it again
    update public.leviathans set hidden_until = v_until, roar_at = now(),
           hide_seq = case when v_until is not null and not private.lev_hidden(l) then hide_seq + 1 else hide_seq end,
           hidden_trail = case when v_until is not null and not private.lev_hidden(l) then jsonb_array_length(trail) else hidden_trail end
     where id = p_id returning * into l;
  end if;
  return l;
end $$;

/** where a player is: their explorer, else their best plots */
create or replace function private.lev_player_spots(p_player uuid, p_n int default 3) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(pt), '[]'::jsonb) from (
    select pt from (
      select 0 o, jsonb_build_array(round(e.lng::numeric, 5), round(e.lat::numeric, 5)) pt from public.explorers e where e.player_id = p_player
      union all
      select * from (select 1 + row_number() over (order by r.sort desc, w.claimed_at desc), jsonb_build_array(round(private.lng_of(w.gx + 0.5)::numeric, 5), round(private.lat_of(w.gy + 0.5)::numeric, 5))
                       from public.world_plots w left join public.plot_rarities r on r.id = w.rarity where w.owner_id = p_player
                      order by r.sort desc nulls last, w.claimed_at desc limit greatest(p_n, 1)) q
    ) x order by o limit greatest(p_n, 1)) y
$$;

/** busy places near it (players out exploring, else the rarest plots around) — for a rampage with nobody picked */
create or replace function private.lev_busy_spots(p jsonb, p_n int) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(pt order by d), '[]'::jsonb) from (
    select jsonb_build_array(round(e.lng::numeric, 5), round(e.lat::numeric, 5)) pt,
           private.haversine_m((p ->> 'lng')::float8, (p ->> 'lat')::float8, e.lng, e.lat) d
      from public.explorers e join public.players pl on pl.id = e.player_id
     where pl.status = 'active' and pl.last_active_at > now() - interval '3 days'
       and private.haversine_m((p ->> 'lng')::float8, (p ->> 'lat')::float8, e.lng, e.lat) between 2000 and 1500000
     order by d limit greatest(p_n, 1)) x
$$;

/** send it to these places (in order), then on to the nearest sea — roaming carries on from there */
create or replace function private.lev_go(p_id uuid, p_pts jsonb, p_speed_mult numeric) returns public.leviathans language plpgsql as $$
declare l public.leviathans; v_last jsonb; v_sea jsonb;
begin
  v_last := p_pts -> (jsonb_array_length(p_pts) - 1);
  v_sea := private.lev_nearest_sea((v_last ->> 0)::float8, (v_last ->> 1)::float8);
  select * into l from public.leviathans where id = p_id;
  l := private.lev_turn(p_id, p_pts || jsonb_build_array(v_sea -> 'pt'), p_speed_mult, case when l.status = 'fleeing' then (case when l.hp <= l.hp_max * 0.5 then 'enraged' else 'walking' end) else l.status end);
  update public.leviathans set exit_sea = v_sea ->> 'name' where id = p_id returning * into l;
  return l;
end $$;

-- ---- the heartbeat: tiny tramples narrow, a rampage runs out, it uses its powers, and it roams if it's told to ------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.leviathan_tick()'::regprocedure);
  -- a tiny one tramples a narrow path
  n := replace(d, $a$      v_dc := ceil(v_r * 1000 / greatest(v_cm, 0.5))::int;$a$,
                  $a$      v_dc := ceil(v_r * (case when private.lev_tiny(l) then 0.3 else 1 end) * 1000 / greatest(v_cm, 0.5))::int;$a$);
  if n = d then raise exception 'leviathan controls: tick trample anchor not found'; end if;
  d := n;
  -- before it walks on: a rampage that has run out, and its own powers
  n := replace(d, $a$  p := private.lev_pos(l, now());
  -- trample the plots along the way since the last beat$a$,
                  $a$  -- a rampage that has run its course: back to its pace (it carries on the same way)
  if l.rampage_until is not null and l.rampage_until <= now() then
    l := private.lev_set_speed(l.id, coalesce((l.data ->> 'cruise_kmh')::numeric, private.lev_base(l)));
    update public.leviathans set rampage_until = null, data = data - 'cruise_kmh' where id = l.id returning * into l;
  end if;
  -- its own powers, every few hours: it shrinks to a speck, or vanishes from the map
  if coalesce((private.lev_cfg() ->> 'powers_auto')::boolean, true) and l.status in ('walking', 'enraged') then
    if l.data ->> 'next_power_at' is null then
      update public.leviathans set data = data || jsonb_build_object('next_power_at', now() + make_interval(secs => (random() * private.lev_n('power_every_h', 3) * 3600)::double precision))
       where id = l.id returning * into l;
    elsif (l.data ->> 'next_power_at')::timestamptz <= now() and not private.lev_tiny(l) and not private.lev_hidden(l) then
      l := private.lev_power(l.id, case when random() < 0.55 then 'tiny' else 'hidden' end, private.lev_n('power_min', 25));
      update public.leviathans set data = data || jsonb_build_object('next_power_at', now() + make_interval(secs => ((0.7 + random() * 0.6) * private.lev_n('power_every_h', 3) * 3600)::double precision))
       where id = l.id returning * into l;
    end if;
  end if;
  p := private.lev_pos(l, now());
  -- trample the plots along the way since the last beat$a$);
  if n = d then raise exception 'leviathan controls: tick powers anchor not found'; end if;
  execute n;
end $$;

-- its own say on roaming (the owner can set it per Leviathan)
create or replace function private.lev_road_end(p_id uuid) returns boolean language plpgsql as $$
declare l public.leviathans; p jsonb; r jsonb;
begin
  select * into l from public.leviathans where id = p_id for update;
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

-- a new one keeps its normal pace (and the owner's speed setting for new ones)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.lev_spawn(numeric)'::regprocedure);
  n := replace(d, $a$greatest(v_km / greatest(private.lev_n('walk_hours', 48), 1), 5),$a$, $a$greatest(v_km / greatest(private.lev_n('walk_hours', 48), 1), 5) * private.lev_n('speed_mult', 1),$a$);
  if n = d then raise exception 'leviathan controls: spawn speed anchor not found'; end if;
  d := n;
  n := replace(d, $a$          jsonb_build_object('cities', r -> 'cities'))
  returning * into l;$a$, $a$          jsonb_build_object('cities', r -> 'cities'))
  returning * into l;
  update public.leviathans set base_kmh = speed_kmh where id = l.id returning * into l;$a$);
  if n = d then raise exception 'leviathan controls: spawn base anchor not found'; end if;
  execute n;
end $$;

-- the Size Ray's move no longer only shrinks it: on a TINY Leviathan it grows it back; the Oracle reveals a hidden one
-- (both in leviathan_hit below)

-- ---- the fight --------------------------------------------------------------------------------------------------------
create or replace function public.leviathan_hit(p_move text, p_n int default 1, p_enchant uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); l public.leviathans; lp public.leviathan_players; v_bank numeric; v_n int; v_dmg bigint := 0; i int; e public.enchantments;
  m jsonb; v_lab text; v_emoji text := '💣'; v_cd numeric := private.lev_n('move_cd_h', 3) * 3600; v_eff text; v_before bigint; v_name text; v_p jsonb; v_missed int := 0;
  v_miss numeric := private.lev_n('tiny_miss', 0.5);
begin
  perform private.rate_limit('leviathan_hit', 1500, 3600);
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1 for update;
  if l.id is null then raise exception 'no_leviathan' using errcode = 'P0001'; end if;
  if l.status = 'warning' then raise exception 'not_risen' using errcode = 'P0001'; end if;
  insert into public.leviathan_players (lev_id, player_id, bombs, bombs_at) values (l.id, v_uid, private.lev_n('bombs_max', 60), now()) on conflict do nothing;
  select * into lp from public.leviathan_players where lev_id = l.id and player_id = v_uid for update;
  -- hidden: only those who've found it can hit it (the Oracle Eye can reveal it to everyone)
  if private.lev_hidden(l) and not private.lev_spotted(l, v_uid)
     and not (p_move = 'enchant' and exists (select 1 from public.enchantments x where x.id = p_enchant and x.owner_id = v_uid and x.kind = 'oracle')) then
    raise exception 'lev_hidden' using errcode = 'P0001';
  end if;
  if p_move = 'bomb' then
    v_bank := least(private.lev_n('bombs_max', 60), lp.bombs + extract(epoch from now() - lp.bombs_at) / greatest(private.lev_n('bomb_regen_s', 60), 1));
    v_n := least(greatest(coalesce(p_n, 1), 1), 10, floor(v_bank)::int);
    if v_n < 1 then raise exception 'no_bombs' using errcode = 'P0001'; end if;
    for i in 1 .. v_n loop
      -- a tiny Leviathan is hard to hit
      if private.lev_tiny(l) and random() < v_miss then v_missed := v_missed + 1;
      else v_dmg := v_dmg + 80 + floor(random() * 41)::int; end if;
    end loop;
    v_dmg := round(v_dmg * private.lev_mult(l));
    update public.leviathan_players set bombs = v_bank - v_n, bombs_at = now() where lev_id = l.id and player_id = v_uid;
    v_lab := case when v_n = 1 then 'an ink bomb' else v_n || ' ink bombs' end || case when v_missed > 0 then ' (' || v_missed || ' missed — it’s tiny)' else '' end;
  elsif p_move = 'enchant' then
    select * into e from public.enchantments where id = p_enchant and owner_id = v_uid and status = 'active';
    if e.id is null then raise exception 'bad_target' using errcode = 'P0001'; end if;
    if coalesce((lp.moves ->> e.id::text)::numeric, 0) + v_cd > extract(epoch from now()) then raise exception 'too_soon' using errcode = 'P0001'; end if;
    m := private.lev_move(e.kind);
    v_dmg := round((2500 + 400 * e.level) * ((m ->> 1)::numeric + random() * ((m ->> 2)::numeric - (m ->> 1)::numeric)) * private.lev_mult(l));
    v_eff := m ->> 3;
    case v_eff
      when 'freeze' then perform private.lev_pause(l.id, 600);
      when 'decoy' then perform private.lev_pause(l.id, 300);
      when 'pull' then perform private.lev_pause(l.id, 300);
      when 'shrink' then
        if private.lev_tiny(l) then
          -- a tiny Leviathan: the Size Ray blows it back up to its size (and it can be hit again)
          update public.leviathans set tiny_until = null where id = l.id; v_eff := 'grow';
        else update public.leviathans set shrunk_until = greatest(coalesce(shrunk_until, now()), now()) + interval '10 minutes' where id = l.id; end if;
      when 'foretell' then
        update public.leviathans set foretold_until = greatest(coalesce(foretold_until, now()), now()) + interval '10 minutes' where id = l.id;
        if private.lev_hidden(l) then update public.leviathans set hidden_until = null where id = l.id; v_eff := 'reveal'; end if;
      else null;
    end case;
    update public.leviathan_players set moves = moves || jsonb_build_object(e.id::text, extract(epoch from now())) where lev_id = l.id and player_id = v_uid;
    v_p := private.ench_partner(e.id);
    v_name := coalesce(v_p ->> 'hybrid', e.nickname, (private.ench_info(e.kind) ->> 'name'));
    v_lab := v_name || ' · ' || (m ->> 0) || case v_eff when 'reveal' then ' — and showed everyone where it hides' when 'grow' then ' — and blew it back up to size' else '' end;
    v_emoji := private.ench_info(e.kind) ->> 'emoji';
    perform private.ench_xp(e.id, 1);
    perform private.ench_event(e.id, 'leviathan', jsonb_build_object('move', m ->> 0, 'dmg', v_dmg));
  else raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  select * into l from public.leviathans where id = l.id for update;
  v_before := l.hp;
  v_dmg := least(v_dmg, l.hp);
  update public.leviathans set hp = hp - v_dmg where id = l.id returning * into l;
  update public.leviathan_players set dmg = dmg + v_dmg, hits = hits + case when v_dmg > 0 then 1 else 0 end where lev_id = l.id and player_id = v_uid;
  if v_dmg > 0 or p_move = 'enchant' then
    insert into public.leviathan_hits (lev_id, player_id, move, label, emoji, dmg) values (l.id, v_uid, p_move, v_lab, v_emoji, v_dmg);
  end if;
  -- (the feed keeps its last 400 hits)
  if random() < 0.02 then delete from public.leviathan_hits where lev_id = l.id and id < (select id from public.leviathan_hits where lev_id = l.id order by id desc offset 400 limit 1); end if;
  if l.hp <= 0 then perform private.lev_fall(l.id);
  elsif (v_before > l.hp_max * 0.5 and l.hp <= l.hp_max * 0.5) or (v_before > l.hp_max * 0.1 and l.hp <= l.hp_max * 0.1) then perform private.lev_phase(l.id);
  end if;
  return jsonb_build_object('dmg', v_dmg, 'effect', v_eff, 'label', v_lab, 'fell', l.hp <= 0, 'missed', v_missed) || public.leviathan_state(false);
end $$;

-- ---- searching for a hidden Leviathan -----------------------------------------------------------------------------------
/** look at this part of the map: is it here? (only when you're zoomed in — and it tells you if you're getting warm) */
create or replace function public.leviathan_seek(p_west double precision, p_south double precision, p_east double precision, p_north double precision) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); l public.leviathans; p jsonb; v_w numeric; v_d numeric; v_found boolean; v_ink int := 0; v_first boolean := false;
begin
  perform private.rate_limit('leviathan_seek', 900, 3600);
  select * into l from public.leviathans where status in ('walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
  if l.id is null then return jsonb_build_object('none', true); end if;
  if not private.lev_hidden(l) then return jsonb_build_object('hidden', false); end if;
  if private.lev_spotted(l, v_uid) then return jsonb_build_object('hidden', true, 'found', true, 'spotted', true); end if;
  -- how wide the view is (across its middle)
  v_w := private.haversine_m(p_west, (p_south + p_north) / 2, p_east, (p_south + p_north) / 2) / 1000;
  if v_w > private.lev_n('seek_km', 90) or p_east < p_west or p_north < p_south then return jsonb_build_object('hidden', true, 'too_wide', true, 'max_km', private.lev_n('seek_km', 90)); end if;
  p := private.lev_pos(l, now());
  v_found := (p ->> 'lng')::float8 between p_west and p_east and (p ->> 'lat')::float8 between p_south and p_north;
  v_d := private.haversine_m((p_west + p_east) / 2, (p_south + p_north) / 2, (p ->> 'lng')::float8, (p ->> 'lat')::float8) / 1000;
  if not v_found then
    return jsonb_build_object('hidden', true, 'found', false, 'hint', case when v_d < 25 then 'hot' when v_d < 75 then 'warm' else 'cold' end);
  end if;
  insert into public.leviathan_players (lev_id, player_id, bombs, bombs_at, spotted_at) values (l.id, v_uid, private.lev_n('bombs_max', 60), now(), now())
  on conflict (lev_id, player_id) do update set spotted_at = now();
  if (select found_seq from public.leviathan_players where lev_id = l.id and player_id = v_uid) < l.hide_seq then
    v_first := not exists (select 1 from public.leviathan_players where lev_id = l.id and found_seq = l.hide_seq);
    update public.leviathan_players set found_seq = l.hide_seq where lev_id = l.id and player_id = v_uid;
    v_ink := private.grant_ink_paced(v_uid, case when v_first then 40 else 15 end, 'leviathan', 'found', l.id::text, 'lev_found:' || l.id || ':' || l.hide_seq || ':' || v_uid);
    if v_first then perform private.lev_feed(v_uid, jsonb_build_object('sub', 'found', 'gen', l.gen, 'place', private.lev_place((p ->> 'lng')::float8, (p ->> 'lat')::float8))); end if;
  end if;
  return jsonb_build_object('hidden', true, 'found', true, 'first', v_first, 'ink', v_ink);
end $$;
revoke all on function public.leviathan_seek(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.leviathan_seek(double precision, double precision, double precision, double precision) to authenticated;

-- ---- what a screen sees (a hidden one is only a hazy area, unless you've found it) ------------------------------------
create or replace function private.lev_state(p_uid uuid, p_reveal boolean) returns jsonb language plpgsql stable as $$
declare v_uid uuid := p_uid; l public.leviathans; v_last public.leviathans; lp public.leviathan_players; v_me jsonb; v_moves jsonb; v_bank numeric;
  v_hide boolean := false; v_pos jsonb; v_haze jsonb; v_lev jsonb;
begin
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
  select * into v_last from public.leviathans where status in ('fallen', 'escaped') order by ended_at desc nulls last limit 1;
  if v_uid is not null and l.id is not null then
    select * into lp from public.leviathan_players where lev_id = l.id and player_id = v_uid;
    v_bank := least(private.lev_n('bombs_max', 60), coalesce(lp.bombs, private.lev_n('bombs_max', 60)) + case when lp.lev_id is null then 0 else extract(epoch from now() - lp.bombs_at) / greatest(private.lev_n('bomb_regen_s', 60), 1) end);
    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'serial', e.serial, 'level', e.level, 'sigil', e.sigil,
             'name', coalesce(private.ench_partner(e.id) ->> 'hybrid', e.nickname, (private.ench_info(e.kind) ->> 'name') || ' #' || e.serial),
             'move', private.lev_move(e.kind) ->> 0, 'effect', private.lev_move(e.kind) ->> 3,
             'dmg', round((2500 + 400 * e.level) * ((private.lev_move(e.kind) ->> 1)::numeric + (private.lev_move(e.kind) ->> 2)::numeric) / 2),
             'ready_in', greatest(0, round(coalesce((lp.moves ->> e.id::text)::numeric, 0) + private.lev_n('move_cd_h', 3) * 3600 - extract(epoch from now()))))
             order by e.born_at), '[]'::jsonb)
      into v_moves from public.enchantments e where e.owner_id = v_uid and e.status = 'active';
    v_me := jsonb_build_object('dmg', coalesce(lp.dmg, 0), 'hits', coalesce(lp.hits, 0), 'bombs', floor(v_bank), 'bombs_max', private.lev_n('bombs_max', 60),
      'bomb_regen_s', private.lev_n('bomb_regen_s', 60), 'next_bomb_in', case when v_bank < private.lev_n('bombs_max', 60) then round((1 - (v_bank - floor(v_bank))) * private.lev_n('bomb_regen_s', 60)) end,
      'moves', v_moves,
      'rank', case when coalesce(lp.dmg, 0) > 0 then (select count(*) + 1 from public.leviathan_players x where x.lev_id = l.id and x.dmg > lp.dmg) end,
      'trampled', (select count(*) from public.leviathan_trampled t where t.lev_id = l.id and t.owner_id = v_uid and t.until > now() and t.scrubbed_at is null),
      'spotted', coalesce(lp.spotted_at > now() - interval '15 minutes', false));
  end if;
  if l.id is not null then
    v_pos := private.lev_pos(l, now());
    v_hide := private.lev_hidden(l) and l.status <> 'warning' and not p_reveal and not (v_uid is not null and private.lev_spotted(l, v_uid));
    if v_hide then v_haze := private.lev_haze(l, v_pos); end if;
    v_lev := jsonb_build_object('id', l.id, 'gen', l.gen, 'status', l.status, 'strength', l.strength, 'hp', l.hp, 'hp_max', l.hp_max,
             'path', case when v_hide then null else l.path end, 'path_km', l.path_km, 'speed_kmh', l.speed_kmh, 'base_kmh', private.lev_base(l),
             'walk_s', l.walk_s, 'walk_at', l.walk_at, 'pause_until', l.pause_until,
             'rise_at', l.rise_at, 'spawned_at', l.spawned_at, 'origin', l.origin, 'exit_sea', l.exit_sea,
             'place', case when v_hide then v_haze ->> 'place' else l.place end,
             'trail', case when v_hide then coalesce((select jsonb_agg(t order by i) from jsonb_array_elements(l.trail) with ordinality x(t, i) where i <= coalesce(l.hidden_trail, 0)), '[]'::jsonb) else l.trail end,
             'shrunk_until', l.shrunk_until, 'foretold_until', l.foretold_until, 'roar_at', l.roar_at,
             'target', case when v_hide then null else l.data -> 'target' end, 'targets', case when v_hide then null else l.data -> 'targets' end, 'cities', l.data -> 'cities',
             'tiny_until', case when private.lev_tiny(l) then l.tiny_until end, 'hidden_until', case when private.lev_hidden(l) then l.hidden_until end,
             'rampage_until', case when l.rampage_until > now() then l.rampage_until end,
             'hidden', v_hide, 'haze', v_haze,
             'roam', coalesce((l.data ->> 'roam')::boolean, (private.lev_cfg() ->> 'roam')::boolean, true), 'retreat', coalesce((l.data ->> 'retreat')::boolean, false),
             'pos', case when v_hide then v_haze || jsonb_build_object('km', 0, 'seg', 0, 'heading', 0, 'done', false, 'paused', false, 'haze', true) else v_pos end,
             'fighters', (select count(*) from public.leviathan_players where lev_id = l.id and dmg > 0));
    if p_reveal then v_lev := v_lev || jsonb_build_object('next_power_at', l.data -> 'next_power_at', 'cruise_kmh', l.data -> 'cruise_kmh', 'true_place', l.place); end if;
  end if;
  return jsonb_build_object(
    'server_time', now(),
    'lev', v_lev,
    'feed', case when l.id is not null then coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name', pr.username, 'label', h.label, 'emoji', h.emoji, 'dmg', h.dmg, 'at', h.created_at, 'move', h.move) order by h.id desc)
             from (select * from public.leviathan_hits where lev_id = l.id order by id desc limit 25) h left join public.profiles pr on pr.id = h.player_id), '[]'::jsonb) end,
    'top', case when l.id is not null then coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(x.player_id), 'dmg', x.dmg, 'me', x.player_id = v_uid) order by x.dmg desc)
             from (select * from public.leviathan_players where lev_id = l.id and dmg > 0 order by dmg desc limit 10) x), '[]'::jsonb) end,
    'me', v_me,
    'last', case when v_last.id is not null then jsonb_build_object('id', v_last.id, 'gen', v_last.gen, 'status', v_last.status, 'ended_at', v_last.ended_at, 'place', v_last.place,
             'hp', v_last.hp, 'hp_max', v_last.hp_max, 'strength', v_last.strength, 'exit_sea', v_last.exit_sea,
             'fighters', (select count(*) from public.leviathan_players where lev_id = v_last.id and dmg > 0),
             'top', (select jsonb_agg(jsonb_build_object('player', private.profile_json(x.player_id), 'dmg', x.dmg) order by x.dmg desc)
                      from (select * from public.leviathan_players where lev_id = v_last.id and dmg > 0 order by dmg desc limit 3) x),
             'loot', (select jsonb_build_object('loot', loot, 'seen', loot_seen, 'dmg', dmg) from public.leviathan_players where lev_id = v_last.id and player_id = v_uid)) end,
    'next_at', case when l.id is null and coalesce((private.lev_cfg() ->> 'enabled')::boolean, true) then private.lev_next_at() end,
    'bones', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'gen', b.gen, 'lng', b.lng, 'lat', b.lat, 'at', b.fallen_at, 'place', b.place, 'players', b.players, 'top', b.top_name) order by b.id)
             from (select * from public.leviathan_bones order by id desc limit 100) b), '[]'::jsonb));
end $$;

create or replace function public.leviathan_state(p_tick boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.leviathans;
begin
  -- the heartbeat also beats when people look (no more than every 30 s)
  if p_tick then
    select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1;
    if (l.id is not null and (l.last_tick is null or l.last_tick < now() - interval '30 seconds')) or (l.id is null and now() >= private.lev_next_at()) then
      perform private.leviathan_tick();
    end if;
  end if;
  return private.lev_state(auth.uid(), false);
end $$;

-- ---- the owner's controls ----------------------------------------------------------------------------------------------
/** places to send it: a player (their explorer, then their best plots) and/or plots, given as [[gx, gy], …] */
create or replace function private.lev_aim(p_args jsonb, p jsonb) returns jsonb language plpgsql stable as $$
declare v_pts jsonb := '[]'::jsonb; v_who uuid; v_name text; c jsonb;
begin
  if nullif(p_args ->> 'player', '') is not null then
    select pr.id, pr.username into v_who, v_name from public.profiles pr
     where pr.id::text = p_args ->> 'player' or lower(pr.username) = lower(ltrim(p_args ->> 'player', '@')) limit 1;
    if v_who is null then raise exception 'player_not_found' using errcode = 'P0001'; end if;
    v_pts := private.lev_player_spots(v_who, 3);
    if jsonb_array_length(v_pts) = 0 then raise exception 'no_location' using errcode = 'P0001'; end if;
  end if;
  for c in select value from jsonb_array_elements(coalesce(p_args -> 'plots', '[]'::jsonb)) limit 12 loop
    v_pts := v_pts || jsonb_build_array(jsonb_build_array(round(private.lng_of((c ->> 0)::int + 0.5)::numeric, 5), round(private.lat_of((c ->> 1)::int + 0.5)::numeric, 5)));
  end loop;
  return jsonb_build_object('pts', v_pts, 'player', v_who, 'name', v_name);
end $$;

create or replace function public.admin_leviathan(p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['owner']); l public.leviathans; p jsonb; a jsonb; v_pts jsonb; v_kmh numeric; v_min numeric; v_mult numeric; v_sea jsonb;
  v_heal bigint; u record; v_live boolean;
begin
  if not private.has_role(v_uid, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into l from public.leviathans where status in ('warning', 'walking', 'enraged', 'fleeing') order by spawned_at desc limit 1 for update;
  v_live := l.id is not null;
  if p_action not in ('summon', 'status') and not v_live then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_action in ('speed', 'target', 'rampage', 'retreat', 'stay', 'tiny', 'hide') and l.status = 'warning' then raise exception 'not_risen' using errcode = 'P0001'; end if;
  if v_live then p := private.lev_pos(l, now()); end if;
  case p_action
    when 'summon' then
      if v_live then raise exception 'leviathan_active' using errcode = 'P0001'; end if;
      l := private.lev_spawn(least(greatest(coalesce((p_args ->> 'warn_min')::numeric, 60), 0), 1440));
      perform private.audit('leviathan.summon', 'leviathan', l.id::text, jsonb_build_object('warn_min', p_args -> 'warn_min', 'origin', l.origin));
    when 'dismiss' then
      update public.leviathans set status = 'ended', ended_at = now() where id = l.id returning * into l;
      perform private.audit('leviathan.dismiss', 'leviathan', l.id::text, '{}'::jsonb);
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
      -- back to the sea, and away (no more roaming)
      v_sea := private.lev_nearest_sea((p ->> 'lng')::float8, (p ->> 'lat')::float8);
      if l.rampage_until > now() then l := private.lev_set_speed(l.id, coalesce((l.data ->> 'cruise_kmh')::numeric, private.lev_base(l))); end if;
      update public.leviathans set rampage_until = null, data = data - 'cruise_kmh' - 'target' - 'targets' || jsonb_build_object('retreat', true) where id = l.id;
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
      a := private.lev_aim(p_args, p);
      v_pts := a -> 'pts';
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
      update public.leviathans set data = data || jsonb_build_object('targets', v_pts, 'target',
               case when a ->> 'name' is not null then jsonb_build_object('owner_name', a ->> 'name', 'player', true)
                    when jsonb_array_length(coalesce(p_args -> 'plots', '[]'::jsonb)) > 0 then jsonb_build_object('gx', (p_args -> 'plots' -> 0 ->> 0)::int, 'gy', (p_args -> 'plots' -> 0 ->> 1)::int,
                         'owner_name', (select pr.username from public.world_plots w join public.profiles pr on pr.id = w.owner_id where w.gx = (p_args -> 'plots' -> 0 ->> 0)::int and w.gy = (p_args -> 'plots' -> 0 ->> 1)::int))
                    else null end)
       where id = l.id returning * into l;
      -- the players it's coming for are told
      for u in select distinct x.owner_id from (
                 select (a ->> 'player')::uuid owner_id
                 union all select w.owner_id from jsonb_array_elements(coalesce(p_args -> 'plots', '[]'::jsonb)) as c(v) join public.world_plots w on w.gx = (c.v ->> 0)::int and w.gy = (c.v ->> 1)::int) x
               where x.owner_id is not null limit 20 loop
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
  return private.lev_state(v_uid, true) || jsonb_build_object('cfg', private.lev_cfg(), 'history', (select jsonb_agg(jsonb_build_object('gen', gen, 'status', status, 'origin', origin, 'spawned_at', spawned_at,
    'ended_at', ended_at, 'hp', hp, 'hp_max', hp_max, 'strength', strength, 'fighters', (select count(*) from public.leviathan_players p where p.lev_id = x.id and p.dmg > 0)) order by spawned_at desc)
    from (select * from public.leviathans order by spawned_at desc limit 12) x));
end $$;

-- the new settings are checked before they're saved
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_config_set(text,jsonb)'::regprocedure);
  n := replace(d, $a$    or coalesce((p_value ->> 'loot_cap')::numeric, 1500) not between 0 and 1000000) then$a$,
                  $a$    or coalesce((p_value ->> 'loot_cap')::numeric, 1500) not between 0 and 1000000
    or jsonb_typeof(coalesce(p_value -> 'roam', 'true'::jsonb)) <> 'boolean'
    or jsonb_typeof(coalesce(p_value -> 'powers_auto', 'true'::jsonb)) <> 'boolean'
    or coalesce((p_value ->> 'power_every_h')::numeric, 3) not between 0.1 and 168
    or coalesce((p_value ->> 'power_min')::numeric, 25) not between 1 and 1440
    or coalesce((p_value ->> 'tiny_miss')::numeric, 0.5) not between 0 and 0.95
    or coalesce((p_value ->> 'hidden_km')::numeric, 60) not between 5 and 2000
    or coalesce((p_value ->> 'seek_km')::numeric, 90) not between 5 and 5000
    or coalesce((p_value ->> 'speed_mult')::numeric, 1) not between 0.1 and 50
    or coalesce((p_value ->> 'trample_km')::numeric, 1.2) not between 0.05 and 50
    or coalesce((p_value ->> 'trample_hours')::numeric, 2) not between 0.1 and 72) then$a$);
  if n = d then raise exception 'leviathan controls: admin_config_set anchor not found'; end if;
  execute n;
end $$;
