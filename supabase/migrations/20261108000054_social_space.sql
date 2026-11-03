-- v0.36 Social space.
--  * Planet Ink is capped per world: up to 100 a day on each world (games, meteorites, digging).
--  * Settling a far-off world as your home costs 1,000 Ink (and can't take someone else's home).
--  * Friends: see where each friend is and what they're up to (on the Moon, digging, in a game…),
--    and warp straight to any friend who's out on another world — you land next to them, in their
--    live group if it has room. The same works from the live feed for anyone exploring with room.
--  * The live feed shows far more: planet plots bought (with their rarity), worlds settled,
--    explorers heading out (with a Join button while their group has room), playdates (with a Visit
--    button), and layers reached when digging.

update public.game_config set value = value || '{"daily_cap": 100, "cap_per_world": true}'::jsonb where key = 'planets';
update public.game_config set value = value || '{"settle_ink": 1000}'::jsonb where key = 'space';

alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig'));

-- ---- planet Ink per world --------------------------------------------------------------------------
create table if not exists public.planet_ink_days (
  player_id uuid not null references public.players (id) on delete cascade,
  world text not null, day timestamptz not null, ink int not null default 0,
  primary key (player_id, world, day)
);
alter table public.planet_ink_days enable row level security;
revoke all on public.planet_ink_days from anon, authenticated;

create or replace function private.planet_ink_today(p_uid uuid, p_world text) returns int language sql stable as $$
  select coalesce((select ink from public.planet_ink_days where player_id = p_uid and world = p_world and day = private.day_start(now())), 0)
$$;

/** Pay planet Ink, up to the day's cap on this world. */
create or replace function private.planet_pay_world(p_uid uuid, p_world text, p_amount int, p_ref text, p_idem text) returns int
language plpgsql as $$
declare v_day timestamptz := private.day_start(now()); v_cap int := coalesce((private.planet_cfg() ->> 'daily_cap')::int, 100); v_had int; v_pay int;
begin
  if p_amount <= 0 then return 0; end if;
  insert into public.planet_ink_days (player_id, world, day) values (p_uid, p_world, v_day) on conflict do nothing;
  select ink into v_had from public.planet_ink_days where player_id = p_uid and world = p_world and day = v_day for update;
  v_pay := least(p_amount, greatest(0, v_cap - v_had));
  if v_pay > 0 then
    update public.planet_ink_days set ink = ink + v_pay where player_id = p_uid and world = p_world and day = v_day;
    perform private.grant(p_uid, jsonb_build_object('ink', v_pay), 'space', 'planet', p_ref, p_idem);
  end if;
  return v_pay;
end $$;

-- ---- settling costs 1,000 Ink ----------------------------------------------------------------------
create or replace function public.space_settle(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.space_pilots%rowtype; v_name text := btrim(coalesce(p_name, ''));
  v_cost int := coalesce((private.space_cfg() ->> 'settle_ink')::int, 1000); v_seed int;
begin
  s := private.space_pilot(v_uid);
  if s.dest is not null or s.location not like 'exo:%' then raise exception 'not_on_a_world' using errcode = 'P0001'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 32 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  v_seed := substr(s.location, 5)::int; -- the world you're standing on
  if s.home_seed = v_seed then raise exception 'already_home' using errcode = 'P0001'; end if;
  if exists (select 1 from public.space_pilots where home_seed = v_seed and player_id <> v_uid) then raise exception 'world_taken' using errcode = 'P0001'; end if;
  perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'space_settle', 'space', s.location, 'space-settle:' || v_uid || ':' || v_seed);
  update public.space_pilots set home_seed = v_seed, exo_seed = v_seed, home_name = v_name, updated_at = now() where player_id = v_uid returning * into s;
  insert into public.feed_events (kind, player_id, data) values ('settle', v_uid, jsonb_build_object('seed', s.home_seed, 'name', v_name));
  return private.space_json(s) || jsonb_build_object('settle_paid', v_cost);
end $$;

-- ---- what friends are up to ------------------------------------------------------------------------
create table if not exists public.player_activity (
  player_id uuid primary key references public.players (id) on delete cascade,
  kind text not null, detail jsonb not null default '{}'::jsonb, at timestamptz not null default now()
);
alter table public.player_activity enable row level security;
revoke all on public.player_activity from anon, authenticated;

