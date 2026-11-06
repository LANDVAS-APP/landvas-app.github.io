-- v0.6.7 The Dungeon becomes its own game: lead a party of heroes down, floor by floor. Each floor is a fresh maze
-- of rooms (you only see the rooms next to where you've been): monsters to fight, chests, traps, healing shrines and
-- the stairs down. Every fifth floor a boss guards the stairs. Fights are turn by turn: attack, use a hero's skill
-- (Shield Bash stuns, Volley hits everyone, Fireball burns hard, Prayer heals the party, Backstab finishes the
-- wounded), drink a potion or throw a bomb (both made in your workshop). Go back to camp whenever you like to keep
-- what you found — if the party falls you keep only half. Between runs: hire heroes, train them, choose your party.
--
-- The server runs everything (the map, the dice, the fights); the app only shows what you've seen and sends moves.

insert into public.game_config (key, value, description) values ('realm_dungeon', $cfg${
  "grid": 5, "rooms_min": 9, "rooms_max": 13, "party_size": 3,
  "heroes": {
    "knight": { "name": "Knight", "emoji": "🛡️", "color": "#5B8DEF", "hp": 44, "atk": 6, "def": 3, "level": 1, "cost": 0,
                "skill": { "name": "Shield Bash", "emoji": "🛡️", "kind": "stun", "mult": 1.2, "cd": 3, "blurb": "A heavy blow that stuns the target for a turn. Monsters go for the knight first." } },
    "archer": { "name": "Archer", "emoji": "🏹", "color": "#3DDC97", "hp": 30, "atk": 8, "def": 1, "level": 3, "cost": 300,
                "skill": { "name": "Volley", "emoji": "🏹", "kind": "all", "mult": 0.75, "cd": 3, "blurb": "Arrows rain on every monster." } },
    "mage":   { "name": "Mage", "emoji": "🔮", "color": "#B57BFF", "hp": 24, "atk": 11, "def": 0, "level": 8, "cost": 1500,
                "skill": { "name": "Fireball", "emoji": "🔥", "kind": "big", "mult": 2.4, "cd": 3, "blurb": "A huge blast at one monster." } },
    "cleric": { "name": "Cleric", "emoji": "✨", "color": "#FFD23F", "hp": 28, "atk": 5, "def": 1, "level": 14, "cost": 5000,
                "skill": { "name": "Prayer", "emoji": "✨", "kind": "heal", "mult": 0.4, "cd": 3, "blurb": "Heals the whole party (and brings back anyone who fell)." } },
    "rogue":  { "name": "Rogue", "emoji": "🗡️", "color": "#FF6B6B", "hp": 30, "atk": 9, "def": 1, "level": 20, "cost": 12000,
                "skill": { "name": "Backstab", "emoji": "🗡️", "kind": "execute", "mult": 3, "cd": 2, "blurb": "Triple damage to a monster that's under half health." } }
  },
  "train": { "loot": 40, "mat_per_lv": 4, "max_lv": 30, "hp_per_lv": 0.15, "atk_per_lv": 0.12 },
  "mats": [["bone", 1], ["slime", 3], ["fang", 6], ["dust", 10], ["soul", 15], ["scale", 22]],
  "monsters": [
    { "id": "rat", "name": "Giant rat", "emoji": "🐀", "hp": 10, "atk": 3, "from": 1 },
    { "id": "bat", "name": "Cave bat", "emoji": "🦇", "hp": 8, "atk": 4, "from": 1 },
    { "id": "skeleton", "name": "Skeleton", "emoji": "💀", "hp": 16, "atk": 4, "from": 2 },
    { "id": "goblin", "name": "Goblin", "emoji": "👺", "hp": 18, "atk": 5, "from": 3 },
    { "id": "slime", "name": "Slime", "emoji": "🟢", "hp": 26, "atk": 3, "from": 4 },
    { "id": "spider", "name": "Spider", "emoji": "🕷️", "hp": 20, "atk": 6, "from": 6 },
    { "id": "ghost", "name": "Ghost", "emoji": "👻", "hp": 22, "atk": 7, "from": 9 },
    { "id": "imp", "name": "Imp", "emoji": "😈", "hp": 24, "atk": 8, "from": 12 },
    { "id": "golem", "name": "Golem", "emoji": "🗿", "hp": 50, "atk": 7, "from": 15 },
    { "id": "wyvern", "name": "Wyvern", "emoji": "🐉", "hp": 40, "atk": 10, "from": 20 }
  ],
  "bosses": [
    { "name": "The Bone King", "emoji": "☠️", "hp": 80, "atk": 6 }, { "name": "Slime Queen", "emoji": "🫠", "hp": 120, "atk": 7 },
    { "name": "The Lich", "emoji": "🧟", "hp": 150, "atk": 9 }, { "name": "Fire Golem", "emoji": "🌋", "hp": 200, "atk": 10 },
    { "name": "Elder Dragon", "emoji": "🐲", "hp": 260, "atk": 12 }
  ],
  "scale_hp": 0.2, "scale_atk": 0.11,
  "rooms": { "monster": 0.42, "chest": 0.16, "trap": 0.08, "shrine": 0.08 },
  "loot_per_kill": 3, "loot_per_chest": 10, "death_keep": 0.5, "ink_per_floor": 1, "xp_per_kill": 3, "xp_per_floor": 12,
  "potion_heal": 0.5, "bomb_mult": 1.6, "shrine_heal": 0.4, "trap_dmg": 0.15
}$cfg$::jsonb, 'Dungeon: heroes, monsters, bosses, floors, combat')
on conflict (key) do nothing;

create table if not exists public.realm_dungeons (
  realm_id uuid primary key references public.realms (id) on delete cascade,
  heroes jsonb not null default '{"knight": {"lv": 1}}'::jsonb,
  party jsonb not null default '["knight"]'::jsonb,
  best_floor int not null default 0,
  bosses int not null default 0,
  runs int not null default 0,
  run jsonb
);
alter table public.realm_dungeons enable row level security;
revoke all on public.realm_dungeons from anon, authenticated;

create or replace function private.rdun_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('realm_dungeon'), '{}'::jsonb) $$;
create or replace function private.rdun_row(p_realm uuid) returns public.realm_dungeons language plpgsql as $$
declare d public.realm_dungeons%rowtype;
begin
  select * into d from public.realm_dungeons where realm_id = p_realm for update;
  if found then return d; end if;
  insert into public.realm_dungeons (realm_id) values (p_realm) on conflict do nothing;
  select * into d from public.realm_dungeons where realm_id = p_realm for update;
  return d;
