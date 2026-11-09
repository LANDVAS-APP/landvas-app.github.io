-- v0.9.4 The Arcade Estate is your arcade, bigger: the same arcade (tickets, cabinets, level, decor) with a door out
-- to a 3D carnival. The carnival has booth games played in 3D (paying tickets like the cabinets), rides, a treat
-- stand, a fortune teller and fireworks. The Estates' extra "stand" games are retired.

-- ---- the Arcade's Estate (and later its Domain) keeps the arcade itself -------------------------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.ensure_kind_row(uuid,uuid,text)'::regprocedure);
  n := replace(d, 'if p_kind = ''arcade'' then insert into public.arcades', 'if p_kind in (''arcade'', ''boardwalk'', ''galaxypark'') then insert into public.arcades');
  if n = d then raise exception 'carnival: ensure_kind_row arcade line not found'; end if;
  execute n;
end $$;
insert into public.arcades (owner_id, group_id)
  select g.owner_id, g.id from public.canvas_groups g where g.kind in ('boardwalk', 'galaxypark') and g.owner_id is not null
  on conflict (group_id) do nothing;

alter table public.arcade_players add column if not exists treat_until timestamptz;
alter table public.arcade_players add column if not exists treat text;
alter table public.arcade_players add column if not exists fortune_day timestamptz;
alter table public.arcade_players add column if not exists fortune jsonb;
alter table public.arcade_players add column if not exists rides jsonb not null default '{}'::jsonb;

update public.game_config set value = value || jsonb_build_object('carnival', $cfg${
  "games": {
    "ducks":    {"name": "Duck Shoot",       "emoji": "🦆", "order": 1, "blurb": "Ducks bob along the water. Tap to shoot them down — golden ducks pay big, never hit the swan.", "seconds": 40, "min_seconds": 12, "max_score": 600, "per_second": 30, "tickets_per_point": 0.3, "points_per_ink": 120},
    "darts":    {"name": "Balloon Darts",    "emoji": "🎈", "order": 2, "blurb": "A wall of balloons. Tap one to throw a dart — darts take a moment to fly and the balloons drift.", "seconds": 40, "min_seconds": 12, "max_score": 600, "per_second": 30, "tickets_per_point": 0.3, "points_per_ink": 120},
    "bottles":  {"name": "Milk Bottle Toss", "emoji": "🍼", "order": 3, "blurb": "Three balls a round. Knock the whole pyramid of bottles off the shelf.", "seconds": 45, "min_seconds": 12, "max_score": 600, "per_second": 30, "tickets_per_point": 0.3, "points_per_ink": 120},
    "crabs":    {"name": "Whack-a-Crab",     "emoji": "🦀", "order": 4, "blurb": "Crabs pop out of the sand table. Bop them — lobsters are worth triple, starfish cost you.", "seconds": 35, "min_seconds": 12, "max_score": 600, "per_second": 30, "tickets_per_point": 0.3, "points_per_ink": 120},
    "striker":  {"name": "High Striker",     "emoji": "🔔", "order": 5, "blurb": "Swing the mallet at the very top of the power gauge to ring the bell.", "seconds": 40, "min_seconds": 12, "max_score": 600, "per_second": 30, "tickets_per_point": 0.3, "points_per_ink": 120},
    "watergun": {"name": "Water Gun Race",   "emoji": "🔫", "order": 6, "blurb": "Hold your stream on the moving target to blow up your balloon before the rivals pop theirs.", "seconds": 45, "min_seconds": 12, "max_score": 600, "per_second": 30, "tickets_per_point": 0.3, "points_per_ink": 120}
  },
  "treats": {
    "candy":   {"name": "Cotton candy",   "emoji": "🍭", "cost": 40,  "minutes": 10, "bonus": 0.25},
    "popcorn": {"name": "Popcorn",        "emoji": "🍿", "cost": 90,  "minutes": 20, "bonus": 0.4},
    "apple":   {"name": "Candy apple",    "emoji": "🍎", "cost": 200, "minutes": 30, "bonus": 0.6}
  },
  "rides": {
    "wheel":    {"name": "Ferris wheel",  "emoji": "🎡", "seconds": 18, "daily_tickets": 25},
    "carousel": {"name": "Carousel",      "emoji": "🎠", "seconds": 14, "daily_tickets": 15}
  },
  "fortune": {"tickets": [20, 120], "lucky_chance": 0.4, "lucky_mult": 2},
  "fireworks": {"cost": 150, "xp": 60}
}$cfg$::jsonb) where key = 'arcade';

