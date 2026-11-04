-- v0.50 Keeper progression for Inkborn habitats. Everything you already do with your creatures now grows you
-- as a keeper, and grows them too:
--   * Keeper level (XP from caring, jobs, games, springs, hatching, wishes and expeditions), slow at first,
--     then each level a bit longer. Level-ups pay Glimmer ✨, the sanctuary's own currency (no daily cap)
--   * creature levels: each Inkborn gets stronger as it works, plays and is cared for
--   * materials 🫐🍄🪶🐚💎🌠 come home from jobs, games and expeditions…
--   * …and the treat bakery turns them into treats (berry tart, mushroom stew … stardust cake) that make
--     creatures happy, rested and wiser
--   * daily wishes: each creature wants something today (a bath, a game, a quest, a treat…). Grant them
--   * expeditions: send a team of up to three to Sunny Meadow, Whispering Woods … Starfall Valley. Stronger,
--     happier teams (and the right personalities) do better, and bring back treasures for your collection
--   * sanctuary upgrades bought with Glimmer: bigger satchels, lantern paths, training grounds, a deeper spring,
--     a wishing well and treasure maps
--   * two new Inkborn games: Stardust Glide and Crystal Caves
-- None of the existing actions are rewritten: triggers notice what happened and pay the keeper. Ink stays under
-- the Inkborn daily cap.

insert into public.game_config (key, value, description) values ('keeper', '{
  "enabled": true,
  "max_level": 60, "creature_max_level": 30,
  "xp": {"bond": 2, "spring": 3, "new_creature": 25, "wish": 15, "treat": 4, "game_per_points": 6,
         "jobs": {"forage": 8, "explore": 20, "quest": 50}},
  "glimmer": {"level_up_per_level": 20, "spring": 2, "wish": 10, "game_per_points": 8, "jobs": {"forage": 4, "explore": 12, "quest": 30}},
  "creature_xp": {"bond": 5, "jobs": {"forage": 10, "explore": 30, "quest": 80}, "game_per_points": 3},
  "materials": {
    "berries":   {"name": "Berries",   "emoji": "🫐"},
    "mushrooms": {"name": "Mushrooms", "emoji": "🍄"},
    "feathers":  {"name": "Feathers",  "emoji": "🪶"},
    "shells":    {"name": "Shells",    "emoji": "🐚"},
    "crystals":  {"name": "Crystals",  "emoji": "💎"},
    "stardust":  {"name": "Stardust",  "emoji": "🌠"}
  },
  "job_loot": {
    "forage":  {"berries": [2, 4], "mushrooms": [0, 2]},
    "explore": {"feathers": [1, 3], "mushrooms": [1, 3], "shells": [0, 2]},
    "quest":   {"crystals": [1, 3], "feathers": [1, 2], "stardust": [0, 1]}
  },
  "game_loot": {"berrydash": "berries", "fireflies": "stardust", "leafleap": "feathers", "lilyhop": "shells", "songbloom": "berries",
                "stardust": "stardust", "crystals": "crystals"},
  "treats": {
    "berry_tart":     {"name": "Berry tart",     "emoji": "🥧", "level": 1,  "needs": {"berries": 3},                                "happiness": 25, "bond": 2},
    "mushroom_stew":  {"name": "Mushroom stew",  "emoji": "🍲", "level": 2,  "needs": {"mushrooms": 2, "berries": 1},              "energy": 40},
    "feather_cookie": {"name": "Feather cookie", "emoji": "🍪", "level": 3,  "needs": {"feathers": 2, "berries": 2},               "happiness": 15, "energy": 20, "xp": 30},
    "shell_sundae":   {"name": "Shell sundae",   "emoji": "🍨", "level": 5,  "needs": {"shells": 2, "berries": 2},                 "happiness": 10, "xp": 80},
    "crystal_candy":  {"name": "Crystal candy",  "emoji": "🍬", "level": 7,  "needs": {"crystals": 1, "berries": 2},               "xp": 160, "bond": 3},
    "stardust_cake":  {"name": "Stardust cake",  "emoji": "🎂", "level": 10, "needs": {"stardust": 2, "crystals": 1, "berries": 2}, "happiness": 100, "energy": 100, "xp": 300, "bond": 5}
  },
  "upgrades": {
    "satchels":   {"name": "Bigger satchels",  "emoji": "🎒", "desc": "+20% materials from jobs and expeditions, a level", "level": 2,  "base": 40,  "growth": 1.7, "max": 10},
    "lanterns":   {"name": "Lantern path",     "emoji": "🏮", "desc": "Jobs and expeditions finish 7% sooner, a level",   "level": 3,  "base": 60,  "growth": 1.75, "max": 8},
    "training":   {"name": "Training grounds", "emoji": "🎯", "desc": "Creatures gain 15% more XP, a level",              "level": 4,  "base": 80,  "growth": 1.75, "max": 10},
    "spring":     {"name": "Deeper spring",    "emoji": "🫧", "desc": "Ink Springs fill 15% faster, a level",             "level": 5,  "base": 120, "growth": 1.8, "max": 8},
    "well":       {"name": "Wishing well",     "emoji": "⛲", "desc": "+10% Glimmer from everything, a level",            "level": 6,  "base": 150, "growth": 1.85, "max": 10},
    "maps":       {"name": "Treasure maps",    "emoji": "🗺️", "desc": "+4% chance of treasure on expeditions, a level",  "level": 8,  "base": 220, "growth": 1.9, "max": 6}
  },
  "regions": {
    "meadow": {"order": 1, "name": "Sunny Meadow",      "emoji": "🌼", "level": 1,  "minutes": 45,  "power": 6,   "favours": "playful", "glimmer": 15,  "xp": 25,  "cxp": 40,  "ink": 4,
               "loot": {"berries": [3, 6], "feathers": [0, 2]}, "treasures": ["Golden acorn", "Four-leaf clover", "Snail’s tiny hat"]},
    "woods":  {"order": 2, "name": "Whispering Woods",  "emoji": "🌲", "level": 3,  "minutes": 90,  "power": 14,  "favours": "shy",     "glimmer": 30,  "xp": 50,  "cxp": 80,  "ink": 8,
               "loot": {"mushrooms": [3, 6], "feathers": [1, 3]}, "treasures": ["Owl’s lost spectacles", "Glowing toadstool", "Hollow-log music box"]},
    "lagoon": {"order": 3, "name": "Sunken Lagoon",     "emoji": "🏝️", "level": 5,  "minutes": 150, "power": 26,  "favours": "foodie",  "glimmer": 55,  "xp": 90,  "cxp": 140, "ink": 12,
               "loot": {"shells": [3, 6], "crystals": [0, 2]}, "treasures": ["Mermaid’s comb", "Pearl as big as a plum", "Message in a bottle"]},
    "caves":  {"order": 4, "name": "Crystal Caves",     "emoji": "💎", "level": 8,  "minutes": 240, "power": 42,  "favours": "brave",   "glimmer": 90,  "xp": 150, "cxp": 220, "ink": 16,
               "loot": {"crystals": [2, 5], "mushrooms": [1, 3]}, "treasures": ["Singing geode", "Dragon’s old tooth", "Lantern that never goes out"]},
    "peaks":  {"order": 5, "name": "Cloud Peaks",       "emoji": "☁️", "level": 12, "minutes": 360, "power": 65,  "favours": "curious", "glimmer": 140, "xp": 240, "cxp": 330, "ink": 20,
               "loot": {"feathers": [3, 6], "stardust": [1, 2]}, "treasures": ["Bottled rainbow", "Thunderbird feather", "Kite from the sky king"]},
    "stars":  {"order": 6, "name": "Starfall Valley",   "emoji": "🌌", "level": 16, "minutes": 480, "power": 95,  "favours": "sleepy",  "glimmer": 220, "xp": 380, "cxp": 480, "ink": 25,
               "loot": {"stardust": [2, 4], "crystals": [1, 3]}, "treasures": ["Fallen star", "Moon-milk jar", "Comet’s tail ribbon"]}
  },
  "expedition": {"team_max": 3, "energy": 30, "treasure_chance": 0.12, "set_bonus_glimmer": 150},
  "wishes": {"max_per_day": 6, "all_done_ink": 5, "all_done_glimmer": 30,
             "care": ["pet", "feed", "play", "brush", "fetch", "trick", "bathe", "hideseek"], "jobs": ["forage", "explore", "quest"]}
}', 'Inkborn keepers: keeper and creature levels, Glimmer, materials and where they come from, treats, sanctuary upgrades, expedition regions and treasures, and daily wishes.')
on conflict (key) do nothing;