/** The app says what you're doing (the screen you're on), so friends can see it. */
create or replace function public.set_activity(p_kind text, p_detail jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('set_activity', 600, 3600);
  if p_kind not in ('map', 'planet', 'dig', 'space', 'game', 'inkborn', 'sanctuary', 'playdate', 'create', 'gallery', 'social', 'other') then
    raise exception 'invalid_activity' using errcode = 'P0001';
  end if;
  if octet_length(coalesce(p_detail, '{}'::jsonb)::text) > 400 then raise exception 'invalid_activity' using errcode = 'P0001'; end if;
  insert into public.player_activity (player_id, kind, detail, at) values (v_uid, p_kind, coalesce(p_detail, '{}'::jsonb), now())
  on conflict (player_id) do update set kind = excluded.kind, detail = excluded.detail, at = now();
  return jsonb_build_object('ok', true);
end $$;

/** A live group someone is in on a world, and whether it has room. */
create or replace function private.room_json(p_uid uuid, p_world text) returns jsonb language sql stable as $$
  select coalesce((
    select jsonb_build_object('live', true, 'in_room', (select count(*) from public.planet_presence q where q.world = p.world and q.shard = p.shard and q.seen_at > now() - interval '15 seconds'),
                              'room_size', coalesce((private.planet_cfg() -> 'live' ->> 'group_size')::int, 10))
    from public.planet_presence p where p.player_id = p_uid and p.world = p_world and p.seen_at > now() - interval '15 seconds'), jsonb_build_object('live', false))
$$;

/** Where a player is and what they're doing (for their friends). */
create or replace function private.whereabouts(p_uid uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'online', coalesce(a.at > now() - interval '3 minutes', false) or exists (select 1 from public.planet_presence q where q.player_id = p_uid and q.seen_at > now() - interval '30 seconds'),
    'activity', case when a.at > now() - interval '3 minutes' then jsonb_build_object('kind', a.kind, 'detail', a.detail, 'at', a.at) else null end,
    'space', case when s.player_id is null then null else jsonb_build_object('location', s.location, 'dest', s.dest, 'arrive_at', s.arrive_at,
               'home_seed', s.home_seed, 'home_name', s.home_name, 'at_home', s.home_seed is not null and s.location = 'exo:' || s.home_seed) end,
    'room', case when s.location <> 'earth' and s.dest is null then private.room_json(p_uid, s.location) else null end)
  from (select p_uid id) x left join public.player_activity a on a.player_id = p_uid left join public.space_pilots s on s.player_id = p_uid
$$;

/** Warp to someone out on another world — a friend, or anyone whose live group has room — and land next to them. */
create or replace function public.space_warp_to_player(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); me public.space_pilots%rowtype; them public.space_pilots%rowtype;
  v_friend boolean; pr public.planet_presence%rowtype; v_in int; v_max int := coalesce((private.planet_cfg() -> 'live' ->> 'group_size')::int, 10);
  v_d float8[]; v_spawn jsonb := null;
begin
  perform private.rate_limit('space_launch', 240, 3600);
  if p_player = v_uid then raise exception 'invalid_target' using errcode = 'P0001'; end if;
  if not private.visible_to(p_player, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  me := private.space_pilot(v_uid);
  if cardinality(me.parts) < 4 then raise exception 'rocket_not_built' using errcode = 'P0001'; end if;
  select * into them from public.space_pilots where player_id = p_player;
  if not found or them.location = 'earth' or them.dest is not null then raise exception 'not_in_space' using errcode = 'P0001'; end if;
  v_friend := private.friend_state(v_uid, p_player) = 'friends';
  -- where they are (their last known spot on this world), and whether their live group is still live
  select * into pr from public.planet_presence where player_id = p_player and world = them.location;
  if pr.player_id is not null and pr.seen_at > now() - interval '15 seconds' then
    select count(*) into v_in from public.planet_presence where world = pr.world and shard = pr.shard and seen_at > now() - interval '15 seconds' and player_id <> v_uid;
  else
    v_in := null;
  end if;
  -- a far-off world (someone's home) only with friends; anyone else only into a live group with room
  if them.location like 'exo:%' and not v_friend then raise exception 'not_friends' using errcode = 'P0001'; end if;
  if not v_friend and (v_in is null or v_in >= v_max) then raise exception 'room_full' using errcode = 'P0001'; end if;
  -- warp there (free and instant), and join their live group if it has room
  update public.space_pilots set location = them.location, dest = null, depart_at = null, arrive_at = null, exo_seed = coalesce(them.exo_seed, exo_seed),
         visited = case when them.location = any(visited) then visited else visited || them.location end, launches = launches + 1, updated_at = now()
   where player_id = v_uid returning * into me;
  if pr.player_id is not null then
    v_d := pr.d;
    if v_in is not null and v_in < v_max then
      insert into public.planet_presence (player_id, world, shard, d, face, hop, joined_at, seen_at)
      values (v_uid, pr.world, pr.shard, pr.d, pr.face, 0, now(), now())
      on conflict (player_id) do update set world = excluded.world, shard = excluded.shard, d = excluded.d, face = excluded.face, hop = 0, joined_at = now(), seen_at = now();
    end if;
    v_spawn := jsonb_build_object('d', to_jsonb(v_d), 'player', p_player);
  end if;
  return private.space_json(me) || jsonb_build_object('warped', true, 'spawn', v_spawn, 'with', private.profile_json(p_player));
end $$;

-- ---- feed: planet plots ------------------------------------------------------------------------------
create or replace function private.feed_planet_plot_trg() returns trigger language plpgsql as $$
begin
  insert into public.feed_events (kind, player_id, data) values ('planet_plot', new.owner_id, jsonb_build_object('world', new.world, 'rarity', new.rarity));
  return null;
end $$;
drop trigger if exists planet_plots_feed on public.planet_plots;
create trigger planet_plots_feed after insert on public.planet_plots for each row execute function private.feed_planet_plot_trg();

/** Friends' home worlds (and the newest worlds settled by anyone), for mission control. */
create or replace function public.space_worlds_social() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return jsonb_build_object(
    'friends', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(s.player_id), 'now', private.whereabouts(s.player_id)) order by s.updated_at desc), '[]'::jsonb)
                from public.space_pilots s where private.friend_state(v_uid, s.player_id) = 'friends' and private.visible_to(s.player_id, v_uid)
                  and (s.home_seed is not null or s.location <> 'earth')),
    'new_worlds', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(f.player_id), 'seed', (f.data ->> 'seed')::int, 'name', f.data ->> 'name', 'at', f.created_at) order by f.id desc), '[]'::jsonb)
                   from (select * from public.feed_events where kind = 'settle' and private.visible_to(player_id, v_uid) order by id desc limit 12) f));
