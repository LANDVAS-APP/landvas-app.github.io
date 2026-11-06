-- v0.6.1 The Clan Keep (the clan hall, rebuilt as its own place) and clan renames.
--   * Leaders can rename the clan once every 30 days.
--   * Clan Spirit: every member can feed it once a day; it grows through six stages over the week (a new egg each
--     Monday) and every feed gives the clan XP and the feeder stone.
--   * Daily clan chest: it opens once enough members have been to the Keep that day; everyone who came collects.
--   * Stone: mined in the Keep's quarry and earned at the training grounds, then given to building projects —
--     monuments the whole clan builds together that stand in the courtyard for good.
--   * Training grounds: a target range with a weekly members' leaderboard.

insert into public.game_config (key, value, description) values ('clan_keep', $cfg${
  "rename_days": 30,
  "spirit": { "stages": [0, 1, 0.15, 0.35, 0.6, 0.85], "names": ["Egg", "Hatchling", "Sprout", "Young", "Grown", "Legendary"],
              "feed_xp": 60, "feed_stone": 8, "stage_xp": 300 },
  "chest": { "ink": 30, "stone": 15 },
  "plays": {
    "quarry":   { "seconds": 30, "max_score": 160, "stone_per": 0.5 },
    "training": { "seconds": 30, "max_score": 400, "stone_per": 0.25, "stone_base": 3 }
  },
  "stone_day_cap": 140,
  "builds": [
    { "key": "well",       "name": "Wishing Well",   "emoji": "🪣", "cost": 150,  "level": 1, "xp": 300 },
    { "key": "forge",      "name": "Forge",          "emoji": "⚒️", "cost": 300,  "level": 1, "xp": 600 },
    { "key": "watchtower", "name": "Watchtower",     "emoji": "🗼", "cost": 600,  "level": 2, "xp": 1200 },
    { "key": "fountain",   "name": "Fountain",       "emoji": "⛲", "cost": 900,  "level": 3, "xp": 1800 },
    { "key": "garden",     "name": "Flower Garden",  "emoji": "🌷", "cost": 1200, "level": 4, "xp": 2400 },
    { "key": "statue",     "name": "Emblem Statue",  "emoji": "🗿", "cost": 1600, "level": 5, "xp": 3200 },
    { "key": "beacon",     "name": "Beacon",         "emoji": "🔥", "cost": 2200, "level": 7, "xp": 4400 },
    { "key": "dragon",     "name": "Dragon Statue",  "emoji": "🐉", "cost": 3000, "level": 9, "xp": 6000 }
  ]
}$cfg$::jsonb, 'The Clan Keep: spirit, daily chest, quarry, training, building projects; rename wait')
on conflict (key) do nothing;

alter table public.clans add column if not exists renamed_at timestamptz;
alter table public.clans add column if not exists spirit_seed int not null default (floor(random() * 2147483647))::int;
alter table public.clans add column if not exists spirit_bond int not null default 0;
alter table public.clan_members add column if not exists stone int not null default 0 check (stone >= 0);

create table if not exists public.clan_visits (
  clan_id uuid not null references public.clans (id) on delete cascade,
  day date not null,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (clan_id, day, player_id)
);
create table if not exists public.clan_spirit_feeds (
  clan_id uuid not null references public.clans (id) on delete cascade,
  day date not null,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (clan_id, day, player_id)
);
create table if not exists public.clan_builds (
  clan_id uuid not null references public.clans (id) on delete cascade,
  key text not null,
  progress int not null default 0,
  done_at timestamptz,
  primary key (clan_id, key)
);
create table if not exists public.clan_plays (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  clan_id uuid not null references public.clans (id) on delete cascade,
  game text not null,
  seed int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score int,
  stone int not null default 0
);
create index if not exists clan_plays_day_idx on public.clan_plays (player_id, started_at desc);
create table if not exists public.clan_training (
  clan_id uuid not null references public.clans (id) on delete cascade,
  week date not null,
  player_id uuid not null references public.players (id) on delete cascade,
  best int not null default 0,
  primary key (clan_id, week, player_id)
);
do $$
declare t text;
begin
  foreach t in array array['clan_visits', 'clan_spirit_feeds', 'clan_builds', 'clan_plays', 'clan_training'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

create or replace function private.keep_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('clan_keep'), '{}'::jsonb) $$;
create or replace function private.clan_day() returns date language sql stable as $$ select (now() at time zone 'utc')::date $$;