-- the two new games, played as your creature
update public.game_config
   set value = value || jsonb_build_object('games', coalesce(value -> 'games', '{}'::jsonb) || '{
     "stardust": {"enabled": true, "seconds": 45, "energy": 15, "max_score": 140, "points_per_ink": 5, "max_ink": 25},
     "crystals": {"enabled": true, "seconds": 50, "energy": 15, "max_score": 150, "points_per_ink": 5, "max_ink": 25}
   }'::jsonb)
 where key = 'inkborn' and not (value -> 'games') ? 'stardust';

create table if not exists public.keeper_state (
  player_id uuid primary key references public.players (id) on delete cascade,
  xp numeric not null default 0,
  glimmer numeric not null default 0,
  materials jsonb not null default '{}'::jsonb,   -- {"berries": 4, ...}
  treats jsonb not null default '{}'::jsonb,      -- {"berry_tart": 1, ...}
  upgrades jsonb not null default '{}'::jsonb,    -- {"satchels": 2, ...}
  treasures jsonb not null default '[]'::jsonb,   -- ["meadow:0", "woods:2", ...]
  events_seen bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.keeper_state enable row level security;
revoke all on public.keeper_state from anon, authenticated;

create table if not exists public.keeper_creatures (
  inkborn_id uuid primary key references public.inkborn (id) on delete cascade,
  xp numeric not null default 0
);
alter table public.keeper_creatures enable row level security;
revoke all on public.keeper_creatures from anon, authenticated;

create table if not exists public.keeper_wishes (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.players (id) on delete cascade,
  day timestamptz not null,
  inkborn_id uuid not null references public.inkborn (id) on delete cascade,
  kind text not null check (kind in ('care', 'job', 'game', 'treat')),
  target text,
  done_at timestamptz, claimed_at timestamptz,
  unique (owner_id, day, inkborn_id)
);
alter table public.keeper_wishes enable row level security;
revoke all on public.keeper_wishes from anon, authenticated;

create table if not exists public.keeper_expeditions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  region text not null,
  team uuid[] not null,
  power numeric not null, chance numeric not null,
  started_at timestamptz not null default now(), ends_at timestamptz not null,
  result jsonb, claimed_at timestamptz
);
create index if not exists keeper_expeditions_owner_idx on public.keeper_expeditions (owner_id, started_at desc);
alter table public.keeper_expeditions enable row level security;
revoke all on public.keeper_expeditions from anon, authenticated;

create table if not exists public.keeper_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.players (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null,
  data jsonb not null default '{}'::jsonb
);
create index if not exists keeper_events_owner_idx on public.keeper_events (owner_id, id desc);
alter table public.keeper_events enable row level security;
revoke all on public.keeper_events from anon, authenticated;

-- ---- levels and the keeper's purse ---------------------------------------------------------------------
create or replace function private.keeper_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('keeper'), '{}'::jsonb) $$;
create or replace function private.keeper_level_xp(p_level int) returns numeric language sql immutable as $$
  select case when p_level <= 1 then 0 else round(40 * power(p_level - 1, 1.55) + 10 * (p_level - 1)) end