end $$;

create or replace function public.planet_game_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v public.planet_games%rowtype; g jsonb; v_secs numeric; v_score int; v_ink int := 0; v_paid int := 0;
  v_mult numeric := 1;
begin
  select * into v from public.planet_games where id = p_session for update;
  if not found or v.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if v.finished_at is not null then return jsonb_build_object('score', v.score, 'paid', v.ink, 'repeat', true); end if;
  g := private.planet_cfg() -> 'games' -> v.game;
  v_secs := extract(epoch from (now() - v.started_at));
  if v_secs < coalesce((g ->> 'seconds')::int, 45) * 0.85 then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((g ->> 'max_score')::int, 100)));
  select private.rarity_mult(rarity) into v_mult from public.planet_plots where world = v.world and gx = v.gx and gy = v.gy and owner_id = v_uid;
  v_mult := coalesce(v_mult, 1);
  if v.rewarded and v_secs <= 1800 then
    v_ink := floor(least(coalesce((g ->> 'max_ink')::int, 25), floor(v_score / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 5)))) * v_mult)::int;
    v_paid := private.planet_pay_world(v_uid, v.world, v_ink, v.id::text, 'pgame:' || v.id);
  end if;
  update public.planet_games set finished_at = now(), score = v_score, ink = v_paid where id = v.id;
  return jsonb_build_object('score', v_score, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink, 'rewarded', v.rewarded, 'mult', v_mult, 'balances', private.balances(v_uid),
    'best', (select max(score) from public.planet_games where owner_id = v_uid and game = v.game and finished_at is not null));