end $$;
create or replace function private.rdun_nb(k text) returns text[] language sql immutable as $$
  select array[(split_part(k, ',', 1)::int) || ',' || (split_part(k, ',', 2)::int - 1), (split_part(k, ',', 1)::int + 1) || ',' || split_part(k, ',', 2),
               split_part(k, ',', 1) || ',' || (split_part(k, ',', 2)::int + 1), (split_part(k, ',', 1)::int - 1) || ',' || split_part(k, ',', 2)]
$$;
/** a fresh floor: a random walk from the bottom middle; the stairs go in the room furthest from the start */
create or replace function private.rdun_floor(p_floor int) returns jsonb language plpgsql volatile as $$
declare c jsonb := private.rdun_cfg(); n int := (c ->> 'grid')::int; want int; cur text; nb text[]; nx text; v_rooms jsonb; k text; far text; fd int := -1; d int; roll numeric; t text;
  x int; y int; v_start text;
begin
  want := (c ->> 'rooms_min')::int + floor(random() * ((c ->> 'rooms_max')::int - (c ->> 'rooms_min')::int + 1))::int;
  v_start := (n / 2) || ',' || (n - 1); cur := v_start; v_rooms := jsonb_build_object(cur, jsonb_build_object('t', 'start', 'done', true, 'seen', true));
  while (select count(*) from jsonb_object_keys(v_rooms)) < want loop
    nb := private.rdun_nb(cur); nx := nb[1 + floor(random() * 4)::int];
    x := split_part(nx, ',', 1)::int; y := split_part(nx, ',', 2)::int;
    if x < 0 or y < 0 or x >= n or y >= n then continue; end if;
    if not v_rooms ? nx then v_rooms := v_rooms || jsonb_build_object(nx, jsonb_build_object('t', 'empty', 'done', false, 'seen', false)); end if;
    cur := nx;
  end loop;
  -- the furthest room (by walking) gets the stairs
  for k in select jsonb_object_keys(v_rooms) loop
    d := abs(split_part(k, ',', 1)::int - n / 2) + abs(split_part(k, ',', 2)::int - (n - 1));
    if d > fd then fd := d; far := k; end if;
  end loop;
  for k in select jsonb_object_keys(v_rooms) loop
    if k = v_start then continue; end if;
    if k = far then t := case when p_floor % 5 = 0 then 'boss' else 'stairs' end;
    else
      roll := random();
      t := case when roll < (c -> 'rooms' ->> 'monster')::numeric then 'monster'
                when roll < (c -> 'rooms' ->> 'monster')::numeric + (c -> 'rooms' ->> 'chest')::numeric then 'chest'
                when roll < (c -> 'rooms' ->> 'monster')::numeric + (c -> 'rooms' ->> 'chest')::numeric + (c -> 'rooms' ->> 'trap')::numeric then 'trap'
                when roll < (c -> 'rooms' ->> 'monster')::numeric + (c -> 'rooms' ->> 'chest')::numeric + (c -> 'rooms' ->> 'trap')::numeric + (c -> 'rooms' ->> 'shrine')::numeric then 'shrine'
                else 'empty' end;
    end if;
    v_rooms := jsonb_set(v_rooms, array[k, 't'], to_jsonb(t));
  end loop;
  -- the rooms next to the start can be seen
  foreach k in array private.rdun_nb(v_start) loop if v_rooms ? k then v_rooms := jsonb_set(v_rooms, array[k, 'seen'], 'true'); end if; end loop;
  return jsonb_build_object('rooms', v_rooms, 'pos', v_start);
end $$;
/** a group of monsters for this floor (or the boss) */
create or replace function private.rdun_enemies(p_floor int, p_boss boolean) returns jsonb language plpgsql volatile as $$
declare c jsonb := private.rdun_cfg(); v_hp numeric := 1 + (c ->> 'scale_hp')::numeric * (p_floor - 1); v_atk numeric := 1 + (c ->> 'scale_atk')::numeric * (p_floor - 1);
  v_pool jsonb; v_n int; m jsonb; out jsonb := '[]'::jsonb; i int; b jsonb; v_bi int;