$$;
create or replace function private.keeper_level_of(p_xp numeric) returns int language sql immutable as $$
  select coalesce(max(n), 1) from generate_series(1, 60) n where private.keeper_level_xp(n) <= coalesce(p_xp, 0)
$$;
create or replace function private.creature_level_xp(p_level int) returns numeric language sql immutable as $$
  select case when p_level <= 1 then 0 else round(30 * power(p_level - 1, 1.6)) end
$$;
create or replace function private.creature_level_of(p_xp numeric) returns int language sql immutable as $$
  select coalesce(max(n), 1) from generate_series(1, 30) n where private.creature_level_xp(n) <= coalesce(p_xp, 0)
$$;
create or replace function private.keeper_lock(p_uid uuid) returns public.keeper_state language plpgsql as $$
declare r public.keeper_state%rowtype;
begin
  insert into public.keeper_state (player_id) values (p_uid) on conflict do nothing;
  select * into r from public.keeper_state where player_id = p_uid for update;
  return r;
end $$;
create or replace function private.keeper_up(p_uid uuid, p_key text) returns int language sql stable as $$
  select coalesce((select (upgrades ->> p_key)::int from public.keeper_state where player_id = p_uid), 0)
$$;
create or replace function private.keeper_level(p_uid uuid) returns int language sql stable as $$
  select private.keeper_level_of((select xp from public.keeper_state where player_id = p_uid))
$$;
create or replace function private.creature_level(p_id uuid) returns int language sql stable as $$
  select private.creature_level_of((select xp from public.keeper_creatures where inkborn_id = p_id))
$$;
create or replace function private.keeper_event(p_uid uuid, p_kind text, p_data jsonb) returns void language plpgsql as $$
begin
  insert into public.keeper_events (owner_id, kind, data) values (p_uid, p_kind, p_data);
  -- keep the log short
  delete from public.keeper_events where owner_id = p_uid and id < (select min(id) from (select id from public.keeper_events where owner_id = p_uid order by id desc limit 60) x);
end $$;

/** Pay the keeper: XP, Glimmer (the wishing well adds to it) and materials (satchels add to loot when asked).
    Logs one event, and level-ups pay Glimmer of their own. Returns what was actually given. */
create or replace function private.keeper_add(p_uid uuid, p_xp numeric, p_glimmer numeric, p_materials jsonb, p_kind text, p_data jsonb default '{}'::jsonb, p_loot boolean default false)
returns jsonb language plpgsql as $$
declare cfg jsonb := private.keeper_cfg(); r public.keeper_state%rowtype; v_before int; v_after int; v_gl numeric; v_lvlgl numeric := 0; v_mats jsonb := '{}'::jsonb; k record; v_n int; v_out jsonb;
begin
  if p_uid is null or not coalesce((cfg ->> 'enabled')::boolean, true) then return '{}'::jsonb; end if;
  r := private.keeper_lock(p_uid);
  v_gl := round(coalesce(p_glimmer, 0) * (1 + 0.1 * coalesce((r.upgrades ->> 'well')::int, 0)));
  for k in select key, value::numeric n from jsonb_each_text(coalesce(p_materials, '{}'::jsonb)) loop
    v_n := case when p_loot then floor(k.n * (1 + 0.2 * coalesce((r.upgrades ->> 'satchels')::int, 0)) + random())::int else k.n::int end;
    if v_n > 0 then v_mats := v_mats || jsonb_build_object(k.key, v_n); end if;
  end loop;
  v_before := private.keeper_level_of(r.xp);
  v_after := private.keeper_level_of(r.xp + greatest(0, coalesce(p_xp, 0)));
  if v_after > v_before then
    select sum(n * coalesce((cfg -> 'glimmer' ->> 'level_up_per_level')::int, 20)) into v_lvlgl from generate_series(v_before + 1, v_after) n;
  end if;
  update public.keeper_state set xp = xp + greatest(0, coalesce(p_xp, 0)), glimmer = glimmer + v_gl + v_lvlgl,
         materials = (select coalesce(jsonb_object_agg(key, val), '{}'::jsonb) from (
            select key, sum(value::int) val from (select * from jsonb_each_text(materials) union all select * from jsonb_each_text(v_mats)) a group by key) b),
         updated_at = now()
   where player_id = p_uid;
  v_out := jsonb_build_object('xp', greatest(0, coalesce(p_xp, 0)), 'glimmer', v_gl, 'materials', v_mats, 'level_up', v_after - v_before, 'level', v_after, 'level_glimmer', v_lvlgl);
  if p_kind is not null and (coalesce(p_xp, 0) > 0 or v_gl > 0 or v_mats <> '{}'::jsonb) then perform private.keeper_event(p_uid, p_kind, coalesce(p_data, '{}'::jsonb) || v_out); end if;
  return v_out;
end $$;

/** A creature grows (training grounds add to it). Returns levels gained. */
create or replace function private.creature_add_xp(p_id uuid, p_xp numeric) returns int language plpgsql as $$
declare v_owner uuid; v_before int; v_after int; v_x numeric; v_name text;
begin
  if p_id is null or coalesce(p_xp, 0) <= 0 then return 0; end if;
  select owner_id, name into v_owner, v_name from public.inkborn where id = p_id;
  if v_owner is null then return 0; end if;
  v_x := p_xp * (1 + 0.15 * private.keeper_up(v_owner, 'training'));
  insert into public.keeper_creatures (inkborn_id) values (p_id) on conflict do nothing;
  select private.creature_level_of(xp) into v_before from public.keeper_creatures where inkborn_id = p_id for update;
  update public.keeper_creatures set xp = xp + v_x where inkborn_id = p_id;
  v_after := private.creature_level(p_id);
  if v_after > v_before then perform private.keeper_event(v_owner, 'creature_level', jsonb_build_object('inkborn', p_id, 'name', v_name, 'level', v_after)); end if;
  return v_after - v_before;