end $$;

create or replace function public.planet_meteor_grab(p_world text, p_idx int, p_d jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m jsonb := private.planet_cfg() -> 'meteors'; s public.space_pilots%rowtype;
  v_every int := coalesce((m ->> 'every_minutes')::int, 10) * 60; v_win bigint := floor(extract(epoch from now()) / v_every);
  v_r float8 := private.planet_radius(p_world);
  met record; v_here float8[]; v_dist float8; v_ink int; v_paid int;
begin
  perform private.rate_limit('planet_meteor', 300, 3600);
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  select * into met from private.meteor_list(p_world, v_win) where idx = p_idx;
  if not found then raise exception 'meteor_gone' using errcode = 'P0001'; end if;
  -- where you are: what you report now if it agrees with your last heartbeat, else the heartbeat
  select d into v_here from public.planet_presence where player_id = v_uid and world = p_world and seen_at > now() - interval '30 seconds';
  if v_here is null then raise exception 'too_far' using errcode = 'P0001'; end if;
  if private.unit3(p_d) is not null and acos(least(1, greatest(-1, v_here[1] * (private.unit3(p_d))[1] + v_here[2] * (private.unit3(p_d))[2] + v_here[3] * (private.unit3(p_d))[3]))) * v_r < 40 then
    v_here := private.unit3(p_d);
  end if;
  v_dist := acos(least(1, greatest(-1, v_here[1] * met.d[1] + v_here[2] * met.d[2] + v_here[3] * met.d[3]))) * v_r;
  if v_dist > coalesce((m ->> 'reach_m')::int, 22) then raise exception 'too_far' using errcode = 'P0001', detail = round(v_dist)::text; end if;
  v_ink := case when met.golden then coalesce((m ->> 'golden_ink')::int, 20)
           else coalesce((m ->> 'ink_min')::int, 3) + floor(private.h01(p_world || ':' || v_win || ':' || p_idx || ':i') * (coalesce((m ->> 'ink_max')::int, 8) - coalesce((m ->> 'ink_min')::int, 3) + 1))::int end;
  insert into public.planet_meteors (world, win, idx, player_id, ink) values (p_world, v_win, p_idx, v_uid, 0) on conflict do nothing;
  if not found then raise exception 'meteor_taken' using errcode = 'P0001'; end if;
  v_paid := private.planet_pay_world(v_uid, p_world, v_ink, p_world || ':' || v_win || ':' || p_idx, 'meteor:' || p_world || ':' || v_win || ':' || p_idx);
  update public.planet_meteors set ink = v_paid where world = p_world and win = v_win and idx = p_idx;
  return jsonb_build_object('paid', v_paid, 'earned', v_ink, 'golden', met.golden, 'capped', v_paid < v_ink, 'balances', private.balances(v_uid));
end $$;

create or replace function public.planet_dig(p_world text, p_taps int, p_d jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.mine_cfg(); m public.planet_miners%rowtype; s public.space_pilots%rowtype;
  sh public.planet_shafts%rowtype; v_taps int; v_allowed numeric; v_power int; v_depth numeric; v_layers jsonb := c -> 'layers'; v_n int;
  v_layer jsonb; v_li int; v_left numeric; v_finds jsonb := '{}'::jsonb; v_new int := 0; v_ink int := 0; i int; f record; v_roll numeric; v_tot numeric; v_acc numeric; v_item text;
  v_first jsonb := '[]'::jsonb;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  m := private.miner(v_uid);
  -- no faster than a person can tap (a little slack for the first batch)
  v_allowed := case when m.last_dig_at is null then 12 else extract(epoch from now() - m.last_dig_at) * coalesce((c ->> 'taps_per_second')::numeric, 6) + 3 end;
  v_taps := least(greatest(coalesce(p_taps, 0), 0), 30, floor(v_allowed)::int, floor(m.energy / coalesce((c -> 'energy' ->> 'per_tap')::numeric, 1))::int);
  if v_taps <= 0 then
    if m.energy < 1 then raise exception 'no_energy' using errcode = 'P0001'; end if;
    return private.dig_json(v_uid, p_world) || jsonb_build_object('dug', 0, 'finds', '{}'::jsonb);
  end if;
  insert into public.planet_shafts (player_id, world, d) values (v_uid, p_world, private.unit3(p_d)) on conflict do nothing;
  select * into sh from public.planet_shafts where player_id = v_uid and world = p_world for update;
  v_power := private.best_power(m);
  v_n := jsonb_array_length(v_layers);
  v_depth := sh.depth;
  for i in 1 .. v_taps loop
    -- which layer you're in (the deepest keeps going)
    v_li := 0;
    while v_li < v_n - 1 and v_depth >= (v_layers -> v_li ->> 'to')::numeric loop v_li := v_li + 1; end loop;
    v_layer := v_layers -> v_li;
    v_depth := least((v_layers -> (v_n - 1) ->> 'to')::numeric, v_depth + v_power::numeric / (v_layer ->> 'hardness')::numeric);
    if random() < coalesce((c ->> 'find_chance')::numeric, 0.32) then
      select sum(value::numeric) into v_tot from jsonb_each_text(v_layer -> 'finds');
      v_roll := random() * v_tot; v_acc := 0; v_item := null;
      for f in select key, value::numeric w from jsonb_each_text(v_layer -> 'finds') loop
        v_acc := v_acc + f.w; if v_roll < v_acc then v_item := f.key; exit; end if;
      end loop;
      if v_item is not null then v_finds := v_finds || jsonb_build_object(v_item, coalesce((v_finds ->> v_item)::int, 0) + 1); end if;
    end if;
  end loop;
  -- layers reached for the first time pay Ink
  for v_li in 0 .. v_n - 1 loop
    if v_depth > (case when v_li = 0 then 0 else (v_layers -> (v_li - 1) ->> 'to')::numeric end) and v_li + 1 > sh.layers_reached then
      v_new := v_li + 1; v_ink := v_ink + coalesce((v_layers -> v_li ->> 'first_ink')::int, 0);
      v_first := v_first || jsonb_build_array(v_layers -> v_li ->> 'id');
    end if;
  end loop;
  update public.planet_shafts set depth = v_depth, layers_reached = greatest(layers_reached, v_new), updated_at = now(),
         d = coalesce(d, private.unit3(p_d)) where player_id = v_uid and world = p_world;
  update public.planet_miners set energy = m.energy - v_taps * coalesce((c -> 'energy' ->> 'per_tap')::numeric, 1), last_dig_at = now(), taps = taps + v_taps
   where player_id = v_uid;
  for f in select key, value::int n from jsonb_each_text(v_finds) loop
    insert into public.planet_items (player_id, item, qty) values (v_uid, f.key, f.n)
    on conflict (player_id, item) do update set qty = planet_items.qty + excluded.qty;
  end loop;
  if v_ink > 0 then v_ink := private.planet_pay_world(v_uid, p_world, v_ink, p_world || ':' || v_new, 'dig-layer:' || v_uid || ':' || p_world || ':' || v_new); end if;
  if jsonb_array_length(v_first) > 0 and v_new >= 2 then
    insert into public.feed_events (kind, player_id, data) values ('dig', v_uid, jsonb_build_object('world', p_world, 'layer', v_layers -> (v_new - 1) ->> 'name', 'depth', round(v_depth)));
  end if;
  return private.dig_json(v_uid, p_world) || jsonb_build_object('dug', v_taps, 'finds', v_finds, 'new_layers', v_first, 'layer_ink', v_ink, 'balances', private.balances(v_uid));
end $$;

create or replace function public.planet_map(p_world text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); w jsonb; s public.space_pilots%rowtype;
begin
  if not private.planet_open(v_uid, p_world) then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  w := private.planet_cfg() -> 'worlds' -> private.planet_key(p_world);
  select * into s from public.space_pilots where player_id = v_uid;
  return jsonb_build_object(
    'world', p_world, 'rows', private.planet_rows(p_world), 'cols', private.planet_cols(p_world), 'radius', private.planet_radius(p_world), 'games', w -> 'games',
    'bonus_game', private.planet_cfg() -> 'bonus' ->> private.planet_key(p_world),
    'rarities', private.planet_cfg() -> 'rarities', 'bonus_from', coalesce((private.planet_cfg() ->> 'bonus_from')::int, 2),
    'luck', coalesce((private.planet_cfg() -> 'luck' ->> private.planet_key(p_world))::numeric, 0),
    'price', private.planet_price(v_uid, p_world),
    'landed', s.player_id is not null and s.location = p_world and s.dest is null,
    'plots', (select coalesce(jsonb_agg(private.planet_plot_json(p, v_uid) order by p.claimed_at), '[]'::jsonb) from public.planet_plots p where p.world = p_world and p.owner_id = v_uid),
    'claimed', (select count(*) from public.planet_plots where world = p_world),
    'pilots', (select coalesce(jsonb_agg(private.profile_json(x.player_id)), '[]'::jsonb) from (
                select player_id from public.space_pilots where location = p_world and dest is null and private.visible_to(player_id, v_uid)
                order by updated_at desc limit 24) x),
    'ink_today', private.planet_ink_today(v_uid, p_world),
    'daily_cap', coalesce((private.planet_cfg() ->> 'daily_cap')::int, 200));
end $$;

create or replace function public.inkborn_playdate_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); p public.inkborn_playdates%rowtype; c jsonb := private.pd_cfg();
  a public.inkborn%rowtype; b public.inkborn%rowtype; v_secs numeric; v_score int; v_ink int := 0; v_paid int := 0; v_tip int := 0;
  v_eggs boolean := false; v_why text; m1 jsonb; m2 jsonb; e1 public.inkborn_eggs%rowtype; e2 public.inkborn_eggs%rowtype;
  v_kinds text[] := array['speckled', 'swirl', 'starry', 'striped', 'glimmer', 'cosmic']; k1 int; k2 int;
  v_parents jsonb; v_hatch timestamptz;
begin
  select * into p from public.inkborn_playdates where id = p_session for update;
  if not found or p.guest_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if p.finished_at is not null then return jsonb_build_object('score', p.score, 'paid', p.ink, 'repeat', true); end if;
  v_secs := extract(epoch from (now() - p.started_at));
  if v_secs < coalesce((c ->> 'seconds')::int, 45) * 0.85 then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((c ->> 'max_score')::int, 140)));
  select * into a from public.inkborn where id = p.guest_inkborn;
  select * into b from public.inkborn where id = p.host_inkborn;
  if v_secs <= 1800 then
    v_ink := least(coalesce((c ->> 'max_ink')::int, 20), floor(v_score / greatest(1, coalesce((c ->> 'points_per_ink')::numeric, 6))))::int;
    v_paid := private.inkborn_pay(v_uid, v_ink, 'playdate', p.id::text, 'playdate:' || p.id);
    if v_score > 0 then v_tip := private.inkborn_pay(p.host_id, coalesce((c ->> 'host_tip')::int, 4), 'playdate_host', p.id::text, 'playdate-host:' || p.id); end if;
  end if;
  if v_score > 0 then update public.inkborn set bond = bond + 2, updated_at = now() where id in (p.guest_inkborn, p.host_inkborn); end if;
  -- eggs: a great round, eggs left today, and these two haven't had eggs together lately
  if v_score < coalesce((c ->> 'egg_score')::int, 45) then v_why := 'score';
  elsif (select count(*) from public.inkborn_playdates where guest_id = v_uid and eggs and started_at >= private.day_start(now())) >= coalesce((c ->> 'eggs_per_day')::int, 3) then v_why := 'daily';
  elsif exists (select 1 from public.inkborn_playdates where eggs and finished_at > now() - make_interval(hours => coalesce((c ->> 'pair_cooldown_hours')::int, 20))
                 and ((guest_inkborn = p.guest_inkborn and host_inkborn = p.host_inkborn) or (guest_inkborn = p.host_inkborn and host_inkborn = p.guest_inkborn))) then v_why := 'pair';
  elsif a.id is null or b.id is null then v_why := 'gone';
  else
    v_eggs := true;
    v_hatch := now() + make_interval(mins => coalesce((c ->> 'hatch_minutes')::int, 60));
    v_parents := jsonb_build_array(
      jsonb_build_object('name', a.name, 'owner', (select username from public.profiles where id = a.owner_id), 'genome', a.genome),
      jsonb_build_object('name', b.name, 'owner', (select username from public.profiles where id = b.owner_id), 'genome', b.genome));
    -- one egg each, and never the same kind: yours leans on your creature, theirs on theirs
    k1 := 1 + floor(random() * 6)::int; k2 := 1 + ((k1 + floor(random() * 5)::int) % 6);
    m1 := private.mix_genome(a.genome, b.genome, coalesce((c ->> 'mutation')::numeric, 0.18));
    m2 := private.mix_genome(b.genome, a.genome, coalesce((c ->> 'mutation')::numeric, 0.18));
    insert into public.inkborn_eggs (owner_id, playdate_id, kind, shell, genome, parents, mutated, hatch_at)
    values (v_uid, p.id, v_kinds[k1], jsonb_build_object('a', a.genome ->> 'color', 'b', b.genome ->> 'color', 'c', a.genome ->> 'accent'), m1 -> 'genome', v_parents, (m1 ->> 'mutated')::boolean, v_hatch)
    returning * into e1;
    insert into public.inkborn_eggs (owner_id, playdate_id, kind, shell, genome, parents, mutated, hatch_at)
    values (p.host_id, p.id, v_kinds[k2], jsonb_build_object('a', b.genome ->> 'color', 'b', a.genome ->> 'color', 'c', b.genome ->> 'accent'), m2 -> 'genome', v_parents, (m2 ->> 'mutated')::boolean, v_hatch)
    returning * into e2;
  end if;
  update public.inkborn_playdates set finished_at = now(), score = v_score, ink = v_paid, eggs = v_eggs where id = p.id;
  if v_score > 0 and not exists (select 1 from public.feed_events where kind = 'playdate' and player_id = v_uid and created_at > now() - interval '20 minutes') then
    insert into public.feed_events (kind, player_id, data) values ('playdate', v_uid, jsonb_build_object('mine', a.name, 'theirs', b.name, 'host', (select username from public.profiles where id = p.host_id),
      'habitat', b.habitat_id, 'eggs', v_eggs, 'score', v_score));
  end if;
  return jsonb_build_object('score', v_score, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink, 'host_tip', v_tip, 'balances', private.balances(v_uid),
    'egg', case when v_eggs then private.egg_json(e1) else null end,
    'their_egg', case when v_eggs then jsonb_build_object('kind', e2.kind) else null end,
    'no_egg_because', v_why);
