-- v0.44 Planet quests, crew quests and dig parties.
-- Every day each world gives you 3 quests of your own (dig, grab meteorites, play its games, drive, build,
-- visit bases), and one crew quest everyone on that world works on together: when the crew reaches the
-- goal, everyone who pitched in can claim the reward. Digging at the same time as friends or people in your
-- live group is a dig party: everyone digs faster (each other digger adds 25%, up to double).
-- Progress is counted by the server from what you actually do.

insert into public.game_config (key, value, description) values ('quests', '{
  "enabled": true,
  "solo_per_day": 3,
  "pool": [
    {"id": "dig_8",     "metric": "dig_m",   "target": 8,    "title": "Dig 8 m into your plot",     "emoji": "⛏️", "ink": 12, "items": {"stone": 8}},
    {"id": "dig_30",    "metric": "dig_m",   "target": 30,   "title": "Dig 30 m deeper",             "emoji": "⛏️", "ink": 25, "items": {"iron": 6, "ice": 4}},
    {"id": "meteor_1",  "metric": "meteors", "target": 1,    "title": "Grab a meteorite",            "emoji": "☄️", "ink": 10, "items": {"crystal": 1}},
    {"id": "meteor_3",  "metric": "meteors", "target": 3,    "title": "Grab 3 meteorites",           "emoji": "☄️", "ink": 22, "items": {"crystal": 3}},
    {"id": "games_2",   "metric": "games",   "target": 2,    "title": "Play 2 of this world’s games", "emoji": "🎮", "ink": 15, "items": {"ice": 6}},
    {"id": "games_4",   "metric": "games",   "target": 4,    "title": "Play 4 of this world’s games", "emoji": "🎮", "ink": 25, "items": {"copper": 5}},
    {"id": "drive_1k",  "metric": "drive_m", "target": 1000, "title": "Drive 1 km in a rover",       "emoji": "🚙", "ink": 18, "items": {"ice": 10}},
    {"id": "drive_5k",  "metric": "drive_m", "target": 5000, "title": "Drive 5 km in a rover",       "emoji": "🚙", "ink": 30, "items": {"titanium": 2}},
    {"id": "build_2",   "metric": "modules", "target": 2,    "title": "Build 2 base modules",        "emoji": "🏗️", "ink": 15, "items": {"stone": 12}},
    {"id": "visit_2",   "metric": "visits",  "target": 2,    "title": "Visit 2 other players’ bases", "emoji": "👀", "ink": 15, "items": {"dust": 15}}
  ],
  "crew": [
    {"id": "crew_dig",    "metric": "dig_m",   "target": 120,  "min_share": 5,   "title": "Crew dig: 120 m together",        "emoji": "⛏️", "ink": 20, "items": {"titanium": 2, "gem": 1}},
    {"id": "crew_meteor", "metric": "meteors", "target": 12,   "min_share": 1,   "title": "Crew sweep: 12 meteorites",       "emoji": "☄️", "ink": 20, "items": {"plasma": 1, "crystal": 3}},
    {"id": "crew_games",  "metric": "games",   "target": 12,   "min_share": 1,   "title": "Crew games: 12 rounds together",  "emoji": "🎮", "ink": 20, "items": {"gem": 1, "copper": 4}},
    {"id": "crew_drive",  "metric": "drive_m", "target": 8000, "min_share": 300, "title": "Crew convoy: drive 8 km together", "emoji": "🚙", "ink": 20, "items": {"titanium": 3}}
  ]
}', 'Planet quests: the daily pool (3 picked per world per day), crew quests everyone on a world works on together (rewards for anyone who did at least min_share), and the rewards (Ink counts toward the world''s daily cap; materials don''t).')
on conflict (key) do nothing;
update public.game_config set value = value || '{"party_bonus": 0.25}'::jsonb where key = 'mining' and not value ? 'party_bonus';

alter table public.planet_miners add column if not exists last_dig_world text;