end $$;

create or replace function private.keeper_roll(p_spec jsonb) returns jsonb language sql volatile as $$
  select coalesce(jsonb_object_agg(key, n), '{}'::jsonb) from (
    select key, (value ->> 0)::int + floor(random() * ((value ->> 1)::int - (value ->> 0)::int + 1))::int n from jsonb_each(coalesce(p_spec, '{}'::jsonb))) x where n > 0
$$;

-- ---- wishes ----------------------------------------------------------------------------------------------
/** Today's wishes: one for each of up to six creatures (the ones at home, most-loved first). */
create or replace function private.keeper_wishes_make(p_uid uuid) returns void language plpgsql as $$
declare cfg jsonb := private.keeper_cfg(); w jsonb := cfg -> 'wishes'; v_day timestamptz := private.day_start(now()); c record; v_roll double precision; v_kind text; v_target text; v_lvl int := private.keeper_level(p_uid);
begin
  if exists (select 1 from public.keeper_wishes where owner_id = p_uid and day = v_day) then return; end if;
  for c in select id from public.inkborn where owner_id = p_uid order by bond desc, created_at limit coalesce((w ->> 'max_per_day')::int, 6) loop
    v_roll := random();
    if v_roll < 0.45 then v_kind := 'care'; v_target := (w -> 'care') ->> floor(random() * jsonb_array_length(w -> 'care'))::int;
    elsif v_roll < 0.65 then v_kind := 'job'; v_target := (w -> 'jobs') ->> floor(random() * least(jsonb_array_length(w -> 'jobs'), 1 + v_lvl / 3))::int;
    elsif v_roll < 0.85 then v_kind := 'game'; v_target := null;
    else
      v_kind := 'treat';
      select key into v_target from jsonb_each(cfg -> 'treats') where (value ->> 'level')::int <= v_lvl order by random() limit 1;
      if v_target is null then v_kind := 'game'; end if;
    end if;
    insert into public.keeper_wishes (owner_id, day, inkborn_id, kind, target) values (p_uid, v_day, c.id, v_kind, v_target) on conflict do nothing;
  end loop;
end $$;
/** Something happened that a creature might have wished for today. */
create or replace function private.keeper_wish_hit(p_creature uuid, p_kind text, p_target text) returns void language plpgsql as $$
declare v_owner uuid; v_name text; n int;
begin
  select owner_id, name into v_owner, v_name from public.inkborn where id = p_creature;
  if v_owner is null then return; end if;
  update public.keeper_wishes set done_at = now()
   where owner_id = v_owner and day = private.day_start(now()) and inkborn_id = p_creature and done_at is null and kind = p_kind and (target is null or target = p_target);
  get diagnostics n = row_count;
  if n > 0 then perform private.keeper_event(v_owner, 'wish_done', jsonb_build_object('inkborn', p_creature, 'name', v_name, 'kind', p_kind, 'target', p_target)); end if;
end $$;

-- ---- triggers: everything you already do pays the keeper ---------------------------------------------------
create or replace function private.keeper_inkborn_before_trg() returns trigger language plpgsql as $$
declare v_lvl int;
begin
  -- creatures on an expedition come home only with the expedition
  if old.job = 'expedition' and new.job is distinct from 'expedition' and coalesce(current_setting('landvas.expedition_home', true), '') <> 'on' then
    raise exception 'on_expedition' using errcode = 'P0001';
  end if;
  -- lantern paths: jobs finish sooner
  if old.job is null and new.job is not null and new.job <> 'expedition' and new.job_until is not null and new.job_started is not null then
    v_lvl := private.keeper_up(new.owner_id, 'lanterns');
    if v_lvl > 0 then new.job_until := new.job_started + (new.job_until - new.job_started) * greatest(0.3, 1 - 0.07 * v_lvl); end if;
  end if;
  return new;
end $$;
drop trigger if exists keeper_inkborn_before on public.inkborn;
create trigger keeper_inkborn_before before update on public.inkborn for each row execute function private.keeper_inkborn_before_trg();

create or replace function private.keeper_inkborn_after_trg() returns trigger language plpgsql as $$
declare cfg jsonb := private.keeper_cfg(); v_delta int; k record;
begin
  if tg_op = 'INSERT' then
    perform private.keeper_add(new.owner_id, coalesce((cfg -> 'xp' ->> 'new_creature')::numeric, 25), 0, null, 'new_creature', jsonb_build_object('inkborn', new.id, 'name', new.name));
    return new;
  end if;
  -- a closer bond: XP for the keeper and the creature
  v_delta := new.bond - old.bond;
  if v_delta > 0 then
    perform private.keeper_add(new.owner_id, v_delta * coalesce((cfg -> 'xp' ->> 'bond')::numeric, 2), 0, null, null);
    perform private.creature_add_xp(new.id, v_delta * coalesce((cfg -> 'creature_xp' ->> 'bond')::numeric, 5));
  end if;
  -- a job's done and collected: XP, Glimmer and what they found
  if old.job is not null and old.job <> 'expedition' and new.job is null then
    perform private.keeper_add(new.owner_id, coalesce((cfg -> 'xp' -> 'jobs' ->> old.job)::numeric, 5), coalesce((cfg -> 'glimmer' -> 'jobs' ->> old.job)::numeric, 2),
      private.keeper_roll(cfg -> 'job_loot' -> old.job), 'job', jsonb_build_object('inkborn', new.id, 'name', new.name, 'job', old.job), true);
    perform private.creature_add_xp(new.id, coalesce((cfg -> 'creature_xp' -> 'jobs' ->> old.job)::numeric, 10));
  end if;
  -- wishes: sent on a job, or cared for
  if old.job is null and new.job is not null and new.job <> 'expedition' then perform private.keeper_wish_hit(new.id, 'job', new.job); end if;
  if new.care_at is distinct from old.care_at then
    for k in select key from jsonb_each_text(new.care_at) where (old.care_at ->> key) is distinct from (new.care_at ->> key) loop
      perform private.keeper_wish_hit(new.id, 'care', k.key);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists keeper_inkborn_after on public.inkborn;