end $$;

create or replace function public.planet_live(p_world text, p_d jsonb default null, p_face jsonb default null, p_hop real default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  s public.space_pilots%rowtype;
  v_cfg jsonb := coalesce(private.planet_cfg() -> 'live', '{}'::jsonb);
  v_max int := coalesce((v_cfg ->> 'group_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((v_cfg ->> 'stale_seconds')::int, 15));
  me public.planet_presence%rowtype;
  v_shard int; v_new boolean := false; v_d float8[] := private.unit3(p_d); v_face float8[] := private.unit3(p_face);
  v_spawn jsonb;
begin
  perform private.rate_limit('planet_live', 9000, 3600);
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  if not private.planet_open(v_uid, p_world) and p_world not like 'exo:%' then raise exception 'invalid_world' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('planet-live:' || p_world));
  select * into me from public.planet_presence where player_id = v_uid;
  if found and me.world = p_world and me.seen_at > now() - v_stale then
    v_shard := me.shard;
  else
    v_new := true;
    -- the fullest live group that still has room; else the first free group number
    select shard into v_shard from public.planet_presence
     where world = p_world and seen_at > now() - v_stale and player_id <> v_uid
     group by shard having count(*) < v_max order by count(*) desc, shard limit 1;
    if v_shard is null then
      select coalesce(min(n), 0) into v_shard from generate_series(0, 10000) n
       where not exists (select 1 from public.planet_presence where world = p_world and shard = n and seen_at > now() - v_stale and player_id <> v_uid);
    end if;
    -- land right next to someone who's here
    select jsonb_build_object('d', to_jsonb(p.d), 'player', p.player_id) into v_spawn from public.planet_presence p
     where p.world = p_world and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid
     order by p.seen_at desc limit 1;
  end if;
  if v_new and p_world not like 'exo:%' and not exists (select 1 from public.feed_events where kind = 'exploring' and player_id = v_uid and data ->> 'world' = p_world and created_at > now() - interval '30 minutes') then
    insert into public.feed_events (kind, player_id, data) values ('exploring', v_uid, jsonb_build_object('world', p_world, 'shard', v_shard));
  end if;
  insert into public.planet_presence (player_id, world, shard, d, face, hop, joined_at, seen_at)
  values (v_uid, p_world, v_shard, coalesce(v_d, array[0, 0, 1]::float8[]), coalesce(v_face, array[0, 1, 0]::float8[]), greatest(0, least(50, coalesce(p_hop, 0))), now(), now())
  on conflict (player_id) do update set world = excluded.world, shard = excluded.shard,
    d = coalesce(v_d, case when v_new then excluded.d else planet_presence.d end),
    face = coalesce(v_face, planet_presence.face), hop = excluded.hop,
    joined_at = case when v_new then now() else planet_presence.joined_at end, seen_at = now();
  return jsonb_build_object(
    'world', p_world, 'shard', v_shard, 'joined', v_new, 'spawn', v_spawn, 'group_size', v_max,
    'channel', 'planet:' || p_world || ':' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('d', to_jsonb(p.d), 'face', to_jsonb(p.face), 'hop', p.hop,
                  'companion', private.companion_json(p.player_id)) order by p.joined_at), '[]'::jsonb)
                from public.planet_presence p
                where p.world = p_world and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'on_world', (select count(*) from public.planet_presence where world = p_world and seen_at > now() - v_stale));