create table if not exists public.planet_quest_stats (
  player_id uuid not null references public.players (id) on delete cascade,
  world text not null, day timestamptz not null, metric text not null,
  amount numeric not null default 0,
  primary key (player_id, world, day, metric)
);
create index if not exists planet_quest_stats_world_idx on public.planet_quest_stats (world, day, metric);
alter table public.planet_quest_stats enable row level security;
revoke all on public.planet_quest_stats from anon, authenticated;

create table if not exists public.planet_quest_claims (
  player_id uuid not null references public.players (id) on delete cascade,
  world text not null, day timestamptz not null, quest text not null,
  claimed_at timestamptz not null default now(),
  primary key (player_id, world, day, quest)
);
alter table public.planet_quest_claims enable row level security;
revoke all on public.planet_quest_claims from anon, authenticated;

create or replace function private.quest_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('quests'), '{}'::jsonb) $$;

create or replace function private.quest_bump(p_uid uuid, p_world text, p_metric text, p_amount numeric) returns void language plpgsql as $$
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  insert into public.planet_quest_stats (player_id, world, day, metric, amount) values (p_uid, p_world, private.day_start(now()), p_metric, p_amount)
  on conflict (player_id, world, day, metric) do update set amount = planet_quest_stats.amount + excluded.amount;
end $$;

/** How much of a metric a player (or, with p_uid null, everyone) did on a world on a day. */
create or replace function private.quest_metric(p_uid uuid, p_world text, p_day timestamptz, p_metric text) returns numeric language sql stable as $$
  select case p_metric
    when 'meteors' then (select count(*)::numeric from public.planet_meteors m where m.world = p_world and m.taken_at >= p_day and m.taken_at < p_day + interval '1 day' and (p_uid is null or m.player_id = p_uid))
    when 'games'   then (select count(*)::numeric from public.planet_games g where g.world = p_world and g.finished_at >= p_day and g.finished_at < p_day + interval '1 day' and coalesce(g.score, 0) > 0 and (p_uid is null or g.owner_id = p_uid))
    when 'visits'  then (select count(distinct (n.player_id, n.data ->> 'gx', n.data ->> 'gy'))::numeric from public.player_notifications n where n.kind = 'base_visit' and n.data ->> 'world' = p_world
                          and n.created_at >= p_day and n.created_at < p_day + interval '1 day' and (p_uid is null or n.actor_id = p_uid))
    else (select coalesce(sum(s.amount), 0) from public.planet_quest_stats s where s.world = p_world and s.day = p_day and s.metric = p_metric and (p_uid is null or s.player_id = p_uid))
  end
$$;

/** Today's quests on a world: the same for everyone (picked from the pool by world and day), plus the crew quest. */
create or replace function private.quests_today(p_world text, p_day timestamptz) returns jsonb language sql stable as $$
  with pool as (select q, md5(p_world || ':' || p_day::date::text || ':' || (q ->> 'id')) h from jsonb_array_elements(private.quest_cfg() -> 'pool') q),
       -- one quest per kind of thing a day
       one as (select distinct on (q ->> 'metric') q, h from pool order by q ->> 'metric', h),
       picked as (select q from one order by h limit coalesce((private.quest_cfg() ->> 'solo_per_day')::int, 3)),
       crew as (select q from jsonb_array_elements(private.quest_cfg() -> 'crew') q order by md5(p_world || ':' || p_day::date::text || ':crew:' || (q ->> 'id')) limit 1)
  select jsonb_build_object('solo', coalesce((select jsonb_agg(q) from picked), '[]'::jsonb), 'crew', (select q from crew))
$$;