create trigger keeper_inkborn_after after insert or update on public.inkborn for each row execute function private.keeper_inkborn_after_trg();

create or replace function private.keeper_game_trg() returns trigger language plpgsql as $$
declare cfg jsonb := private.keeper_cfg(); v_mat text; v_max int; v_n int;
begin
  if old.finished_at is null and new.finished_at is not null and coalesce(new.score, 0) > 0 then
    v_mat := cfg -> 'game_loot' ->> new.game;
    v_max := coalesce((private.ink_cfg() -> 'games' -> new.game ->> 'max_score')::int, 100);
    v_n := least(6, floor(new.score::numeric / greatest(1, v_max / 5.0)))::int;
    perform private.keeper_add(new.owner_id, floor(new.score / coalesce((cfg -> 'xp' ->> 'game_per_points')::numeric, 6)), floor(new.score / coalesce((cfg -> 'glimmer' ->> 'game_per_points')::numeric, 8)),
      case when v_mat is not null and v_n > 0 then jsonb_build_object(v_mat, v_n) else null end, 'game',
      jsonb_build_object('inkborn', new.inkborn_id, 'game', new.game, 'score', new.score));
    perform private.creature_add_xp(new.inkborn_id, floor(new.score / coalesce((cfg -> 'creature_xp' ->> 'game_per_points')::numeric, 3)));
    if new.inkborn_id is not null then perform private.keeper_wish_hit(new.inkborn_id, 'game', new.game); end if;
  end if;
  return new;
end $$;
drop trigger if exists keeper_game on public.inkborn_games;
create trigger keeper_game after update on public.inkborn_games for each row execute function private.keeper_game_trg();

create or replace function private.keeper_spring_trg() returns trigger language plpgsql as $$
declare cfg jsonb := private.keeper_cfg();
begin
  if new.spring_at > old.spring_at + interval '10 minutes' then
    perform private.keeper_add(new.owner_id, coalesce((cfg -> 'xp' ->> 'spring')::numeric, 3), coalesce((cfg -> 'glimmer' ->> 'spring')::numeric, 2), null, 'spring', jsonb_build_object('habitat', new.id));
  end if;
  return new;
end $$;
drop trigger if exists keeper_spring on public.habitats;
create trigger keeper_spring after update of spring_at on public.habitats for each row execute function private.keeper_spring_trg();

-- the deeper-spring upgrade: springs fill faster
create or replace function private.spring_state(h public.habitats) returns jsonb
language sql stable as $$
  with s as (select coalesce(private.ink_cfg() -> 'spring', '{}'::jsonb) cfg, 1 + 0.15 * private.keeper_up(h.owner_id, 'spring') boost),
  n as (
    select
      (select count(*) from public.inkborn c where c.habitat_id = h.id and c.job is null
         and (private.inkborn_now(c) ->> 'happiness')::int >= coalesce((s.cfg ->> 'min_happiness')::int, 50)) happy,
      least((select count(*) from jsonb_array_elements(h.layout) e where e ->> 'k' = 'inkspring'), coalesce((s.cfg ->> 'max_springs')::int, 3)) springs,
      least(extract(epoch from (now() - h.spring_at)) / 3600, coalesce((s.cfg ->> 'max_hours')::numeric, 12)) hours,
      s.cfg, s.boost
    from s)
  select jsonb_build_object(
    'happy', happy, 'springs', springs, 'hours', round(hours::numeric, 2),
    'rate', round((happy * coalesce((cfg ->> 'per_creature_hour')::numeric, 2) + springs * coalesce((cfg ->> 'per_spring_hour')::numeric, 1)) * boost, 1),
    'ready', floor(hours * (happy * coalesce((cfg ->> 'per_creature_hour')::numeric, 2) + springs * coalesce((cfg ->> 'per_spring_hour')::numeric, 1)) * boost)::int,
    'full_in_hours', round(greatest(0, coalesce((cfg ->> 'max_hours')::numeric, 12) - hours)::numeric, 2),
    'enabled', coalesce((cfg ->> 'enabled')::boolean, true))
  from n
$$;

-- creatures show their level
create or replace function private.inkborn_json(c public.inkborn, p_viewer uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'source', c.source, 'genome', c.genome, 'personality', c.personality,
    'habitat_id', c.habitat_id, 'bond', c.bond, 'created_at', c.created_at, 'portrait_status', c.portrait_status, 'portrait_path', c.portrait_path,
    'mine', c.owner_id = p_viewer, 'last_fed', c.last_fed, 'last_played', c.last_played,
    'job', c.job, 'job_until', c.job_until, 'job_started', c.job_started,
    'level', private.creature_level(c.id), 'xp', coalesce((select round(xp) from public.keeper_creatures where inkborn_id = c.id), 0))
    || private.inkborn_now(c)
    || case when c.owner_id = p_viewer then jsonb_build_object('drawing', c.drawing) else '{}'::jsonb end
$$;

-- ---- expeditions ---------------------------------------------------------------------------------------------
/** How strong one creature is on an expedition to a region. */
create or replace function private.expedition_power(c public.inkborn, p_region jsonb) returns numeric language sql stable as $$
  select (3 + private.creature_level(c.id) * 2 + c.bond / 20.0)
       * case when c.personality = p_region ->> 'favours' then 1.5 else 1 end
       * (0.5 + 0.5 * (private.inkborn_now(c) ->> 'happiness')::numeric / 100)
$$;