begin
  if p_boss then
    v_bi := least(jsonb_array_length(c -> 'bosses') - 1, p_floor / 5 - 1); b := c -> 'bosses' -> v_bi;
    -- past the last boss they keep getting tougher
    v_hp := v_hp * 0.55; v_atk := v_atk * 0.75;
    out := jsonb_build_array(jsonb_build_object('n', b ->> 'name', 'e', b ->> 'emoji', 'hp', ceil((b ->> 'hp')::numeric * v_hp), 'max', ceil((b ->> 'hp')::numeric * v_hp), 'atk', ceil((b ->> 'atk')::numeric * v_atk), 'stun', 0, 'boss', true));
    -- with a couple of minions
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_pool from jsonb_array_elements(c -> 'monsters') x where (x ->> 'from')::int <= p_floor;
    for i in 1 .. 2 loop m := v_pool -> floor(random() * jsonb_array_length(v_pool))::int;
      out := out || jsonb_build_object('n', m ->> 'name', 'e', m ->> 'emoji', 'hp', ceil((m ->> 'hp')::numeric * v_hp * 0.8), 'max', ceil((m ->> 'hp')::numeric * v_hp * 0.8), 'atk', ceil((m ->> 'atk')::numeric * v_atk * 0.7), 'stun', 0); end loop;
    return out;
  end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_pool from jsonb_array_elements(c -> 'monsters') x where (x ->> 'from')::int <= p_floor and (x ->> 'from')::int >= p_floor - 9;
  v_n := 1 + floor(random() * least(3, 1 + p_floor / 3))::int;
  for i in 1 .. v_n loop
    m := v_pool -> floor(random() * jsonb_array_length(v_pool))::int;
    out := out || jsonb_build_object('n', m ->> 'name', 'e', m ->> 'emoji', 'hp', ceil((m ->> 'hp')::numeric * v_hp), 'max', ceil((m ->> 'hp')::numeric * v_hp), 'atk', ceil((m ->> 'atk')::numeric * v_atk), 'stun', 0);
  end loop;
  return out;
end $$;
/** a hero's stats at their level */
create or replace function private.rdun_hero(p_hero text, p_lv int) returns jsonb language sql stable as $$
  select jsonb_build_object('h', p_hero, 'hp', ceil((h ->> 'hp')::numeric * (1 + t.hp * (p_lv - 1))), 'max', ceil((h ->> 'hp')::numeric * (1 + t.hp * (p_lv - 1))),
    'atk', round((h ->> 'atk')::numeric * (1 + t.atk * (p_lv - 1)), 1), 'def', (h ->> 'def')::numeric * (1 + 0.08 * (p_lv - 1)), 'cd', 0, 'lv', p_lv)
  from (select private.rdun_cfg() -> 'heroes' -> p_hero h, (private.rdun_cfg() -> 'train' ->> 'hp_per_lv')::numeric hp, (private.rdun_cfg() -> 'train' ->> 'atk_per_lv')::numeric atk) t
$$;
/** what the app sees of a run: rooms you haven't seen keep their secrets */
create or replace function private.rdun_view(p_run jsonb) returns jsonb language sql stable as $$
  select case when p_run is null then null else p_run || jsonb_build_object('rooms',
    (select coalesce(jsonb_object_agg(key, case when (value ->> 'seen')::boolean then value else jsonb_build_object('t', '?', 'seen', false, 'done', false) end), '{}'::jsonb) from jsonb_each(p_run -> 'rooms'))) end
$$;
create or replace function private.rdun_json(p_realm uuid) returns jsonb language plpgsql as $$
declare d public.realm_dungeons%rowtype := private.rdun_row(p_realm);
begin
  return jsonb_build_object('heroes', d.heroes, 'party', d.party, 'best_floor', d.best_floor, 'bosses', d.bosses, 'runs', d.runs, 'run', private.rdun_view(d.run), 'cfg', private.rdun_cfg());
end $$;
create or replace function private.rdun_owned(p_id uuid) returns public.realms language plpgsql as $$
declare r public.realms%rowtype := private.rlm_owned(p_id, private.require_active_player());
begin
  if r.kind <> 'dungeon' then raise exception 'not_found' using errcode = 'P0001'; end if;
  return r;