create or replace function public.planet_quests(p_world text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_day timestamptz := private.day_start(now()); t jsonb := private.quests_today(p_world, v_day);
  q jsonb; v_solo jsonb := '[]'::jsonb; v_mine numeric; v_all numeric; v_crew jsonb := null;
begin
  for q in select * from jsonb_array_elements(t -> 'solo') loop
    v_mine := private.quest_metric(v_uid, p_world, v_day, q ->> 'metric');
    v_solo := v_solo || jsonb_build_array(q || jsonb_build_object('progress', round(v_mine, 1),
      'done', v_mine >= (q ->> 'target')::numeric,
      'claimed', exists (select 1 from public.planet_quest_claims c where c.player_id = v_uid and c.world = p_world and c.day = v_day and c.quest = q ->> 'id')));
  end loop;
  q := t -> 'crew';
  if q is not null then
    v_mine := private.quest_metric(v_uid, p_world, v_day, q ->> 'metric');
    v_all := private.quest_metric(null, p_world, v_day, q ->> 'metric');
    v_crew := q || jsonb_build_object('progress', round(v_all, 1), 'mine', round(v_mine, 1), 'done', v_all >= (q ->> 'target')::numeric,
      'can_claim', v_all >= (q ->> 'target')::numeric and v_mine >= coalesce((q ->> 'min_share')::numeric, 1),
      'claimed', exists (select 1 from public.planet_quest_claims c where c.player_id = v_uid and c.world = p_world and c.day = v_day and c.quest = q ->> 'id'),
      'crew', coalesce((select jsonb_agg(private.profile_json(x.pid) || jsonb_build_object('amount', round(x.amt, 1)) order by x.amt desc) from (
          select s.player_id pid, s.amount amt from public.planet_quest_stats s where s.world = p_world and s.day = v_day and s.metric = q ->> 'metric' and s.amount > 0
          union all select m.player_id, count(*) from public.planet_meteors m where q ->> 'metric' = 'meteors' and m.world = p_world and m.taken_at >= v_day group by m.player_id
          union all select g.owner_id, count(*) from public.planet_games g where q ->> 'metric' = 'games' and g.world = p_world and g.finished_at >= v_day and coalesce(g.score, 0) > 0 group by g.owner_id
          order by 2 desc limit 8) x), '[]'::jsonb),
      'crew_size', 0);
    v_crew := v_crew || jsonb_build_object('crew_size', jsonb_array_length(v_crew -> 'crew'));
  end if;
  return jsonb_build_object('world', p_world, 'day', v_day, 'resets_at', v_day + interval '1 day', 'solo', v_solo, 'crew', v_crew,
    'item_info', private.mine_cfg() -> 'items');
end $$;

create or replace function public.planet_quest_claim(p_world text, p_quest text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_day timestamptz := private.day_start(now()); t jsonb := private.quests_today(p_world, v_day);
  q jsonb; v_crew boolean := false; v_paid int := 0; k record;
begin
  select x into q from jsonb_array_elements(t -> 'solo') x where x ->> 'id' = p_quest;
  if q is null and t -> 'crew' ->> 'id' = p_quest then q := t -> 'crew'; v_crew := true; end if;
  if q is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_crew then
    if private.quest_metric(null, p_world, v_day, q ->> 'metric') < (q ->> 'target')::numeric then raise exception 'quest_not_done' using errcode = 'P0001'; end if;
    if private.quest_metric(v_uid, p_world, v_day, q ->> 'metric') < coalesce((q ->> 'min_share')::numeric, 1) then raise exception 'quest_no_share' using errcode = 'P0001'; end if;
  elsif private.quest_metric(v_uid, p_world, v_day, q ->> 'metric') < (q ->> 'target')::numeric then
    raise exception 'quest_not_done' using errcode = 'P0001';
  end if;
  insert into public.planet_quest_claims (player_id, world, day, quest) values (v_uid, p_world, v_day, p_quest) on conflict do nothing;
  if not found then raise exception 'quest_claimed' using errcode = 'P0001'; end if;
  v_paid := private.planet_pay_world(v_uid, p_world, coalesce((q ->> 'ink')::int, 0), 'quest:' || p_world || ':' || p_quest, 'quest:' || v_uid || ':' || p_world || ':' || v_day::date || ':' || p_quest);
  for k in select key, value::bigint n from jsonb_each_text(coalesce(q -> 'items', '{}'::jsonb)) loop
    insert into public.planet_items (player_id, item, qty) values (v_uid, k.key, k.n) on conflict (player_id, item) do update set qty = planet_items.qty + excluded.qty;
  end loop;
  return public.planet_quests(p_world) || jsonb_build_object('claimed_quest', p_quest, 'paid', v_paid, 'earned', coalesce((q ->> 'ink')::int, 0), 'items_got', coalesce(q -> 'items', '{}'::jsonb), 'balances', private.balances(v_uid));
end $$;

create or replace function public.planet_dig(p_world text, p_taps int, p_d jsonb default null, p_gx int default null, p_gy int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.mine_cfg(); m public.planet_miners%rowtype; s public.space_pilots%rowtype;
  sh public.planet_plot_shafts%rowtype; v_taps int; v_allowed numeric; v_power int; v_depth numeric; v_layers jsonb := c -> 'layers'; v_n int;
  v_layer jsonb; v_li int; v_finds jsonb := '{}'::jsonb; v_new int := 0; v_ink int := 0; i int; f record; v_roll numeric; v_tot numeric; v_acc numeric; v_item text;
  v_first jsonb := '[]'::jsonb; v_party int := 0; v_eff numeric; v_bottom numeric; v_cored boolean := false; v_core_ink int := 0; v_old public.planet_shafts%rowtype;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  if p_gx is null or p_gy is null then raise exception 'dig_own_plot' using errcode = 'P0001'; end if;
  s := private.space_pilot(v_uid);
  if s.location <> p_world or s.dest is not null then raise exception 'land_first' using errcode = 'P0001'; end if;
  -- only the owner digs into a plot
  if not exists (select 1 from public.planet_plots where world = p_world and gx = p_gx and gy = p_gy and owner_id = v_uid) then
    raise exception 'dig_own_plot' using errcode = 'P0001';
  end if;
  m := private.miner(v_uid);
  v_allowed := case when m.last_dig_at is null then 12 else extract(epoch from now() - m.last_dig_at) * coalesce((c ->> 'taps_per_second')::numeric, 6) + 3 end;
  v_taps := least(greatest(coalesce(p_taps, 0), 0), 30, floor(v_allowed)::int, floor(m.energy / coalesce((c -> 'energy' ->> 'per_tap')::numeric, 1))::int);
  if v_taps <= 0 then
    if m.energy < 1 then raise exception 'no_energy' using errcode = 'P0001'; end if;
    return private.plot_dig_json(v_uid, p_world, p_gx, p_gy) || jsonb_build_object('dug', 0, 'finds', '{}'::jsonb);
  end if;
  if not exists (select 1 from public.planet_plot_shafts where world = p_world and gx = p_gx and gy = p_gy) then
    -- your first plot shaft on this world picks up the old world shaft's progress
    select * into v_old from public.planet_shafts where player_id = v_uid and world = p_world;
    insert into public.planet_plot_shafts (world, gx, gy, owner_id, depth, layers_reached)
    values (p_world, p_gx, p_gy, v_uid,
            case when not exists (select 1 from public.planet_plot_shafts where owner_id = v_uid and world = p_world) then coalesce(v_old.depth, 0) else 0 end,
            case when not exists (select 1 from public.planet_plot_shafts where owner_id = v_uid and world = p_world) then coalesce(v_old.layers_reached, 0) else 0 end)
    on conflict do nothing;
    if v_old.player_id is not null then update public.planet_shafts set depth = 0 where player_id = v_uid and world = p_world; end if;
  end if;
  select * into sh from public.planet_plot_shafts where world = p_world and gx = p_gx and gy = p_gy for update;
  -- a plot that changed hands: the shaft goes with it
  if sh.owner_id <> v_uid then update public.planet_plot_shafts set owner_id = v_uid where world = p_world and gx = p_gx and gy = p_gy; end if;
  v_power := private.best_power(m);
  -- a dig party: friends, or people in your live group, digging on this world right now make everyone faster
  select count(*) into v_party from public.planet_miners pm
   where pm.player_id <> v_uid and pm.last_dig_world = p_world and pm.last_dig_at > now() - interval '60 seconds'
     and (private.friend_state(v_uid, pm.player_id) = 'friends'
          or exists (select 1 from public.planet_presence a join public.planet_presence b on a.world = b.world and a.shard = b.shard
                      where a.player_id = v_uid and b.player_id = pm.player_id and a.world = p_world and b.seen_at > now() - interval '30 seconds'));
  v_eff := v_power * (1 + least(v_party, 4) * coalesce((c ->> 'party_bonus')::numeric, 0.25));
  v_n := jsonb_array_length(v_layers);
  v_bottom := (v_layers -> (v_n - 1) ->> 'to')::numeric;
  v_depth := sh.depth;
  for i in 1 .. v_taps loop
    exit when v_depth >= v_bottom;
    v_li := 0;
    while v_li < v_n - 1 and v_depth >= (v_layers -> v_li ->> 'to')::numeric loop v_li := v_li + 1; end loop;
    v_layer := v_layers -> v_li;
    v_depth := least(v_bottom, v_depth + v_eff / (v_layer ->> 'hardness')::numeric);
    if random() < coalesce((c ->> 'find_chance')::numeric, 0.32) then
      select sum(value::numeric) into v_tot from jsonb_each_text(v_layer -> 'finds');
      v_roll := random() * v_tot; v_acc := 0; v_item := null;
      for f in select key, value::numeric w from jsonb_each_text(v_layer -> 'finds') loop
        v_acc := v_acc + f.w; if v_roll < v_acc then v_item := f.key; exit; end if;
      end loop;
      if v_item is not null then v_finds := v_finds || jsonb_build_object(v_item, coalesce((v_finds ->> v_item)::int, 0) + 1); end if;
    end if;
  end loop;
  for v_li in 0 .. v_n - 1 loop
    if v_depth > (case when v_li = 0 then 0 else (v_layers -> (v_li - 1) ->> 'to')::numeric end) and v_li + 1 > sh.layers_reached then
      v_new := v_li + 1; v_ink := v_ink + coalesce((v_layers -> v_li ->> 'first_ink')::int, 0);
      v_first := v_first || jsonb_build_array(v_layers -> v_li ->> 'id');
    end if;
  end loop;
  v_cored := v_depth >= v_bottom and sh.cored_at is null;
  update public.planet_plot_shafts set depth = v_depth, layers_reached = greatest(layers_reached, v_new), updated_at = now(),
         cored_at = case when v_cored then now() else cored_at end
   where world = p_world and gx = p_gx and gy = p_gy;
  update public.planet_miners set energy = m.energy - v_taps * coalesce((c -> 'energy' ->> 'per_tap')::numeric, 1), last_dig_at = now(), last_dig_world = p_world, taps = taps + v_taps
   where player_id = v_uid;
  for f in select key, value::int n from jsonb_each_text(v_finds) loop
    insert into public.planet_items (player_id, item, qty) values (v_uid, f.key, f.n)
    on conflict (player_id, item) do update set qty = planet_items.qty + excluded.qty;
  end loop;
  perform private.quest_bump(v_uid, p_world, 'dig_m', v_depth - sh.depth);
  -- layer Ink counts toward the world's daily cap
  if v_ink > 0 then v_ink := private.planet_pay_world(v_uid, p_world, v_ink, p_world || ':' || p_gx || ':' || p_gy || ':' || v_new, 'dig-layer:' || v_uid || ':' || p_world || ':' || p_gx || ':' || p_gy || ':' || v_new); end if;
  if v_new > 0 and jsonb_array_length(v_first) > 0 and not v_cored then
    insert into public.feed_events (kind, player_id, data) values ('dig', v_uid, jsonb_build_object('world', p_world, 'layer', v_layers -> (v_new - 1) ->> 'name', 'depth', round(v_depth)));
  end if;
  -- the core: once per plot, a reward outside the daily cap
  if v_cored then
    v_core_ink := coalesce((c -> 'core_reward' ->> 'ink')::int, 2500);
    perform private.grant(v_uid, jsonb_build_object('ink', v_core_ink), 'space', 'planet_core', p_world || ':' || p_gx || ':' || p_gy, 'core:' || p_world || ':' || p_gx || ':' || p_gy);
    insert into public.planet_items (player_id, item, qty) values (v_uid, coalesce(c -> 'core_reward' ->> 'item', 'core_heart'), 1)
    on conflict (player_id, item) do update set qty = planet_items.qty + 1;
    update public.planet_plots set rarity = 'core' where world = p_world and gx = p_gx and gy = p_gy;
    insert into public.feed_events (kind, player_id, data) values ('core', v_uid, jsonb_build_object('world', p_world, 'gx', p_gx, 'gy', p_gy));
    perform private.notify(v_uid, 'core', null, jsonb_build_object('world', p_world, 'gx', p_gx, 'gy', p_gy, 'ink', v_core_ink));
  end if;
  return private.plot_dig_json(v_uid, p_world, p_gx, p_gy) || jsonb_build_object('dug', v_taps, 'finds', v_finds, 'new_layers', v_first, 'layer_ink', v_ink,
    'reached_core', v_cored, 'core_ink', v_core_ink, 'party', v_party, 'party_mult', round(v_eff / v_power, 2), 'balances', private.balances(v_uid));
end $$;

create or replace function public.rover_tick(p_world text, p_d jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.planet_rovers%rowtype; m jsonb; v_d float8[] := private.unit3(p_d);
  v_dist float8 := 0; v_secs float8; v_burn numeric; v_day timestamptz := private.day_start(now());
begin
  perform private.rate_limit('rover_tick', 4000, 3600);
  select * into r from public.planet_rovers where player_id = v_uid for update;
  if not found or not r.driving or r.drive_world <> p_world then return private.rover_json(v_uid) || jsonb_build_object('driving', false); end if;
  m := private.rover_model(r.active);
  if v_d is not null and r.last_d is not null then
    v_dist := acos(least(1, greatest(-1, v_d[1] * r.last_d[1] + v_d[2] * r.last_d[2] + v_d[3] * r.last_d[3]))) * private.planet_radius(p_world);
    v_secs := greatest(0.5, extract(epoch from now() - r.last_at));
    v_dist := least(v_dist, (m ->> 'speed')::float8 * v_secs * 1.25 + 5); -- no faster than the rover goes
  end if;
  v_burn := least(r.fuel, v_dist / 1000 * (m ->> 'burn_per_km')::numeric);
  update public.planet_rovers set fuel = fuel - v_burn, last_d = coalesce(v_d, last_d), last_at = now(), km = km + v_dist / 1000,
         km_today = case when km_day = v_day then km_today else 0 end + v_dist / 1000, km_day = v_day,
         driving = (fuel - v_burn) > 0.0001
   where player_id = v_uid returning * into r;
  if v_dist > 0 then perform private.quest_bump(v_uid, p_world, 'drive_m', v_dist::numeric); end if;
  return private.rover_json(v_uid) || jsonb_build_object('moved_m', round(v_dist::numeric, 1), 'burned', round(v_burn, 2), 'out_of_fuel', not r.driving);
end $$;

create or replace function public.planet_base_save(p_world text, p_gx int, p_gy int, p_layout jsonb, p_rev int, p_w int default 1, p_h int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.base_cfg(); b public.planet_bases%rowtype; v_plot numeric := coalesce((private.planet_cfg() ->> 'plot_m')::numeric, 8);
  m jsonb; mod jsonb; v_w numeric; v_d numeric; v_ids text[] := '{}'; v_old_ids text[]; v_cost jsonb := '{}'::jsonb; v_back jsonb := '{}'::jsonb; k record; v_have bigint;
  v_refund numeric := coalesce((c ->> 'refund')::numeric, 0.5); v_layout jsonb := '[]'::jsonb;
  v_w_n int := greatest(1, coalesce(p_w, 1)); v_h_n int := greatest(1, coalesce(p_h, 1)); v_cols int := private.planet_cols(p_world); v_max int; v_cells int; o public.planet_bases%rowtype;
begin
  perform private.rate_limit('planet_base', 300, 3600);
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  if v_w_n > coalesce((c ->> 'max_merge')::int, 4) or v_h_n > coalesce((c ->> 'max_merge')::int, 4) then raise exception 'base_too_big' using errcode = 'P0001'; end if;
  -- every plot under the base is yours
  select count(*) into v_cells from public.planet_plots
   where world = p_world and owner_id = v_uid and gy between p_gy and p_gy + v_h_n - 1
     and ((gx - p_gx) % v_cols + v_cols) % v_cols < v_w_n;
  if v_cells < v_w_n * v_h_n then raise exception 'not_owner' using errcode = 'P0001'; end if;
  -- and no other base already sits on any of them (empty ones just go)
  for o in select * from public.planet_bases pb where pb.world = p_world and not (pb.gx = p_gx and pb.gy = p_gy)
             and pb.gy <= p_gy + v_h_n - 1 and pb.gy + pb.h - 1 >= p_gy
             and (((pb.gx - p_gx) % v_cols + v_cols) % v_cols < v_w_n or ((p_gx - pb.gx) % v_cols + v_cols) % v_cols < pb.w) loop
    if jsonb_array_length(o.layout) > 0 then raise exception 'plot_has_base' using errcode = 'P0001', detail = o.gx || ',' || o.gy; end if;
    delete from public.planet_bases where world = o.world and gx = o.gx and gy = o.gy;
  end loop;
  v_max := least(coalesce((c ->> 'max_modules_total')::int, 300), coalesce((c ->> 'max_modules')::int, 40) * v_w_n * v_h_n);
  if jsonb_typeof(p_layout) <> 'array' or jsonb_array_length(p_layout) > v_max then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
  insert into public.planet_bases (world, gx, gy, owner_id) values (p_world, p_gx, p_gy, v_uid) on conflict do nothing;
  select * into b from public.planet_bases where world = p_world and gx = p_gx and gy = p_gy for update;
  if b.rev <> coalesce(p_rev, -1) then raise exception 'layout_conflict' using errcode = 'P0001'; end if;
  -- check every module, and keep only the fields we know
  for m in select * from jsonb_array_elements(p_layout) loop
    mod := c -> 'modules' -> (m ->> 'k');
    if mod is null or coalesce(m ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,24}$' or (m ->> 'id') = any(v_ids) then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    v_ids := v_ids || (m ->> 'id');
    -- footprint (turned a quarter makes it w x d the other way) must sit on the plot
    v_w := case when coalesce((m ->> 'r')::int, 0) % 2 = 1 then (mod ->> 'd')::numeric else (mod ->> 'w')::numeric end;
    v_d := case when coalesce((m ->> 'r')::int, 0) % 2 = 1 then (mod ->> 'w')::numeric else (mod ->> 'd')::numeric end;
    if (m ->> 'x')::numeric - v_w / 2 < -0.01 or (m ->> 'x')::numeric + v_w / 2 > v_plot * v_w_n + 0.01
       or (m ->> 'y')::numeric - v_d / 2 < -0.01 or (m ->> 'y')::numeric + v_d / 2 > v_plot * v_h_n + 0.01
       or coalesce((m ->> 'r')::int, 0) not between 0 and 3
       or not ((c -> 'palette') ? coalesce(m ->> 'c', '#F2F5FB')) then
      raise exception 'invalid_layout' using errcode = 'P0001';
    end if;
    v_layout := v_layout || jsonb_build_array(jsonb_build_object('id', m ->> 'id', 'k', m ->> 'k', 'x', round((m ->> 'x')::numeric, 2), 'y', round((m ->> 'y')::numeric, 2),
      'r', coalesce((m ->> 'r')::int, 0), 'c', coalesce(m ->> 'c', '#F2F5FB')));
  end loop;
  select coalesce(array_agg(x ->> 'id'), '{}') into v_old_ids from jsonb_array_elements(b.layout) x;
  -- what's new costs; what's gone gives back part of its materials
  for m in select * from jsonb_array_elements(v_layout) where not ((value ->> 'id') = any(v_old_ids)) loop
    for k in select key, value::bigint n from jsonb_each_text(c -> 'modules' -> (m ->> 'k') -> 'cost') loop
      v_cost := v_cost || jsonb_build_object(k.key, coalesce((v_cost ->> k.key)::bigint, 0) + k.n);
    end loop;
  end loop;
  for m in select * from jsonb_array_elements(b.layout) where not ((value ->> 'id') = any(v_ids)) loop
    for k in select key, value::bigint n from jsonb_each_text(c -> 'modules' -> (m ->> 'k') -> 'cost') where key <> 'ink' loop
      v_back := v_back || jsonb_build_object(k.key, coalesce((v_back ->> k.key)::bigint, 0) + floor(k.n * v_refund)::bigint);
    end loop;
  end loop;
  for k in select key, value::bigint n from jsonb_each_text(v_cost) where key <> 'ink' loop
    select qty into v_have from public.planet_items where player_id = v_uid and item = k.key for update;
    if coalesce(v_have, 0) + coalesce((v_back ->> k.key)::bigint, 0) < k.n then raise exception 'not_enough_materials' using errcode = 'P0001', detail = k.key; end if;
  end loop;
  if coalesce((v_cost ->> 'ink')::int, 0) > 0 then
    perform private.charge(v_uid, jsonb_build_object('ink', (v_cost ->> 'ink')::int), 'planet_base', 'planet', p_world || ':' || p_gx || ':' || p_gy, 'planet-base:' || p_world || ':' || p_gx || ':' || p_gy || ':' || b.rev);
  end if;
  for k in select key, value::bigint n from jsonb_each_text(v_back) loop
    insert into public.planet_items (player_id, item, qty) values (v_uid, k.key, k.n) on conflict (player_id, item) do update set qty = planet_items.qty + excluded.qty;
  end loop;
  for k in select key, value::bigint n from jsonb_each_text(v_cost) where key <> 'ink' loop
    update public.planet_items set qty = qty - k.n where player_id = v_uid and item = k.key;
  end loop;
  perform private.quest_bump(v_uid, p_world, 'modules', (select count(*) from jsonb_array_elements(v_layout) x where not ((x ->> 'id') = any(v_old_ids))));
  update public.planet_bases set layout = v_layout, rev = rev + 1, w = v_w_n, h = v_h_n, updated_at = now() where world = p_world and gx = p_gx and gy = p_gy returning * into b;
  if jsonb_array_length(v_layout) >= 3 and not exists (select 1 from public.feed_events where kind = 'base' and player_id = v_uid and created_at > now() - interval '1 hour') then
    insert into public.feed_events (kind, player_id, data) values ('base', v_uid, jsonb_build_object('world', p_world, 'modules', jsonb_array_length(v_layout), 'plots', v_w_n * v_h_n));
  end if;
  return jsonb_build_object('layout', b.layout, 'rev', b.rev, 'w', b.w, 'h', b.h, 'spent', v_cost, 'refunded', v_back, 'items', private.items_json(v_uid), 'balances', private.balances(v_uid));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.quest_cfg()', 'private.quest_bump(uuid, text, text, numeric)', 'private.quest_metric(uuid, text, timestamptz, text)', 'private.quests_today(text, timestamptz)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.planet_quests(text)', 'public.planet_quest_claim(text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