/** Everything about your keeping (for the Keeper's Lodge). */
create or replace function private.keeper_json(p_uid uuid) returns jsonb language plpgsql as $$
declare cfg jsonb := private.keeper_cfg(); r public.keeper_state%rowtype; v_lvl int;
begin
  r := private.keeper_lock(p_uid);
  perform private.keeper_wishes_make(p_uid);
  v_lvl := private.keeper_level_of(r.xp);
  return jsonb_build_object(
    'level', v_lvl, 'xp', round(r.xp), 'level_xp', private.keeper_level_xp(v_lvl), 'next_xp', private.keeper_level_xp(v_lvl + 1),
    'glimmer', floor(r.glimmer), 'materials', r.materials, 'treats', r.treats, 'upgrades', r.upgrades, 'treasures', r.treasures,
    'upgrade_costs', (select jsonb_object_agg(key, round((value ->> 'base')::numeric * power((value ->> 'growth')::numeric, coalesce((r.upgrades ->> key)::int, 0)))) from jsonb_each(cfg -> 'upgrades')),
    'creatures', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'genome', c.genome, 'personality', c.personality, 'bond', c.bond,
        'level', private.creature_level(c.id), 'xp', coalesce((select round(xp) from public.keeper_creatures k where k.inkborn_id = c.id), 0),
        'level_xp', private.creature_level_xp(private.creature_level(c.id)), 'next_xp', private.creature_level_xp(private.creature_level(c.id) + 1),
        'job', c.job, 'job_until', c.job_until) || private.inkborn_now(c) order by c.bond desc, c.created_at)
      from public.inkborn c where c.owner_id = p_uid), '[]'::jsonb),
    'wishes', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'inkborn', w.inkborn_id, 'name', c.name, 'kind', w.kind, 'target', w.target, 'done', w.done_at is not null, 'claimed', w.claimed_at is not null) order by w.id)
      from public.keeper_wishes w join public.inkborn c on c.id = w.inkborn_id where w.owner_id = p_uid and w.day = private.day_start(now())), '[]'::jsonb),
    'expeditions', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'region', e.region, 'team', e.team, 'power', round(e.power, 1), 'chance', round(e.chance, 2),
        'started_at', e.started_at, 'ends_at', e.ends_at, 'done', e.ends_at <= now(), 'result', e.result, 'claimed', e.claimed_at is not null) order by e.started_at desc)
      from (select * from public.keeper_expeditions where owner_id = p_uid and (claimed_at is null or claimed_at > now() - interval '1 day') order by started_at desc limit 8) e), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'kind', e.kind, 'data', e.data) order by e.id)
      from (select * from public.keeper_events where owner_id = p_uid and id > r.events_seen order by id desc limit 12) e), '[]'::jsonb),
    'resets_at', private.day_start(now()) + interval '1 day',
    'config', cfg, 'server_time', now());
end $$;

create or replace function public.keeper_get() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return private.keeper_json(v_uid);
end $$;