/** is this arcade on land big enough to have its carnival? (its land is the Arcade's Estate or Domain) */
create or replace function private.arc_carnival(p_arcade uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.arcades a join public.canvas_groups g on g.id = a.group_id where a.id = p_arcade and g.kind in ('boardwalk', 'galaxypark'))
$$;

/** extra tickets at the carnival: a treat you're still enjoying, and today's lucky booth from the fortune teller */
create or replace function private.carnival_mult(p_uid uuid, p_game text) returns numeric language plpgsql stable as $$
declare p public.arcade_players%rowtype; c jsonb := private.arc_cfg() -> 'carnival'; m numeric := 1;
begin
  if c -> 'games' -> p_game is null then return 1; end if;
  select * into p from public.arcade_players where player_id = p_uid;
  if not found then return 1; end if;
  if p.treat_until > now() then m := m + coalesce((c -> 'treats' -> p.treat ->> 'bonus')::numeric, 0); end if;
  if p.fortune_day >= private.day_start(now()) and p.fortune ->> 'lucky' = p_game then m := m * coalesce((c -> 'fortune' ->> 'lucky_mult')::numeric, 2); end if;
  return m;
end $$;

/** your carnival state: treat, today's fortune, rides done today */
create or replace function private.carnival_me(p_uid uuid) returns jsonb language plpgsql as $$
declare p public.arcade_players%rowtype := private.arc_player(p_uid); today timestamptz := private.day_start(now());
begin
  return jsonb_build_object(
    'treat', case when p.treat_until > now() then jsonb_build_object('id', p.treat, 'until', p.treat_until) else null end,
    'fortune', case when p.fortune_day >= today then p.fortune else null end,
    'fortune_ready', p.fortune_day is null or p.fortune_day < today,
    'rides_today', coalesce((select jsonb_agg(k) from jsonb_each_text(p.rides) e(k, v) where v::timestamptz >= today), '[]'::jsonb));
end $$;