end $$;

create or replace function public.my_friends() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  return jsonb_build_object(
    'friends', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(o.id), 'since', o.since,
                                                              'plots', (select count(*) from public.world_plots where owner_id = o.id),
                                                              'now', private.whereabouts(o.id))
                                          order by lower(o.username)), '[]'::jsonb)
                from (select pr.id, pr.username, coalesce(f.responded_at, f.created_at) as since
                      from public.friendships f
                      join public.profiles pr on pr.id = case when f.requester_id = v_uid then f.addressee_id else f.requester_id end
                      where f.status = 'accepted' and (f.requester_id = v_uid or f.addressee_id = v_uid)
                        and private.visible_to(pr.id, v_uid)) o),
    'incoming', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(f.requester_id), 'at', f.created_at)
                                           order by f.created_at desc), '[]'::jsonb)
                 from public.friendships f where f.addressee_id = v_uid and f.status = 'pending' and private.visible_to(f.requester_id, v_uid)),
    'outgoing', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(f.addressee_id), 'at', f.created_at)
                                           order by f.created_at desc), '[]'::jsonb)
                 from public.friendships f where f.requester_id = v_uid and f.status = 'pending'));
end $$;

create or replace function public.feed_recent(p_after_id bigint default null, p_before_id bigint default null, p_limit int default 40) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'created_at', e.created_at,
                                        'data', case when e.kind = 'exploring' then e.data || private.room_json(e.player_id, e.data ->> 'world') else e.data end,
                                        'player', private.profile_json(e.player_id)) order by e.id desc)
    from (select f.* from public.feed_events f
          where (p_after_id is null or f.id > p_after_id) and (p_before_id is null or f.id < p_before_id)
            and private.visible_to(f.player_id, v_uid)
            and (f.kind <> 'publish' or exists (select 1 from public.artwork_publications a
                                                where a.id = (f.data ->> 'publication_id')::uuid and a.status = 'published'))
          order by f.id desc limit least(greatest(coalesce(p_limit, 40), 1), 100)) e), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.planet_ink_today(uuid, text)', 'private.planet_pay_world(uuid, text, int, text, text)', 'private.room_json(uuid, text)', 'private.whereabouts(uuid)', 'private.feed_planet_plot_trg()'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.set_activity(text, jsonb)', 'public.space_warp_to_player(uuid)', 'public.space_worlds_social()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