end $$;
create or replace function private.rdun_out(p_realm uuid, p_uid uuid, p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select p_extra || jsonb_build_object('dungeon', private.rdun_json(p_realm), 'me', private.rlm_me(p_uid, 'dungeon'), 'level', private.rlm_level((select xp from public.realms where id = p_realm)))
$$;
/** loot from one fallen monster (more on deeper floors; materials by depth) */
create or replace function private.rdun_drop(p_floor int, p_boss boolean) returns jsonb language plpgsql volatile as $$
declare c jsonb := private.rdun_cfg(); v jsonb; m jsonb; v_mats jsonb := '[]'::jsonb;
begin
  v := jsonb_build_object('loot', ceil((c ->> 'loot_per_kill')::numeric * (1 + p_floor * 0.35) * (case when p_boss then 8 else 1 end) * (0.7 + random() * 0.6)));
  for m in select x from jsonb_array_elements(c -> 'mats') x where (x ->> 1)::int <= p_floor loop v_mats := v_mats || jsonb_build_array(m ->> 0); end loop;
  -- mostly the deepest material you've reached
  if random() < 0.75 or p_boss then
    v := private.jadd(v, jsonb_build_object(v_mats ->> (jsonb_array_length(v_mats) - 1 - case when random() < 0.35 and jsonb_array_length(v_mats) > 1 then 1 else 0 end),
      case when p_boss then 6 else 1 + floor(random() * 2)::int end));
  end if;
  return v;
end $$;
/** bank what the run found (all of it, or a share if the party fell) and close the run */
create or replace function private.rdun_bank(p_realm uuid, p_uid uuid, p_keep numeric) returns jsonb language plpgsql as $$
declare d public.realm_dungeons%rowtype := private.rdun_row(p_realm); c jsonb := private.rdun_cfg(); v_bag jsonb := '{}'::jsonb; v_ink int; v_floors int;
begin
  if d.run is null then return null; end if;
  select coalesce(jsonb_object_agg(key, floor(value::numeric * p_keep)), '{}'::jsonb) into v_bag from jsonb_each_text(d.run -> 'bag') where floor(value::numeric * p_keep) >= 1;
  perform private.rlm_player(p_uid, 'dungeon');
  update public.realm_players set wallet = private.jadd(wallet, v_bag), lifetime = private.jadd(lifetime, v_bag) where player_id = p_uid and kind = 'dungeon';
  v_floors := (d.run ->> 'floor')::int - (d.run ->> 'start_floor')::int;
  v_ink := private.rlm_pay(p_uid, 'dungeon', greatest(0, v_floors) * (c ->> 'ink_per_floor')::int + coalesce((d.run ->> 'boss_kills')::int, 0) * 3, p_realm::text, 'dungeon-run:' || (d.run ->> 'id'));
  update public.realm_dungeons set run = null, runs = runs + 1 where realm_id = p_realm;
  return jsonb_build_object('bag', v_bag, 'ink', v_ink, 'floor', d.run -> 'floor', 'kills', d.run -> 'kills', 'kept', p_keep);
end $$;

create or replace function public.dungeon_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype;
begin
  select * into r from public.realms where id = p_id;
  if not found or r.kind <> 'dungeon' then raise exception 'not_found' using errcode = 'P0001'; end if;
  return public.realm_get(p_id) || jsonb_build_object('dungeon_core', private.rdun_json(r.id));
end $$;

/** into the dungeon: from the top, or from the floor after any boss you've beaten */
create or replace function public.dungeon_start(p_id uuid, p_floor int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rdun_owned(p_id); d public.realm_dungeons%rowtype := private.rdun_row(p_id); v_floor int := coalesce(p_floor, 1); v_map jsonb; v_party jsonb := '[]'::jsonb; h text;
begin
  perform private.rate_limit('dungeon_run', 120, 3600);
  if d.run is not null then raise exception 'dungeon_in_run' using errcode = 'P0001'; end if;
  if v_floor < 1 or (v_floor - 1) % 5 <> 0 or (v_floor - 1) / 5 > d.bosses then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  for h in select jsonb_array_elements_text(d.party) loop v_party := v_party || private.rdun_hero(h, coalesce((d.heroes -> h ->> 'lv')::int, 1)); end loop;
  v_map := private.rdun_floor(v_floor);
  update public.realm_dungeons set run = jsonb_build_object('id', gen_random_uuid(), 'floor', v_floor, 'start_floor', v_floor, 'pos', v_map -> 'pos', 'rooms', v_map -> 'rooms',
    'party', v_party, 'bag', '{}'::jsonb, 'fight', null, 'kills', 0, 'boss_kills', 0) where realm_id = r.id;
  return private.rdun_out(r.id, r.owner_id);
end $$;

/** walk into a next-door room; whatever's in it happens */
create or replace function public.dungeon_move(p_id uuid, p_to text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rdun_owned(p_id); d public.realm_dungeons%rowtype := private.rdun_row(p_id); c jsonb := private.rdun_cfg(); v_run jsonb := d.run; room jsonb; k text;
  v_ev jsonb := '{}'::jsonb; v_got jsonb; i int; hp numeric; mx numeric;
begin
  perform private.rate_limit('dungeon_act', 4000, 3600);
  if v_run is null then raise exception 'dungeon_no_run' using errcode = 'P0001'; end if;
  if v_run -> 'fight' is not null and v_run -> 'fight' <> 'null'::jsonb then raise exception 'dungeon_in_fight' using errcode = 'P0001'; end if;
  if not (v_run -> 'rooms' ? p_to) or not (p_to = any(private.rdun_nb(v_run ->> 'pos'))) then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  v_run := jsonb_set(v_run, '{pos}', to_jsonb(p_to)); room := v_run -> 'rooms' -> p_to;
  v_run := jsonb_set(v_run, array['rooms', p_to, 'seen'], 'true');
  foreach k in array private.rdun_nb(p_to) loop if v_run -> 'rooms' ? k then v_run := jsonb_set(v_run, array['rooms', k, 'seen'], 'true'); end if; end loop;
  if not (room ->> 'done')::boolean then
    case room ->> 't'
      when 'monster', 'boss' then
        v_run := jsonb_set(v_run, '{fight}', jsonb_build_object('enemies', private.rdun_enemies((v_run ->> 'floor')::int, room ->> 't' = 'boss'), 'boss', room ->> 't' = 'boss', 'round', 0));
        v_ev := jsonb_build_object('fight', true);
      when 'chest' then
        v_got := jsonb_build_object('loot', ceil((c ->> 'loot_per_chest')::numeric * (1 + (v_run ->> 'floor')::int * 0.4) * (0.8 + random() * 0.5)));
        v_got := private.jadd(v_got, private.rdun_drop((v_run ->> 'floor')::int, false) - 'loot');
        if random() < 0.25 then v_got := private.jadd(v_got, jsonb_build_object(case when random() < 0.7 then 'potion' else 'bomb' end, 1)); end if;
        v_run := jsonb_set(v_run, '{bag}', private.jadd(v_run -> 'bag', v_got)); v_run := jsonb_set(v_run, array['rooms', p_to, 'done'], 'true');
        v_ev := jsonb_build_object('chest', v_got);
      when 'trap' then
        for i in 0 .. jsonb_array_length(v_run -> 'party') - 1 loop
          hp := (v_run -> 'party' -> i ->> 'hp')::numeric; mx := (v_run -> 'party' -> i ->> 'max')::numeric;
          if hp > 0 then v_run := jsonb_set(v_run, array['party', i::text, 'hp'], to_jsonb(greatest(1, hp - ceil(mx * (c ->> 'trap_dmg')::numeric)))); end if;
        end loop;
        v_run := jsonb_set(v_run, array['rooms', p_to, 'done'], 'true'); v_ev := jsonb_build_object('trap', true);
      when 'shrine' then
        for i in 0 .. jsonb_array_length(v_run -> 'party') - 1 loop
          hp := (v_run -> 'party' -> i ->> 'hp')::numeric; mx := (v_run -> 'party' -> i ->> 'max')::numeric;
          v_run := jsonb_set(v_run, array['party', i::text, 'hp'], to_jsonb(least(mx, greatest(hp, 0) + ceil(mx * (c ->> 'shrine_heal')::numeric))));
        end loop;
        v_run := jsonb_set(v_run, array['rooms', p_to, 'done'], 'true'); v_ev := jsonb_build_object('shrine', true);
      else v_run := jsonb_set(v_run, array['rooms', p_to, 'done'], 'true');
    end case;
  end if;
  update public.realm_dungeons set run = v_run where realm_id = r.id;
  return private.rdun_out(r.id, r.owner_id, jsonb_build_object('event', v_ev));
end $$;

/** down the stairs (after the boss, on a boss floor) */
create or replace function public.dungeon_descend(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rdun_owned(p_id); d public.realm_dungeons%rowtype := private.rdun_row(p_id); c jsonb := private.rdun_cfg(); v_run jsonb := d.run; room jsonb; v_map jsonb; v_floor int; v_lv int;
begin
  perform private.rate_limit('dungeon_act', 4000, 3600);
  if v_run is null then raise exception 'dungeon_no_run' using errcode = 'P0001'; end if;
  room := v_run -> 'rooms' -> (v_run ->> 'pos');
  if (room ->> 't') not in ('stairs', 'boss') or not (room ->> 'done')::boolean then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  v_floor := (v_run ->> 'floor')::int + 1; v_map := private.rdun_floor(v_floor);
  v_run := v_run || jsonb_build_object('floor', v_floor, 'pos', v_map -> 'pos', 'rooms', v_map -> 'rooms');
  update public.realm_dungeons set run = v_run, best_floor = greatest(best_floor, v_floor) where realm_id = r.id;
  v_lv := private.rlm_xp(r.id, ((c ->> 'xp_per_floor')::int * v_floor)::bigint);
  return private.rdun_out(r.id, r.owner_id, jsonb_build_object('level_up', v_lv, 'new_best', v_floor > d.best_floor));
end $$;

/** one round of a fight. p_act: attack | skill (p_hero's) | potion (on p_hero) | bomb. p_target: which monster. */
create or replace function public.dungeon_act(p_id uuid, p_act text, p_hero int default 0, p_target int default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rdun_owned(p_id); d public.realm_dungeons%rowtype := private.rdun_row(p_id); c jsonb := private.rdun_cfg(); v_run jsonb := d.run;
  f jsonb; en jsonb; pa jsonb; log jsonb := '[]'::jsonb; i int; j int; h jsonb; sk jsonb; v_dmg numeric; v_crit boolean; v_tgt int; v_alive int[]; v_heroes int[]; v_wallet jsonb;
  v_drop jsonb; v_lv int; v_over jsonb; v_floor int := (v_run ->> 'floor')::int; v_xp int := 0; v_knight int;
begin
  perform private.rate_limit('dungeon_act', 4000, 3600);
  if v_run is null then raise exception 'dungeon_no_run' using errcode = 'P0001'; end if;
  f := v_run -> 'fight'; if f is null or f = 'null'::jsonb then raise exception 'dungeon_no_fight' using errcode = 'P0001'; end if;
  en := f -> 'enemies'; pa := v_run -> 'party';
  if p_act not in ('attack', 'skill', 'potion', 'bomb') or p_hero < 0 or p_hero >= jsonb_array_length(pa) then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  -- the target: the one picked if it's still standing, else the first that is
  v_tgt := case when p_target between 0 and jsonb_array_length(en) - 1 and (en -> p_target ->> 'hp')::numeric > 0 then p_target
                else (select min(o - 1) from jsonb_array_elements(en) with ordinality x(v, o) where (v ->> 'hp')::numeric > 0)::int end;
  -- the chosen action
  if p_act = 'skill' then
    h := pa -> p_hero; sk := c -> 'heroes' -> (h ->> 'h') -> 'skill';
    if (h ->> 'hp')::numeric <= 0 then raise exception 'invalid_input' using errcode = 'P0001'; end if;
    if (h ->> 'cd')::int > 0 then raise exception 'dungeon_cooldown' using errcode = 'P0001'; end if;
    case sk ->> 'kind'
      when 'all' then
        for j in 0 .. jsonb_array_length(en) - 1 loop if (en -> j ->> 'hp')::numeric > 0 then
          v_dmg := ceil((h ->> 'atk')::numeric * (sk ->> 'mult')::numeric * (0.85 + random() * 0.3));
          en := jsonb_set(en, array[j::text, 'hp'], to_jsonb(greatest(0, (en -> j ->> 'hp')::numeric - v_dmg)));
          log := log || jsonb_build_object('a', 'h', 'i', p_hero, 'j', j, 'dmg', v_dmg, 'k', 'skill'); end if; end loop;
      when 'heal' then
        for j in 0 .. jsonb_array_length(pa) - 1 loop
          v_dmg := ceil((pa -> j ->> 'max')::numeric * (sk ->> 'mult')::numeric);
          pa := jsonb_set(pa, array[j::text, 'hp'], to_jsonb(least((pa -> j ->> 'max')::numeric, greatest(0, (pa -> j ->> 'hp')::numeric) + v_dmg)));
          log := log || jsonb_build_object('a', 'h', 'i', p_hero, 'h', j, 'heal', v_dmg, 'k', 'heal'); end loop;
      else
        v_dmg := ceil((h ->> 'atk')::numeric * (sk ->> 'mult')::numeric * (0.85 + random() * 0.3));
        if sk ->> 'kind' = 'execute' and (en -> v_tgt ->> 'hp')::numeric * 2 > (en -> v_tgt ->> 'max')::numeric then v_dmg := ceil(v_dmg / 2); end if;
        en := jsonb_set(en, array[v_tgt::text, 'hp'], to_jsonb(greatest(0, (en -> v_tgt ->> 'hp')::numeric - v_dmg)));
        if sk ->> 'kind' = 'stun' then en := jsonb_set(en, array[v_tgt::text, 'stun'], '1'); end if;
        log := log || jsonb_build_object('a', 'h', 'i', p_hero, 'j', v_tgt, 'dmg', v_dmg, 'k', 'skill', 'stun', sk ->> 'kind' = 'stun');
    end case;
    pa := jsonb_set(pa, array[p_hero::text, 'cd'], to_jsonb((sk ->> 'cd')::int + 1));
  elsif p_act in ('potion', 'bomb') then
    perform private.rlm_player(r.owner_id, 'dungeon');
    select wallet into v_wallet from public.realm_players where player_id = r.owner_id and kind = 'dungeon' for update;
    if coalesce((v_wallet ->> p_act)::numeric, 0) >= 1 then
      update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object(p_act, 1), -1) where player_id = r.owner_id and kind = 'dungeon';
    elsif coalesce((v_run -> 'bag' ->> p_act)::numeric, 0) >= 1 then
      v_run := jsonb_set(v_run, '{bag}', private.jadd(v_run -> 'bag', jsonb_build_object(p_act, 1), -1));
    else raise exception 'not_enough' using errcode = 'P0001'; end if;
    if p_act = 'potion' then
      v_dmg := ceil((pa -> p_hero ->> 'max')::numeric * (c ->> 'potion_heal')::numeric);
      pa := jsonb_set(pa, array[p_hero::text, 'hp'], to_jsonb(least((pa -> p_hero ->> 'max')::numeric, greatest(0, (pa -> p_hero ->> 'hp')::numeric) + v_dmg)));
      log := log || jsonb_build_object('a', 'item', 'h', p_hero, 'heal', v_dmg, 'k', 'potion');
    else
      for j in 0 .. jsonb_array_length(en) - 1 loop if (en -> j ->> 'hp')::numeric > 0 then
        v_dmg := ceil((10 + v_floor * 3) * (c ->> 'bomb_mult')::numeric * (0.85 + random() * 0.3));
        en := jsonb_set(en, array[j::text, 'hp'], to_jsonb(greatest(0, (en -> j ->> 'hp')::numeric - v_dmg)));
        log := log || jsonb_build_object('a', 'item', 'j', j, 'dmg', v_dmg, 'k', 'bomb'); end if; end loop;
    end if;
  end if;
  -- everyone else (still standing) attacks
  for i in 0 .. jsonb_array_length(pa) - 1 loop
    if (pa -> i ->> 'hp')::numeric <= 0 or (p_act = 'skill' and i = p_hero) then continue; end if;
    v_tgt := case when (en -> v_tgt ->> 'hp')::numeric > 0 then v_tgt else (select min(o - 1) from jsonb_array_elements(en) with ordinality x(v, o) where (v ->> 'hp')::numeric > 0)::int end;
    exit when v_tgt is null;
    v_crit := random() < 0.12;
    v_dmg := ceil((pa -> i ->> 'atk')::numeric * (0.85 + random() * 0.3) * case when v_crit then 1.8 else 1 end);
    en := jsonb_set(en, array[v_tgt::text, 'hp'], to_jsonb(greatest(0, (en -> v_tgt ->> 'hp')::numeric - v_dmg)));
    log := log || jsonb_build_object('a', 'h', 'i', i, 'j', v_tgt, 'dmg', v_dmg, 'crit', v_crit, 'k', 'hit');
  end loop;
  -- the monsters' turn
  select array_agg(o - 1) into v_heroes from jsonb_array_elements(pa) with ordinality x(v, o) where (v ->> 'hp')::numeric > 0;
  select min(o - 1) into v_knight from jsonb_array_elements(pa) with ordinality x(v, o) where v ->> 'h' = 'knight' and (v ->> 'hp')::numeric > 0;
  for j in 0 .. jsonb_array_length(en) - 1 loop
    if (en -> j ->> 'hp')::numeric <= 0 or v_heroes is null then continue; end if;
    if (en -> j ->> 'stun')::int > 0 then en := jsonb_set(en, array[j::text, 'stun'], '0'); log := log || jsonb_build_object('a', 'e', 'j', j, 'k', 'stunned'); continue; end if;
    i := case when v_knight is not null and random() < 0.5 then v_knight else v_heroes[1 + floor(random() * array_length(v_heroes, 1))::int] end;
    if random() < 0.08 then log := log || jsonb_build_object('a', 'e', 'j', j, 'h', i, 'k', 'miss'); continue; end if;
    v_dmg := greatest(1, ceil((en -> j ->> 'atk')::numeric * (0.85 + random() * 0.3) - (pa -> i ->> 'def')::numeric));
    pa := jsonb_set(pa, array[i::text, 'hp'], to_jsonb(greatest(0, (pa -> i ->> 'hp')::numeric - v_dmg)));
    log := log || jsonb_build_object('a', 'e', 'j', j, 'h', i, 'dmg', v_dmg, 'k', 'hit');
    if (pa -> i ->> 'hp')::numeric <= 0 then
      v_heroes := array_remove(v_heroes, i); if i = v_knight then v_knight := null; end if;
      log := log || jsonb_build_object('a', 'e', 'h', i, 'k', 'fell');
      if v_heroes = '{}' then v_heroes := null; end if;
    end if;
  end loop;
  -- cooldowns tick down
  for i in 0 .. jsonb_array_length(pa) - 1 loop if (pa -> i ->> 'cd')::int > 0 then pa := jsonb_set(pa, array[i::text, 'cd'], to_jsonb((pa -> i ->> 'cd')::int - 1)); end if; end loop;
  v_run := jsonb_set(v_run, '{party}', pa);
  if not exists (select 1 from jsonb_array_elements(en) x where (x ->> 'hp')::numeric > 0) then
    -- victory: loot from each monster, the room's done
    v_drop := '{}'::jsonb;
    for j in 0 .. jsonb_array_length(en) - 1 loop v_drop := private.jadd(v_drop, private.rdun_drop(v_floor, coalesce((en -> j ->> 'boss')::boolean, false))); end loop;
    v_run := jsonb_set(v_run, '{bag}', private.jadd(v_run -> 'bag', v_drop));
    v_run := jsonb_set(v_run, '{fight}', 'null'::jsonb) || jsonb_build_object('kills', (v_run ->> 'kills')::int + jsonb_array_length(en), 'boss_kills', (v_run ->> 'boss_kills')::int + case when (f ->> 'boss')::boolean then 1 else 0 end);
    v_run := jsonb_set(v_run, array['rooms', v_run ->> 'pos', 'done'], 'true');
    v_xp := (c ->> 'xp_per_kill')::int * jsonb_array_length(en) * v_floor;
    if (f ->> 'boss')::boolean then
      update public.realm_dungeons set bosses = greatest(bosses, v_floor / 5) where realm_id = r.id;
    end if;
    update public.realm_dungeons set run = v_run where realm_id = r.id;
    v_lv := private.rlm_xp(r.id, v_xp::bigint);
    return private.rdun_out(r.id, r.owner_id, jsonb_build_object('log', log, 'won', true, 'drop', v_drop, 'enemies', en, 'level_up', v_lv));
  end if;
  if v_heroes is null then
    -- the party fell: back to camp with half of what was found
    update public.realm_dungeons set run = v_run where realm_id = r.id;
    v_over := private.rdun_bank(r.id, r.owner_id, (c ->> 'death_keep')::numeric);
    return private.rdun_out(r.id, r.owner_id, jsonb_build_object('log', log, 'lost', true, 'enemies', en, 'summary', v_over));
  end if;
  v_run := jsonb_set(v_run, '{fight}', f || jsonb_build_object('enemies', en, 'round', coalesce((f ->> 'round')::int, 0) + 1));
  update public.realm_dungeons set run = v_run where realm_id = r.id;
  return private.rdun_out(r.id, r.owner_id, jsonb_build_object('log', log));
end $$;

/** back to camp with everything you found (not in the middle of a fight) */
create or replace function public.dungeon_leave(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rdun_owned(p_id); d public.realm_dungeons%rowtype := private.rdun_row(p_id);
begin
  perform private.rate_limit('dungeon_act', 4000, 3600);
  if d.run is null then raise exception 'dungeon_no_run' using errcode = 'P0001'; end if;
  if d.run -> 'fight' is not null and d.run -> 'fight' <> 'null'::jsonb then raise exception 'dungeon_in_fight' using errcode = 'P0001'; end if;
  return private.rdun_out(r.id, r.owner_id, jsonb_build_object('summary', private.rdun_bank(r.id, r.owner_id, 1)));
end $$;

/** heroes: hire one, train one (loot and materials), choose the party */
create or replace function public.dungeon_hero(p_id uuid, p_act text, p_hero text default null, p_party jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rdun_owned(p_id); d public.realm_dungeons%rowtype := private.rdun_row(p_id); c jsonb := private.rdun_cfg(); h jsonb := c -> 'heroes' -> p_hero;
  v_lv int; v_cost jsonb; v_mat text; v_wallet jsonb; x text;
begin
  perform private.rate_limit('dungeon_hero', 600, 3600);
  if d.run is not null then raise exception 'dungeon_in_run' using errcode = 'P0001'; end if;
  perform private.rlm_player(r.owner_id, 'dungeon');
  select wallet into v_wallet from public.realm_players where player_id = r.owner_id and kind = 'dungeon' for update;
  if p_act = 'hire' then
    if h is null then raise exception 'not_found' using errcode = 'P0001'; end if;
    if d.heroes ? p_hero then raise exception 'maxed' using errcode = 'P0001'; end if;
    if private.rlm_lv(r.xp) < (h ->> 'level')::int then raise exception 'level_too_low' using errcode = 'P0001'; end if;
    v_cost := jsonb_build_object('loot', (h ->> 'cost')::int);
    if not private.jcovers(v_wallet, v_cost) then raise exception 'not_enough' using errcode = 'P0001'; end if;
    update public.realm_players set wallet = private.jadd(wallet, v_cost, -1) where player_id = r.owner_id and kind = 'dungeon';
    update public.realm_dungeons set heroes = heroes || jsonb_build_object(p_hero, jsonb_build_object('lv', 1)),
      party = case when jsonb_array_length(party) < (c ->> 'party_size')::int then party || to_jsonb(p_hero) else party end where realm_id = r.id;
  elsif p_act = 'train' then
    if not d.heroes ? p_hero then raise exception 'not_found' using errcode = 'P0001'; end if;
    v_lv := (d.heroes -> p_hero ->> 'lv')::int;
    if v_lv >= (c -> 'train' ->> 'max_lv')::int then raise exception 'maxed' using errcode = 'P0001'; end if;
    -- training costs loot, and materials from deeper as heroes grow
    v_mat := c -> 'mats' -> least(jsonb_array_length(c -> 'mats') - 1, (v_lv - 1) / 5) ->> 0;
    v_cost := jsonb_build_object('loot', (c -> 'train' ->> 'loot')::int * v_lv * v_lv, v_mat, (c -> 'train' ->> 'mat_per_lv')::int * v_lv);
    if not private.jcovers(v_wallet, v_cost) then raise exception 'not_enough' using errcode = 'P0001'; end if;
    update public.realm_players set wallet = private.jadd(wallet, v_cost, -1) where player_id = r.owner_id and kind = 'dungeon';
    update public.realm_dungeons set heroes = jsonb_set(heroes, array[p_hero, 'lv'], to_jsonb(v_lv + 1)) where realm_id = r.id;
  elsif p_act = 'party' then
    if p_party is null or jsonb_typeof(p_party) <> 'array' or jsonb_array_length(p_party) < 1 or jsonb_array_length(p_party) > (c ->> 'party_size')::int then raise exception 'invalid_input' using errcode = 'P0001'; end if;
    for x in select jsonb_array_elements_text(p_party) loop if not d.heroes ? x then raise exception 'invalid_input' using errcode = 'P0001'; end if; end loop;
    if (select count(distinct v) from jsonb_array_elements_text(p_party) v) <> jsonb_array_length(p_party) then raise exception 'invalid_input' using errcode = 'P0001'; end if;
    update public.realm_dungeons set party = p_party where realm_id = r.id;
  else raise exception 'not_found' using errcode = 'P0001';
  end if;
  return private.rdun_out(r.id, r.owner_id, jsonb_build_object('level_up', case when p_act <> 'party' then private.rlm_xp(r.id, 10) end));
end $$;

-- a second minigame for the dungeon: Lockpick
update public.game_config set value = jsonb_set(value, '{kinds,dungeon,games,lockpick}',
  (value -> 'kinds' -> 'dungeon' -> 'games' -> 'delve') || jsonb_build_object('name', 'Lockpick', 'emoji', '🔐', 'blurb', 'The pick swings round the lock — tap when it''s in the gold to set each pin. Faster locks, bigger chests.', 'level', 3))
 where key = 'realms' and value -> 'kinds' -> 'dungeon' -> 'games' ? 'delve' and not (value -> 'kinds' -> 'dungeon' -> 'games' ? 'lockpick');

do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'private' and p.proname like 'rdun\_%') or (n.nspname = 'public' and p.proname like 'dungeon\_%') loop
    execute format('revoke all on function %s from public', f.sig);
    if f.nspname = 'public' then
      execute format('revoke all on function %s from anon', f.sig);
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;