-- the carnival in the arcade view
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.arc_view(uuid,uuid)'::regprocedure);
  n := replace(d, '''me'', private.arc_me(p_viewer), ''server_time'', now()',
    '''me'', private.arc_me(p_viewer), ''server_time'', now(), ''carnival'', case when private.arc_carnival(a.id) then (private.arc_cfg() -> ''carnival'') || jsonb_build_object(''me'', private.carnival_me(p_viewer), ''boards'', (select jsonb_object_agg(k, private.arc_board(a.id, k, 5, ''classic'')) from jsonb_object_keys(private.arc_cfg() -> ''carnival'' -> ''games'') k)) else null end');
  if n = d then raise exception 'carnival: arc_view anchor not found'; end if;
  execute n;
end $$;

-- the booth games finish like the cabinets: same tickets, Ink, XP and owner's cut — plus the carnival's own boosts
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.arcade_finish(uuid,integer)'::regprocedure);
  n := replace(d, 'g := cfg -> ''games'' -> s.game;', 'g := coalesce(cfg -> ''games'' -> s.game, cfg -> ''carnival'' -> ''games'' -> s.game);');
  n := replace(n, '* case when v_hot then coalesce((cfg -> ''hot'' ->> ''tickets'')::numeric, 2) else 1 end)::int;',
                  '* case when v_hot then coalesce((cfg -> ''hot'' ->> ''tickets'')::numeric, 2) else 1 end * private.carnival_mult(v_uid, s.game))::int;');
  if n = d or position('carnival_mult' in n) = 0 then raise exception 'carnival: arcade_finish anchors not found'; end if;
  execute n;
end $$;

create or replace function public.carnival_start(p_arcade uuid, p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.arcades%rowtype; g jsonb := private.arc_cfg() -> 'carnival' -> 'games' -> p_game; s public.arcade_plays%rowtype;
begin
  perform private.rate_limit('arcade_play', 300, 3600);
  if g is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  select * into a from public.arcades where id = p_arcade;
  if not found or not private.visible_to(a.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not private.arc_carnival(a.id) then raise exception 'no_carnival' using errcode = 'P0001'; end if;
  insert into public.arcade_plays (player_id, arcade_id, game, seed) values (v_uid, a.id, p_game, floor(random() * 2147483646)::int) returning * into s;
  return jsonb_build_object('session', s.id, 'seed', s.seed, 'game', p_game, 'seconds', coalesce((g ->> 'seconds')::int, 40), 'mult', private.carnival_mult(v_uid, p_game),
    'best', (select max(score) from public.arcade_plays where player_id = v_uid and game = p_game and finished_at is not null),
    'record', (select max(score) from public.arcade_plays where arcade_id = a.id and game = p_game and finished_at is not null));
end $$;

/** buy a treat at the stand: tickets for a while of extra tickets at the booths */
create or replace function public.carnival_treat(p_arcade uuid, p_treat text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); tr jsonb := private.arc_cfg() -> 'carnival' -> 'treats' -> p_treat; p public.arcade_players%rowtype;
begin
  perform private.rate_limit('carnival_act', 120, 3600);
  if tr is null then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  if not private.arc_carnival(p_arcade) then raise exception 'no_carnival' using errcode = 'P0001'; end if;
  p := private.arc_player(v_uid);
  if p.tickets < (tr ->> 'cost')::int then raise exception 'not_enough_tickets' using errcode = 'P0001'; end if;
  update public.arcade_players set tickets = tickets - (tr ->> 'cost')::int, treat = p_treat,
         treat_until = now() + make_interval(mins => (tr ->> 'minutes')::int) where player_id = v_uid;
  return jsonb_build_object('treat', p_treat, 'me', private.arc_me(v_uid), 'carnival', private.carnival_me(v_uid));
end $$;

/** the fortune teller: once a day, a card — some tickets, and sometimes a lucky booth that pays double today */
create or replace function public.carnival_fortune(p_arcade uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.arc_cfg() -> 'carnival'; p public.arcade_players%rowtype; v_tix int; v_lucky text; v_card jsonb;
begin
  perform private.rate_limit('carnival_act', 120, 3600);
  if not private.arc_carnival(p_arcade) then raise exception 'no_carnival' using errcode = 'P0001'; end if;
  p := private.arc_player(v_uid);
  if p.fortune_day >= private.day_start(now()) then raise exception 'fortune_told' using errcode = 'P0001'; end if;
  v_tix := (c -> 'fortune' -> 'tickets' ->> 0)::int + floor(random() * ((c -> 'fortune' -> 'tickets' ->> 1)::int - (c -> 'fortune' -> 'tickets' ->> 0)::int + 1))::int;
  if random() < coalesce((c -> 'fortune' ->> 'lucky_chance')::numeric, 0.4) then select k into v_lucky from jsonb_object_keys(c -> 'games') k order by random() limit 1; end if;
  v_card := jsonb_build_object('card', (array['The Star', 'The Sun', 'The Moon', 'The Wheel', 'The Jester', 'The Crown', 'The Comet'])[1 + floor(random() * 7)::int], 'tickets', v_tix, 'lucky', v_lucky);
  update public.arcade_players set fortune_day = now(), fortune = v_card, tickets = tickets + v_tix, lifetime = lifetime + v_tix where player_id = v_uid;
  return jsonb_build_object('fortune', v_card, 'me', private.arc_me(v_uid), 'carnival', private.carnival_me(v_uid));
end $$;

/** a ride (Ferris wheel, carousel): free; the first go on each ride every day comes with a few tickets */
create or replace function public.carnival_ride(p_arcade uuid, p_ride text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); rd jsonb := private.arc_cfg() -> 'carnival' -> 'rides' -> p_ride; p public.arcade_players%rowtype; v_tix int := 0;
begin
  perform private.rate_limit('carnival_act', 120, 3600);
  if rd is null then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  if not private.arc_carnival(p_arcade) then raise exception 'no_carnival' using errcode = 'P0001'; end if;
  p := private.arc_player(v_uid);
  if coalesce((p.rides ->> p_ride)::timestamptz, '-infinity') < private.day_start(now()) then v_tix := coalesce((rd ->> 'daily_tickets')::int, 0); end if;
  update public.arcade_players set rides = rides || jsonb_build_object(p_ride, now()), tickets = tickets + v_tix, lifetime = lifetime + v_tix where player_id = v_uid;
  return jsonb_build_object('ride', p_ride, 'tickets', v_tix, 'seconds', coalesce((rd ->> 'seconds')::int, 15), 'me', private.arc_me(v_uid), 'carnival', private.carnival_me(v_uid));
end $$;

/** set off a fireworks show over the carnival: costs tickets, gives the arcade some XP */
create or replace function public.carnival_fireworks(p_arcade uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.arc_cfg() -> 'carnival' -> 'fireworks'; p public.arcade_players%rowtype;
begin
  perform private.rate_limit('carnival_act', 120, 3600);
  if not private.arc_carnival(p_arcade) then raise exception 'no_carnival' using errcode = 'P0001'; end if;
  p := private.arc_player(v_uid);
  if p.tickets < (c ->> 'cost')::int then raise exception 'not_enough_tickets' using errcode = 'P0001'; end if;
  update public.arcade_players set tickets = tickets - (c ->> 'cost')::int where player_id = v_uid;
  update public.arcades set xp = xp + coalesce((c ->> 'xp')::int, 60) where id = p_arcade;
  return jsonb_build_object('ok', true, 'me', private.arc_me(v_uid));
end $$;

revoke all on function public.carnival_start(uuid, text), public.carnival_treat(uuid, text), public.carnival_fortune(uuid), public.carnival_ride(uuid, text), public.carnival_fireworks(uuid) from public, anon;
grant execute on function public.carnival_start(uuid, text), public.carnival_treat(uuid, text), public.carnival_fortune(uuid), public.carnival_ride(uuid, text), public.carnival_fireworks(uuid) to authenticated;

-- ---- the Estates' "stand" games are retired (each place keeps its signature game until it gets its expansion) -----
do $$
declare v jsonb; k text;
begin
  select value into v from public.game_config where key = 'realms';
  for k in select key from jsonb_each(v -> 'kinds') where value ->> 'tier' = 'estate' loop
    v := jsonb_set(v, array['kinds', k, 'games'], (select jsonb_object_agg(gk, gv) from jsonb_each(v -> 'kinds' -> k -> 'games') e(gk, gv) where coalesce((gv ->> 'order')::int, 0) = 0));
  end loop;
  update public.game_config set value = v, updated_at = now() where key = 'realms';
end $$;

-- ---- an Arcade Estate (or Domain) is its arcade: the map and the plot panel open the arcade, carnival and all ----
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.arcade_for_plot(int,int)'::regprocedure);
  n := replace(d, 'g.kind = ''arcade''', 'g.kind in (''arcade'', ''boardwalk'', ''galaxypark'')');
  if n = d then raise exception 'carnival: arcade_for_plot anchor not found'; end if;
  execute n;
end $$;

/** the arcade on a group's land (an Arcade Estate's realm page sends you here) */
create or replace function public.arcade_for_group(p_group uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id from public.arcades a join public.canvas_groups g on g.id = a.group_id
  where a.group_id = p_group and g.kind in ('arcade', 'boardwalk', 'galaxypark')
$$;
revoke all on function public.arcade_for_group(uuid) from public;
grant execute on function public.arcade_for_group(uuid) to anon, authenticated, service_role;

-- the Arcade's Estate is now its carnival
update public.plot_kinds set name = 'Arcade Carnival', description = 'Estate of the Arcade: walk out of your arcade into a carnival.' where id = 'boardwalk';
update public.game_config set value = jsonb_set(jsonb_set(value, '{kinds,boardwalk,name}', '"Arcade Carnival"'), '{kinds,boardwalk,emoji}', '"🎡"')
  where key = 'realms' and value -> 'kinds' -> 'boardwalk' is not null;