/** members needed at the Keep today for the chest to open */
create or replace function private.keep_chest_need(p_clan uuid) returns int language sql stable as $$
  select greatest(1, least(n, ceil(n / 4.0)::int + 1)) from (select count(*)::int n from public.clan_members where clan_id = p_clan) s
$$;

/** the spirit's stage this week from how many feeds it's had (stages are fractions of every member feeding every day) */
create or replace function private.keep_stage(p_clan uuid, p_feeds int) returns int language plpgsql stable as $$
declare st jsonb := private.keep_cfg() -> 'spirit' -> 'stages'; v_n int; v_max numeric; v_stage int := 0; i int; v_need numeric;
begin
  select count(*) into v_n from public.clan_members where clan_id = p_clan;
  v_max := greatest(1, v_n) * 7;
  for i in 1 .. jsonb_array_length(st) - 1 loop
    v_need := case when i = 1 then (st ->> 1)::numeric else greatest(i, ceil((st ->> i)::numeric * v_max)) end;
    if p_feeds >= v_need then v_stage := i; end if;
  end loop;
  return v_stage;
end $$;

create or replace function private.clan_card(p_clan uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'emblem', c.emblem, 'color', c.color, 'motto', c.motto, 'privacy', c.privacy,
    'level', private.clan_lv(c.xp), 'xp', c.xp, 'wins', c.wins, 'losses', c.losses, 'renamed_at', c.renamed_at,
    'members', (select count(*) from public.clan_members where clan_id = c.id),
    'cap', private.clan_cap(private.clan_lv(c.xp)),
    'week_score', coalesce((select score from public.clan_weeks where clan_id = c.id and week = private.clan_week()), 0),
    'in_hall', (select count(*) from public.home_presence where host_id = c.id and seen_at > now() - interval '12 seconds'))
  from public.clans c where c.id = p_clan
$$;