/** Mark the keeper's news as seen (so the toasts don't show again). */
create or replace function public.keeper_events_seen(p_upto bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  update public.keeper_state set events_seen = greatest(events_seen, coalesce(p_upto, 0)) where player_id = v_uid;
end $$;

/** Buy the next level of a sanctuary upgrade with Glimmer. */
create or replace function public.keeper_upgrade(p_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); u jsonb := private.keeper_cfg() -> 'upgrades' -> p_key; r public.keeper_state%rowtype; v_lvl int; v_cost numeric;
begin
  if u is null then raise exception 'invalid_upgrade' using errcode = 'P0001'; end if;
  r := private.keeper_lock(v_uid);
  if private.keeper_level_of(r.xp) < coalesce((u ->> 'level')::int, 1) then raise exception 'keeper_level_needed' using errcode = 'P0001', detail = u ->> 'level'; end if;
  v_lvl := coalesce((r.upgrades ->> p_key)::int, 0);
  if v_lvl >= coalesce((u ->> 'max')::int, 10) then raise exception 'maxed' using errcode = 'P0001'; end if;
  v_cost := round((u ->> 'base')::numeric * power((u ->> 'growth')::numeric, v_lvl));
  if r.glimmer < v_cost then raise exception 'not_enough_glimmer' using errcode = 'P0001', detail = v_cost::text; end if;
  update public.keeper_state set glimmer = glimmer - v_cost, upgrades = upgrades || jsonb_build_object(p_key, v_lvl + 1), updated_at = now() where player_id = v_uid;
  return private.keeper_json(v_uid) || jsonb_build_object('bought', p_key, 'to', v_lvl + 1, 'spent', v_cost);
end $$;

/** Bake treats from materials. */
create or replace function public.keeper_bake(p_treat text, p_times int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); t jsonb := private.keeper_cfg() -> 'treats' -> p_treat; r public.keeper_state%rowtype; v_t int := greatest(1, least(20, coalesce(p_times, 1))); k record; v_mats jsonb;
begin
  perform private.rate_limit('keeper_act', 600, 3600);
  if t is null then raise exception 'invalid_treat' using errcode = 'P0001'; end if;
  r := private.keeper_lock(v_uid);
  if private.keeper_level_of(r.xp) < coalesce((t ->> 'level')::int, 1) then raise exception 'keeper_level_needed' using errcode = 'P0001', detail = t ->> 'level'; end if;
  v_mats := r.materials;
  for k in select key, value::int n from jsonb_each_text(t -> 'needs') loop
    if coalesce((v_mats ->> k.key)::int, 0) < k.n * v_t then raise exception 'not_enough_materials' using errcode = 'P0001', detail = k.key; end if;
    v_mats := v_mats || jsonb_build_object(k.key, (v_mats ->> k.key)::int - k.n * v_t);
  end loop;
  update public.keeper_state set materials = v_mats, treats = treats || jsonb_build_object(p_treat, coalesce((treats ->> p_treat)::int, 0) + v_t), updated_at = now() where player_id = v_uid;
  perform private.keeper_add(v_uid, v_t * coalesce((private.keeper_cfg() -> 'xp' ->> 'treat')::numeric, 4), 0, null, null);
  return private.keeper_json(v_uid) || jsonb_build_object('baked', p_treat, 'times', v_t);
end $$;

/** Give a creature a treat. */
create or replace function public.keeper_feed_treat(p_id uuid, p_treat text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); t jsonb := private.keeper_cfg() -> 'treats' -> p_treat; r public.keeper_state%rowtype; c public.inkborn%rowtype; v_now jsonb; v_up int;
begin
  perform private.rate_limit('keeper_act', 600, 3600);
  if t is null then raise exception 'invalid_treat' using errcode = 'P0001'; end if;
  r := private.keeper_lock(v_uid);
  if coalesce((r.treats ->> p_treat)::int, 0) < 1 then raise exception 'no_treat' using errcode = 'P0001'; end if;
  select * into c from public.inkborn where id = p_id for update;
  if not found or c.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if c.job is not null then raise exception 'inkborn_busy' using errcode = 'P0001'; end if;
  update public.keeper_state set treats = treats || jsonb_build_object(p_treat, (treats ->> p_treat)::int - 1) where player_id = v_uid;
  v_now := private.inkborn_now(c);
  update public.inkborn set happiness = least(100, (v_now ->> 'happiness')::int + coalesce((t ->> 'happiness')::int, 0)),
         energy = least(100, (v_now ->> 'energy')::int + coalesce((t ->> 'energy')::int, 0)), stats_at = now(),
         bond = bond + coalesce((t ->> 'bond')::int, 0), last_fed = now(), updated_at = now()
   where id = c.id returning * into c;
  v_up := private.creature_add_xp(c.id, coalesce((t ->> 'xp')::numeric, 0));
  perform private.keeper_wish_hit(c.id, 'treat', p_treat);
  return private.keeper_json(v_uid) || jsonb_build_object('fed', p_treat, 'creature', private.inkborn_json(c, v_uid), 'creature_level_up', v_up);
end $$;

/** Grant a wish that's come true: Glimmer, XP and a little more bond. Granting them all pays a bonus. */
create or replace function public.keeper_wish_claim(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); cfg jsonb := private.keeper_cfg(); w public.keeper_wishes%rowtype; v_all boolean := false; v_ink int := 0; v_r jsonb;
begin
  perform private.rate_limit('keeper_act', 600, 3600);
  select * into w from public.keeper_wishes where id = p_id for update;
  if not found or w.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if w.claimed_at is not null then raise exception 'already_done' using errcode = 'P0001'; end if;
  if w.done_at is null then raise exception 'not_done_yet' using errcode = 'P0001'; end if;
  update public.keeper_wishes set claimed_at = now() where id = w.id;
  update public.inkborn set bond = bond + 2, updated_at = now() where id = w.inkborn_id;
  v_r := private.keeper_add(v_uid, coalesce((cfg -> 'xp' ->> 'wish')::numeric, 15), coalesce((cfg -> 'glimmer' ->> 'wish')::numeric, 10), null, null);
  if not exists (select 1 from public.keeper_wishes where owner_id = v_uid and day = w.day and claimed_at is null) then
    v_all := true;
    perform private.keeper_add(v_uid, 0, coalesce((cfg -> 'wishes' ->> 'all_done_glimmer')::numeric, 30), null, null);
    v_ink := private.inkborn_pay(v_uid, coalesce((cfg -> 'wishes' ->> 'all_done_ink')::int, 5), 'keeper', 'wishes', 'wishes:' || v_uid || ':' || w.day::date);
  end if;
  return private.keeper_json(v_uid) || jsonb_build_object('granted', v_r, 'all_done', v_all, 'ink', v_ink, 'balances', private.balances(v_uid));
end $$;

/** Send a team (up to three creatures with the energy for it) on an expedition. */
create or replace function public.keeper_expedition_start(p_region text, p_team jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); cfg jsonb := private.keeper_cfg(); reg jsonb := cfg -> 'regions' -> p_region; x jsonb := cfg -> 'expedition';
  v_ids uuid[]; c public.inkborn%rowtype; v_power numeric := 0; v_chance numeric; v_mins numeric; v_end timestamptz; e public.keeper_expeditions%rowtype; v_now jsonb;
begin
  perform private.rate_limit('keeper_expedition', 60, 3600);
  if reg is null then raise exception 'invalid_region' using errcode = 'P0001'; end if;
  if private.keeper_level(v_uid) < coalesce((reg ->> 'level')::int, 1) then raise exception 'keeper_level_needed' using errcode = 'P0001', detail = reg ->> 'level'; end if;
  select array_agg(distinct v::uuid) into v_ids from jsonb_array_elements_text(coalesce(p_team, '[]'::jsonb)) v;
  if v_ids is null or cardinality(v_ids) = 0 or cardinality(v_ids) > coalesce((x ->> 'team_max')::int, 3) then raise exception 'invalid_team' using errcode = 'P0001'; end if;
  v_mins := coalesce((reg ->> 'minutes')::numeric, 60) * greatest(0.3, 1 - 0.07 * private.keeper_up(v_uid, 'lanterns'));
  v_end := now() + make_interval(secs => v_mins * 60);
  for c in select * from public.inkborn where id = any(v_ids) for update loop
    if c.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
    if c.job is not null then raise exception 'inkborn_busy' using errcode = 'P0001', detail = c.name; end if;
    v_now := private.inkborn_now(c);
    if (v_now ->> 'energy')::int < coalesce((x ->> 'energy')::int, 30) then raise exception 'inkborn_tired' using errcode = 'P0001', detail = c.name; end if;
    v_power := v_power + private.expedition_power(c, reg);
    update public.inkborn set job = 'expedition', job_started = now(), job_until = v_end, energy = (v_now ->> 'energy')::int - coalesce((x ->> 'energy')::int, 30),
           happiness = (v_now ->> 'happiness')::int, stats_at = now(), updated_at = now() where id = c.id;
  end loop;
  if (select count(*) from public.inkborn where id = any(v_ids)) <> cardinality(v_ids) then raise exception 'not_owner' using errcode = 'P0001'; end if;
  v_chance := least(0.97, greatest(0.15, 0.75 * v_power / greatest(1, (reg ->> 'power')::numeric)));
  insert into public.keeper_expeditions (owner_id, region, team, power, chance, ends_at) values (v_uid, p_region, v_ids, v_power, v_chance, v_end) returning * into e;
  return private.keeper_json(v_uid) || jsonb_build_object('started', e.id, 'chance', round(v_chance, 2));
end $$;

/** Bring an expedition home: success (or not), what they found, maybe a treasure, and XP for everyone. */
create or replace function public.keeper_expedition_claim(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); cfg jsonb := private.keeper_cfg(); e public.keeper_expeditions%rowtype; reg jsonb; v_ok boolean; v_frac numeric;
  v_loot jsonb; v_add jsonb; v_treasure text; v_idx int; v_ink int := 0; r public.keeper_state%rowtype; v_set boolean := false; v_result jsonb; m record;
begin
  perform private.rate_limit('keeper_act', 600, 3600);
  select * into e from public.keeper_expeditions where id = p_id for update;
  if not found or e.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if e.claimed_at is not null then raise exception 'already_done' using errcode = 'P0001'; end if;
  if e.ends_at > now() then raise exception 'job_not_done' using errcode = 'P0001'; end if;
  reg := cfg -> 'regions' -> e.region;
  v_ok := random() < e.chance;
  v_frac := case when v_ok then 1 else 0.4 end;
  -- what they found (a partial haul if things went wrong)
  v_loot := '{}'::jsonb;
  for m in select key, value::int n from jsonb_each_text(private.keeper_roll(reg -> 'loot')) loop
    if floor(m.n * v_frac) > 0 then v_loot := v_loot || jsonb_build_object(m.key, floor(m.n * v_frac)::int); end if;
  end loop;
  v_add := private.keeper_add(v_uid, coalesce((reg ->> 'xp')::numeric, 20) * v_frac, coalesce((reg ->> 'glimmer')::numeric, 10) * v_frac, v_loot, null, '{}'::jsonb, true);
  -- a treasure for the collection, sometimes
  r := private.keeper_lock(v_uid);
  if v_ok and random() < coalesce((cfg -> 'expedition' ->> 'treasure_chance')::numeric, 0.12) + 0.04 * coalesce((r.upgrades ->> 'maps')::int, 0) + greatest(0, e.chance - 0.75) * 0.5 then
    select i - 1 into v_idx from generate_series(1, jsonb_array_length(reg -> 'treasures')) i where not (r.treasures ? (e.region || ':' || (i - 1))) order by random() limit 1;
    if v_idx is not null then
      v_treasure := reg -> 'treasures' ->> v_idx;
      update public.keeper_state set treasures = treasures || to_jsonb(e.region || ':' || v_idx) where player_id = v_uid returning * into r;
      if (select count(*) from jsonb_array_elements_text(r.treasures) t where t like e.region || ':%') = jsonb_array_length(reg -> 'treasures') then
        v_set := true;
        perform private.keeper_add(v_uid, 0, coalesce((cfg -> 'expedition' ->> 'set_bonus_glimmer')::numeric, 150), null, null);
      end if;
    end if;
  end if;
  if v_ok then v_ink := private.inkborn_pay(v_uid, coalesce((reg ->> 'ink')::int, 4), 'keeper', e.id::text, 'expedition:' || e.id); end if;
  -- everyone comes home a little stronger (and a little closer)
  perform set_config('landvas.expedition_home', 'on', true);
  update public.inkborn set job = null, job_until = null, job_started = null, bond = bond + case when v_ok then 3 else 1 end, updated_at = now()
   where id = any(e.team) and job = 'expedition';
  perform set_config('landvas.expedition_home', '', true);
  perform private.creature_add_xp(t, coalesce((reg ->> 'cxp')::numeric, 30) * v_frac) from unnest(e.team) t;
  v_result := jsonb_build_object('success', v_ok, 'loot', v_add -> 'materials', 'glimmer', v_add -> 'glimmer', 'xp', v_add -> 'xp', 'ink', v_ink,
    'treasure', v_treasure, 'set_complete', v_set, 'level_up', v_add -> 'level_up');
  update public.keeper_expeditions set claimed_at = now(), result = v_result where id = e.id;
  perform private.keeper_event(v_uid, 'expedition', v_result || jsonb_build_object('region', e.region));
  return private.keeper_json(v_uid) || jsonb_build_object('result', v_result, 'balances', private.balances(v_uid));
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.keeper_cfg()', 'private.keeper_level_xp(int)', 'private.keeper_level_of(numeric)', 'private.creature_level_xp(int)', 'private.creature_level_of(numeric)',
    'private.keeper_lock(uuid)', 'private.keeper_up(uuid, text)', 'private.keeper_level(uuid)', 'private.creature_level(uuid)', 'private.keeper_event(uuid, text, jsonb)',
    'private.keeper_add(uuid, numeric, numeric, jsonb, text, jsonb, boolean)', 'private.creature_add_xp(uuid, numeric)', 'private.keeper_roll(jsonb)',
    'private.keeper_wishes_make(uuid)', 'private.keeper_wish_hit(uuid, text, text)', 'private.expedition_power(public.inkborn, jsonb)', 'private.keeper_json(uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.keeper_get()', 'public.keeper_events_seen(bigint)', 'public.keeper_upgrade(text)', 'public.keeper_bake(text, int)',
    'public.keeper_feed_treat(uuid, text)', 'public.keeper_wish_claim(bigint)', 'public.keeper_expedition_start(text, jsonb)', 'public.keeper_expedition_claim(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