-- ---- renaming -------------------------------------------------------------------------------------------------------
create or replace function public.clan_rename(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; cl public.clans%rowtype; v_name text;
  v_days int := coalesce((private.keep_cfg() ->> 'rename_days')::int, 30);
begin
  perform private.rate_limit('clan_rename', 20, 3600);
  m := private.clan_require(v_uid);
  if m.role <> 'leader' then raise exception 'clan_leader_only' using errcode = 'P0001'; end if;
  select * into cl from public.clans where id = m.clan_id for update;
  if cl.renamed_at is not null and cl.renamed_at > now() - make_interval(days => v_days) then
    raise exception 'clan_rename_wait' using errcode = 'P0001', detail = (cl.renamed_at + make_interval(days => v_days))::text;
  end if;
  v_name := private.clan_text(p_name, 3, 24, 'invalid_clan_name');
  if lower(v_name) = lower(cl.name) then raise exception 'invalid_clan_name' using errcode = 'P0001'; end if;
  if exists (select 1 from public.clans where lower(name) = lower(v_name) and id <> cl.id) then raise exception 'clan_name_taken' using errcode = 'P0001'; end if;
  update public.clans set name = v_name, renamed_at = now() where id = cl.id;
  perform private.clan_feed_add(cl.id, 'renamed', jsonb_build_object('by', v_uid, 'from', cl.name, 'to', v_name));
  return public.clan_get(cl.id);
end $$;

-- ---- the Keep -------------------------------------------------------------------------------------------------------
create or replace function public.clan_keep() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; c jsonb := private.keep_cfg(); cl public.clans%rowtype;
  v_day date := private.clan_day(); v_week date := private.clan_week(); v_feeds int; v_stage int; v_need int; v_vis int; v_lv int;
  v_today int; v_key text;
begin
  perform private.rate_limit('clan_keep', 3000, 3600);
  m := private.clan_require(v_uid);
  select * into cl from public.clans where id = m.clan_id;
  v_lv := private.clan_lv(cl.xp);
  select count(*) into v_feeds from public.clan_spirit_feeds where clan_id = cl.id and day >= v_week;
  v_stage := private.keep_stage(cl.id, v_feeds);
  v_need := private.keep_chest_need(cl.id);
  select count(*) into v_vis from public.clan_visits where clan_id = cl.id and day = v_day;
  select coalesce(sum(stone), 0) into v_today from public.clan_plays where player_id = v_uid and started_at >= v_day::timestamp at time zone 'utc' and finished_at is not null;
  v_key := 'chest:' || cl.id || ':' || v_day;
  return jsonb_build_object(
    'clan', private.clan_card(cl.id) || jsonb_build_object('role', m.role, 'renamed_at', cl.renamed_at),
    'stone', m.stone,
    'stone_today', v_today, 'stone_cap', coalesce((c ->> 'stone_day_cap')::int, 140),
    'spirit', jsonb_build_object('seed', cl.spirit_seed, 'bond', cl.spirit_bond, 'feeds', v_feeds, 'stage', v_stage,
      'name', c -> 'spirit' -> 'names' ->> v_stage, 'names', c -> 'spirit' -> 'names',
      'next', (select min(n) from generate_series(v_feeds + 1, v_feeds + 400) n where private.keep_stage(cl.id, n) > v_stage),
      'fed_today', exists (select 1 from public.clan_spirit_feeds where clan_id = cl.id and day = v_day and player_id = v_uid),
      'feeders_today', (select coalesce(jsonb_agg(private.profile_json(player_id)), '[]'::jsonb) from public.clan_spirit_feeds where clan_id = cl.id and day = v_day),
      'feed_stone', coalesce((c -> 'spirit' ->> 'feed_stone')::int, 8), 'feed_xp', coalesce((c -> 'spirit' ->> 'feed_xp')::int, 60)),
    'chest', jsonb_build_object('need', v_need, 'visitors', v_vis, 'open', v_vis >= v_need,
      'here_today', exists (select 1 from public.clan_visits where clan_id = cl.id and day = v_day and player_id = v_uid),
      'claimed', exists (select 1 from public.clan_claims where player_id = v_uid and key = v_key),
      'claim', case when v_vis >= v_need and exists (select 1 from public.clan_visits where clan_id = cl.id and day = v_day and player_id = v_uid)
                     and not exists (select 1 from public.clan_claims where player_id = v_uid and key = v_key) then v_key end,
      'ink', coalesce((c -> 'chest' ->> 'ink')::int, 30), 'stone', coalesce((c -> 'chest' ->> 'stone')::int, 15),
      'who', (select coalesce(jsonb_agg(private.profile_json(player_id)), '[]'::jsonb) from public.clan_visits where clan_id = cl.id and day = v_day)),
    'builds', (select coalesce(jsonb_agg(b || jsonb_build_object('progress', coalesce(cb.progress, 0), 'done', cb.done_at is not null, 'done_at', cb.done_at,
                 'locked', (b ->> 'level')::int > v_lv) order by (b ->> 'cost')::int), '[]'::jsonb)
               from jsonb_array_elements(c -> 'builds') b left join public.clan_builds cb on cb.clan_id = cl.id and cb.key = b ->> 'key'),
    'training', jsonb_build_object('mine', coalesce((select best from public.clan_training where clan_id = cl.id and week = v_week and player_id = v_uid), 0),
      'board', (select coalesce(jsonb_agg(private.profile_json(t.player_id) || jsonb_build_object('best', t.best) order by t.best desc), '[]'::jsonb)
                from (select * from public.clan_training where clan_id = cl.id and week = v_week order by best desc limit 10) t)),
    'level', v_lv);
end $$;

create or replace function public.clan_spirit_feed() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; c jsonb := private.keep_cfg() -> 'spirit';
  v_day date := private.clan_day(); v_week date := private.clan_week(); v_before int; v_s0 int; v_s1 int; v_xp int;
begin
  perform private.rate_limit('clan_spirit', 60, 3600);
  m := private.clan_require(v_uid);
  perform 1 from public.clans where id = m.clan_id for update;
  select count(*) into v_before from public.clan_spirit_feeds where clan_id = m.clan_id and day >= v_week;
  insert into public.clan_spirit_feeds (clan_id, day, player_id) values (m.clan_id, v_day, v_uid) on conflict do nothing;
  if not found then raise exception 'already_fed' using errcode = 'P0001'; end if;
  v_s0 := private.keep_stage(m.clan_id, v_before); v_s1 := private.keep_stage(m.clan_id, v_before + 1);
  v_xp := coalesce((c ->> 'feed_xp')::int, 60) + case when v_s1 > v_s0 then coalesce((c ->> 'stage_xp')::int, 300) else 0 end;
  update public.clans set xp = xp + v_xp, spirit_bond = spirit_bond + 1 where id = m.clan_id;
  update public.clan_members set stone = stone + coalesce((c ->> 'feed_stone')::int, 8) where player_id = v_uid;
  if v_s1 > v_s0 then perform private.clan_feed_add(m.clan_id, 'spirit', jsonb_build_object('by', v_uid, 'stage', v_s1, 'name', c -> 'names' ->> v_s1)); end if;
  return jsonb_build_object('grew', v_s1 > v_s0, 'stage', v_s1, 'xp', v_xp, 'stone', coalesce((c ->> 'feed_stone')::int, 8));
end $$;

create or replace function public.clan_chest_open() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; c jsonb := private.keep_cfg() -> 'chest'; v_day date := private.clan_day(); v_key text;
begin
  perform private.rate_limit('clan_chest', 60, 3600);
  m := private.clan_require(v_uid);
  perform pg_advisory_xact_lock(hashtext('clan-claim:' || v_uid));
  v_key := 'chest:' || m.clan_id || ':' || v_day;
  if exists (select 1 from public.clan_claims where player_id = v_uid and key = v_key) then raise exception 'already_claimed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.clan_visits where clan_id = m.clan_id and day = v_day and player_id = v_uid) then raise exception 'visit_keep_first' using errcode = 'P0001'; end if;
  if (select count(*) from public.clan_visits where clan_id = m.clan_id and day = v_day) < private.keep_chest_need(m.clan_id) then raise exception 'chest_locked' using errcode = 'P0001'; end if;
  insert into public.clan_claims (player_id, key, ink) values (v_uid, v_key, coalesce((c ->> 'ink')::int, 30));
  update public.clan_members set stone = stone + coalesce((c ->> 'stone')::int, 15) where player_id = v_uid;
  perform private.grant(v_uid, jsonb_build_object('ink', coalesce((c ->> 'ink')::int, 30)), 'clan', 'clan', m.clan_id::text, 'clan-chest:' || v_uid || ':' || v_day);
  return jsonb_build_object('ink', coalesce((c ->> 'ink')::int, 30), 'stone', coalesce((c ->> 'stone')::int, 15));
end $$;

create or replace function public.clan_keep_start(p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; g jsonb := private.keep_cfg() -> 'plays' -> p_game; v_id uuid; v_seed int;
begin
  perform private.rate_limit('clan_keep_play', 120, 3600);
  m := private.clan_require(v_uid);
  if g is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_seed := floor(random() * 2147483647)::int;
  insert into public.clan_plays (player_id, clan_id, game, seed) values (v_uid, m.clan_id, p_game, v_seed) returning id into v_id;
  return jsonb_build_object('id', v_id, 'seed', v_seed, 'seconds', (g ->> 'seconds')::int);
end $$;

create or replace function public.clan_keep_finish(p_id uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.keep_cfg(); pl public.clan_plays%rowtype; g jsonb; v_el numeric; v_score int;
  v_stone int; v_today int; v_cap int; v_best int; v_week date := private.clan_week(); v_day date := private.clan_day(); v_rec boolean := false;
begin
  perform private.rate_limit('clan_keep_finish', 120, 3600);
  select * into pl from public.clan_plays where id = p_id and player_id = v_uid for update;
  if not found or pl.finished_at is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.clan_members where player_id = v_uid and clan_id = pl.clan_id) then raise exception 'not_in_clan' using errcode = 'P0001'; end if;
  g := c -> 'plays' -> pl.game;
  v_el := extract(epoch from now() - pl.started_at);
  -- a round can end early (you quit), but scores scale with the time actually played
  v_score := greatest(0, least(coalesce(p_score, 0), (g ->> 'max_score')::int,
                              ceil((g ->> 'max_score')::numeric * least(1, (v_el + 1) / (g ->> 'seconds')::numeric))::int));
  v_cap := coalesce((c ->> 'stone_day_cap')::int, 140);
  select coalesce(sum(stone), 0) into v_today from public.clan_plays where player_id = v_uid and started_at >= v_day::timestamp at time zone 'utc' and finished_at is not null;
  v_stone := floor(v_score * coalesce((g ->> 'stone_per')::numeric, 0.5))::int + case when v_score > 0 then coalesce((g ->> 'stone_base')::int, 0) else 0 end;
  v_stone := greatest(0, least(v_stone, v_cap - v_today));
  update public.clan_plays set finished_at = now(), score = v_score, stone = v_stone where id = pl.id;
  update public.clan_members set stone = stone + v_stone where player_id = v_uid;
  if pl.game = 'training' then
    select best into v_best from public.clan_training where clan_id = pl.clan_id and week = v_week and player_id = v_uid;
    v_rec := v_best is null or v_score > v_best;
    insert into public.clan_training (clan_id, week, player_id, best) values (pl.clan_id, v_week, v_uid, v_score)
    on conflict (clan_id, week, player_id) do update set best = greatest(clan_training.best, excluded.best);
  end if;
  return jsonb_build_object('score', v_score, 'stone', v_stone, 'capped', v_today + v_stone >= v_cap, 'record', v_rec);
end $$;

create or replace function public.clan_build_give(p_key text, p_amount int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype; b jsonb; cb public.clan_builds%rowtype; v_give int; v_lv int; v_done boolean := false;
begin
  perform private.rate_limit('clan_build', 600, 3600);
  m := private.clan_require(v_uid);
  select e into b from jsonb_array_elements(private.keep_cfg() -> 'builds') e where e ->> 'key' = p_key;
  if b is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  select private.clan_lv(xp) into v_lv from public.clans where id = m.clan_id for update;
  if (b ->> 'level')::int > v_lv then raise exception 'clan_build_locked' using errcode = 'P0001'; end if;
  insert into public.clan_builds (clan_id, key) values (m.clan_id, p_key) on conflict do nothing;
  select * into cb from public.clan_builds where clan_id = m.clan_id and key = p_key for update;
  if cb.done_at is not null then raise exception 'already_built' using errcode = 'P0001'; end if;
  select stone into m.stone from public.clan_members where player_id = v_uid for update;
  v_give := least(greatest(coalesce(p_amount, 0), 0), m.stone, (b ->> 'cost')::int - cb.progress);
  if v_give <= 0 then raise exception 'not_enough_stone' using errcode = 'P0001'; end if;
  update public.clan_members set stone = stone - v_give where player_id = v_uid;
  update public.clan_builds set progress = progress + v_give,
         done_at = case when progress + v_give >= (b ->> 'cost')::int then now() end
   where clan_id = m.clan_id and key = p_key returning done_at is not null into v_done;
  if v_done then
    update public.clans set xp = xp + coalesce((b ->> 'xp')::int, 0) where id = m.clan_id;
    perform private.clan_feed_add(m.clan_id, 'built', jsonb_build_object('by', v_uid, 'name', b ->> 'name', 'emoji', b ->> 'emoji'));
  end if;
  return jsonb_build_object('gave', v_give, 'done', v_done);
end $$;

-- a member in the Keep counts as a visit today (for the chest)
create or replace function private.clan_visit(p_clan uuid, p_uid uuid) returns void language sql as $$
  insert into public.clan_visits (clan_id, day, player_id) select p_clan, private.clan_day(), p_uid
   where exists (select 1 from public.clan_members where clan_id = p_clan and player_id = p_uid) on conflict do nothing;
$$;

create or replace function public.home_live(p_host uuid, p_x real default null, p_z real default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); c jsonb := private.home_cfg();
  v_max int := coalesce((c ->> 'room_size')::int, 10);
  v_stale interval := make_interval(secs => coalesce((c ->> 'stale_seconds')::int, 12));
  me public.home_presence%rowtype; v_shard int; v_new boolean := false; v_clan boolean;
begin
  perform private.rate_limit('home_live', 9000, 3600);
  if not private.room_ok(p_host, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_clan := exists (select 1 from public.clans where id = p_host);
  if v_clan then v_max := greatest(v_max, 16); perform private.clan_visit(p_host, v_uid); end if;
  perform pg_advisory_xact_lock(hashtext('home-live:' || p_host));
  select * into me from public.home_presence where player_id = v_uid;
  if found and me.host_id = p_host and me.seen_at > now() - v_stale then
    v_shard := me.shard;
    if v_clan then perform private.clan_credit(v_uid, 'hall', least(10, greatest(0, floor(extract(epoch from now() - me.seen_at))))::bigint); end if;
  else
    v_new := true;
    if v_uid = p_host then v_shard := 0;
    else
      select shard into v_shard from public.home_presence
       where host_id = p_host and seen_at > now() - v_stale and player_id <> v_uid
       group by shard having count(*) < v_max order by bool_or(player_id = p_host) desc, count(*) desc, shard limit 1;
      if v_shard is null then
        select coalesce(min(n), 0) into v_shard from generate_series(0, 10000) n
         where not exists (select 1 from public.home_presence where host_id = p_host and shard = n and seen_at > now() - v_stale and player_id <> v_uid);
      end if;
    end if;
  end if;
  insert into public.home_presence (player_id, host_id, shard, x, z, joined_at, seen_at)
  values (v_uid, p_host, v_shard, greatest(-7, least(7, coalesce(p_x, 0))), greatest(-6, least(6, coalesce(p_z, 4.6))), now(), now())
  on conflict (player_id) do update set host_id = excluded.host_id, shard = excluded.shard,
    x = coalesce(p_x, case when v_new then excluded.x else home_presence.x end), z = coalesce(p_z, case when v_new then excluded.z else home_presence.z end),
    joined_at = case when v_new then now() else home_presence.joined_at end, seen_at = now();
  return jsonb_build_object('shard', v_shard, 'joined', v_new, 'room_size', v_max, 'channel', 'home:' || p_host || ':' || v_shard,
    'members', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('x', p.x, 'z', p.z,
                  'explorer_style', (select explorer_style from public.profiles where id = p.player_id)) order by p.joined_at), '[]'::jsonb)
                from public.home_presence p
                where p.host_id = p_host and p.shard = v_shard and p.seen_at > now() - v_stale and p.player_id <> v_uid and private.visible_to(p.player_id, v_uid)),
    'in_home', (select count(*) from public.home_presence where host_id = p_host and seen_at > now() - v_stale))
    || private.hg_room(v_uid, p_host, v_shard);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'private' and (p.proname like 'keep\_%' or p.proname in ('clan_visit', 'clan_day')))
               or (n.nspname = 'public' and p.proname in ('clan_rename', 'clan_keep', 'clan_spirit_feed', 'clan_chest_open', 'clan_keep_start', 'clan_keep_finish', 'clan_build_give')) loop
    execute format('revoke all on function %s from public', f.sig);
    if f.nspname = 'public' then
      execute format('revoke all on function %s from anon', f.sig);
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;

-- the hall is the Keep now
update public.game_config set value = replace(value::text, 'Hang out in the clan hall', 'Hang out in the Keep')::jsonb where key = 'clans';
update public.clan_weeks set goals = replace(goals::text, 'Hang out in the clan hall', 'Hang out in the Keep')::jsonb where week >= private.clan_week();
