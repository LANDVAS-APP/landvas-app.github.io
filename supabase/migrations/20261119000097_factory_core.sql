-- v0.6.5 The Inventor's Workshop becomes its own game: a factory you lay out on the workshop floor.
-- Pieces (bought with sparks, then placed and moved freely): conveyor belts, Scrap Magnets (make scrap), Gear Presses,
-- Spring Coilers, Wire Spools, Circuit Printers, Mini Reactors (each turns what's fed into it into a better part) and
-- Shipping Crates (whatever reaches one goes to your stock). Everything points one way: belts carry items on, machines
-- push what they make out the front. The server works out what the layout really makes per minute (a machine
-- without the right inputs makes nothing; a belt carries at most so much) and pays it out over time, even while
-- you're away (up to a few hours).

insert into public.game_config (key, value, description) values ('realm_factory', $cfg${
  "size_by_level": [[1, 6], [8, 8], [16, 10]],
  "cap_hours": 6,
  "belt_cap": 30,
  "ink_per_value": 250,
  "xp_per_value": 0.3,
  "pieces": {
    "belt":    { "name": "Conveyor belt",   "emoji": "➡️", "kind": "belt",    "cost": 5,    "level": 1 },
    "magnet":  { "name": "Scrap Magnet",    "emoji": "🧲", "kind": "source",  "out": "scrap", "rate": 6, "cost": 30, "level": 1 },
    "dock":    { "name": "Shipping Crate",  "emoji": "📦", "kind": "dock",    "cost": 20,   "level": 1 },
    "press":   { "name": "Gear Press",      "emoji": "⚙️", "kind": "machine", "in": { "scrap": 2 }, "out": "gear", "rate": 3, "cost": 80, "level": 2 },
    "coiler":  { "name": "Spring Coiler",   "emoji": "🌀", "kind": "machine", "in": { "gear": 2 }, "out": "spring", "rate": 1.5, "cost": 250, "level": 6 },
    "spool":   { "name": "Wire Spool",      "emoji": "🧵", "kind": "machine", "in": { "spring": 1, "scrap": 2 }, "out": "wire", "rate": 1, "cost": 700, "level": 10 },
    "printer": { "name": "Circuit Printer", "emoji": "🖨️", "kind": "machine", "in": { "wire": 2, "gear": 1 }, "out": "chip", "rate": 0.6, "cost": 2000, "level": 15 },
    "reactor": { "name": "Mini Reactor",    "emoji": "⚛️", "kind": "machine", "in": { "chip": 2, "spring": 2 }, "out": "core", "rate": 0.3, "cost": 6000, "level": 22 }
  },
  "starter": { "owned": { "belt": 6, "magnet": 1, "dock": 1, "press": 1 }, "grid": { "1,2": { "t": "magnet", "d": 1 }, "2,2": { "t": "belt", "d": 1 }, "3,2": { "t": "belt", "d": 1 }, "4,2": { "t": "dock", "d": 1 } } }
}$cfg$::jsonb, 'Inventor''s Workshop: factory pieces, belts, rates')
on conflict (key) do nothing;

create table if not exists public.realm_factories (
  realm_id uuid primary key references public.realms (id) on delete cascade,
  grid jsonb not null default '{}'::jsonb,       -- "x,y" -> {t, d}  (d: 0 up, 1 right, 2 down, 3 left)
  owned jsonb not null default '{}'::jsonb,      -- piece -> how many
  rates jsonb not null default '{}'::jsonb,      -- item -> per minute reaching the crates
  collected_at timestamptz not null default now(),
  shipped jsonb not null default '{}'::jsonb
);
alter table public.realm_factories enable row level security;
revoke all on public.realm_factories from anon, authenticated;

create or replace function private.rfac_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('realm_factory'), '{}'::jsonb) $$;
create or replace function private.rfac_size(p_level int) returns int language sql stable as $$
  select coalesce(max((e ->> 1)::int), 6) from jsonb_array_elements(private.rfac_cfg() -> 'size_by_level') e where p_level >= (e ->> 0)::int
$$;
/** the cell a piece at k facing d pushes into */
create or replace function private.rfac_next(k text, d int) returns text language sql immutable as $$
  select (split_part(k, ',', 1)::int + (array[0, 1, 0, -1])[d + 1]) || ',' || (split_part(k, ',', 2)::int + (array[-1, 0, 1, 0])[d + 1])
$$;
create or replace function private.rfac_add(a jsonb, b jsonb, k numeric default 1) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(key, v), '{}'::jsonb) from (
    select key, sum(val) v from (select key, value::numeric val from jsonb_each_text(coalesce(a, '{}'::jsonb))
                                 union all select key, value::numeric * k from jsonb_each_text(coalesce(b, '{}'::jsonb))) s group by key having sum(val) > 0.000001) t
$$;
/** work out what a layout makes: flows settle cell by cell (the same steps as the app); returns per-minute income at
    the crates, and each cell's output and status */
create or replace function private.rfac_solve(p_grid jsonb) returns jsonb language plpgsql stable as $$
declare c jsonb := private.rfac_cfg(); pc jsonb := c -> 'pieces'; v_cap numeric := (c ->> 'belt_cap')::numeric;
  v_keys text[] := array(select jsonb_object_keys(p_grid) order by 1); v_n int; it int; k text; n text; cell jsonb; p jsonb;
  outs jsonb := '{}'::jsonb; nouts jsonb; ins jsonb := '{}'::jsonb; v_in jsonb; v_out jsonb; v_tot numeric; v_rate numeric; need record; v_income jsonb := '{}'::jsonb; v_status jsonb := '{}'::jsonb;
  -- who feeds each cell: built once
  feeds jsonb := '{}'::jsonb;
begin
  v_n := coalesce(array_length(v_keys, 1), 0);
  if v_n = 0 then return jsonb_build_object('income', '{}'::jsonb, 'cells', '{}'::jsonb); end if;
  foreach k in array v_keys loop
    cell := p_grid -> k; p := pc -> (cell ->> 't');
    if p is null or (p ->> 'kind') = 'dock' then continue; end if;
    n := private.rfac_next(k, coalesce((cell ->> 'd')::int, 1));
    if p_grid ? n then feeds := jsonb_set(feeds, array[n], coalesce(feeds -> n, '[]'::jsonb) || to_jsonb(k)); end if;
  end loop;
  for it in 1 .. v_n + 2 loop
    nouts := '{}'::jsonb;
    foreach k in array v_keys loop
      cell := p_grid -> k; p := pc -> (cell ->> 't');
      if p is null then continue; end if;
      v_in := '{}'::jsonb;
      for n in select jsonb_array_elements_text(coalesce(feeds -> k, '[]'::jsonb)) loop v_in := private.rfac_add(v_in, outs -> n); end loop;
      if it = v_n + 2 then ins := ins || jsonb_build_object(k, v_in); end if;
      if (p ->> 'kind') = 'source' then v_out := jsonb_build_object(p ->> 'out', (p ->> 'rate')::numeric);
      elsif (p ->> 'kind') = 'belt' then
        select coalesce(sum(value::numeric), 0) into v_tot from jsonb_each_text(v_in);
        v_out := case when v_tot > v_cap then private.rfac_add('{}'::jsonb, v_in, v_cap / v_tot) else v_in end;
      elsif (p ->> 'kind') = 'machine' then
        v_rate := (p ->> 'rate')::numeric;
        for need in select key, value::numeric v from jsonb_each_text(p -> 'in') loop v_rate := least(v_rate, coalesce((v_in ->> need.key)::numeric, 0) / need.v); end loop;
        v_out := case when v_rate > 0.000001 then jsonb_build_object(p ->> 'out', v_rate) else '{}'::jsonb end;
      else v_out := '{}'::jsonb;
      end if;
      nouts := nouts || jsonb_build_object(k, v_out);
    end loop;
    outs := nouts;
  end loop;
  foreach k in array v_keys loop
    cell := p_grid -> k; p := pc -> (cell ->> 't');
    if p is null then continue; end if;
    if (p ->> 'kind') = 'dock' then v_income := private.rfac_add(v_income, ins -> k); end if;
    v_status := v_status || jsonb_build_object(k, case
      when (p ->> 'kind') = 'machine' and (outs -> k) = '{}'::jsonb then 'starved'
      when (p ->> 'kind') in ('source', 'machine', 'belt') and (outs -> k) <> '{}'::jsonb and not (p_grid ? private.rfac_next(k, coalesce((cell ->> 'd')::int, 1))) then 'spilling'
      else 'ok' end);
  end loop;
  return jsonb_build_object('income', (select coalesce(jsonb_object_agg(key, round(value::numeric, 4)), '{}'::jsonb) from jsonb_each_text(v_income)),
    'cells', (select coalesce(jsonb_object_agg(key, jsonb_build_object('out', outs -> key, 'status', v_status ->> key)), '{}'::jsonb) from jsonb_each(p_grid)));
end $$;

create or replace function private.rfac_row(p_realm uuid) returns public.realm_factories language plpgsql as $$
declare f public.realm_factories%rowtype; c jsonb := private.rfac_cfg();
begin
  select * into f from public.realm_factories where realm_id = p_realm for update;
  if found then return f; end if;
  insert into public.realm_factories (realm_id, grid, owned, rates) values (p_realm, c -> 'starter' -> 'grid', c -> 'starter' -> 'owned', private.rfac_solve(c -> 'starter' -> 'grid') -> 'income')
  on conflict do nothing;
  select * into f from public.realm_factories where realm_id = p_realm for update;
  return f;
end $$;
create or replace function private.rfac_pending(f public.realm_factories) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(key, round(value::numeric * least((private.rfac_cfg() ->> 'cap_hours')::numeric * 60, extract(epoch from now() - f.collected_at) / 60), 3)), '{}'::jsonb)
  from jsonb_each_text(f.rates)
$$;
create or replace function private.rfac_json(p_realm uuid) returns jsonb language plpgsql as $$
declare f public.realm_factories%rowtype := private.rfac_row(p_realm); r public.realms%rowtype;
begin
  select * into r from public.realms where id = p_realm;
  return jsonb_build_object('grid', f.grid, 'owned', f.owned, 'rates', f.rates, 'pending', private.rfac_pending(f), 'collected_at', f.collected_at, 'shipped', f.shipped,
    'size', private.rfac_size(private.rlm_lv(r.xp)), 'solve', private.rfac_solve(f.grid), 'cfg', private.rfac_cfg(), 'server_time', now());
end $$;
/** move what reached the crates into the wallet (with XP and a little Ink) */
create or replace function private.rfac_collect(p_realm uuid) returns jsonb language plpgsql as $$
declare f public.realm_factories%rowtype := private.rfac_row(p_realm); r public.realms%rowtype; c jsonb := private.rfac_cfg(); v_got jsonb; v_whole jsonb; v_val numeric; v_ink int; v_lv int;
begin
  select * into r from public.realms where id = p_realm;
  v_got := private.rfac_pending(f);
  select coalesce(jsonb_object_agg(key, floor(value::numeric)), '{}'::jsonb) into v_whole from jsonb_each_text(v_got) where floor(value::numeric) >= 1;
  if v_whole = '{}'::jsonb then return jsonb_build_object('got', '{}'::jsonb, 'ink', 0, 'level_up', null); end if;
  -- keep the fractions ticking: move collected_at on by exactly what was taken
  perform private.rlm_player(r.owner_id, 'workshop');
  update public.realm_players set wallet = private.jadd(wallet, v_whole), lifetime = private.jadd(lifetime, v_whole) where player_id = r.owner_id and kind = 'workshop';
  update public.realm_factories set collected_at = now(), shipped = private.rfac_add(shipped, v_whole) where realm_id = p_realm;
  v_val := private.rlm_value('workshop', v_whole);
  v_ink := private.rlm_pay(r.owner_id, 'workshop', floor(v_val / (c ->> 'ink_per_value')::numeric)::int, p_realm::text, 'factory:' || p_realm || ':' || extract(epoch from now())::bigint);
  v_lv := private.rlm_xp(p_realm, ceil(v_val * (c ->> 'xp_per_value')::numeric)::bigint);
  return jsonb_build_object('got', v_whole, 'ink', v_ink, 'level_up', v_lv);
end $$;
create or replace function private.rfac_owned(p_id uuid) returns public.realms language plpgsql as $$
declare r public.realms%rowtype := private.rlm_owned(p_id, private.require_active_player());
begin
  if r.kind <> 'workshop' then raise exception 'not_found' using errcode = 'P0001'; end if;
  return r;
end $$;
create or replace function private.rfac_out(p_realm uuid, p_uid uuid, p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select p_extra || jsonb_build_object('factory', private.rfac_json(p_realm), 'me', private.rlm_me(p_uid, 'workshop'), 'level', private.rlm_level((select xp from public.realms where id = p_realm)))
$$;

create or replace function public.factory_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype;
begin
  select * into r from public.realms where id = p_id;
  if not found or r.kind <> 'workshop' then raise exception 'not_found' using errcode = 'P0001'; end if;
  return public.realm_get(p_id) || jsonb_build_object('factory_core', private.rfac_json(r.id));
end $$;

create or replace function public.factory_collect(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rfac_owned(p_id);
begin
  perform private.rate_limit('factory_act', 1200, 3600);
  return private.rfac_out(r.id, r.owner_id, private.rfac_collect(r.id));
end $$;

create or replace function public.factory_buy(p_id uuid, p_piece text, p_n int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rfac_owned(p_id); f public.realm_factories%rowtype := private.rfac_row(p_id); p jsonb := private.rfac_cfg() -> 'pieces' -> p_piece; v_n int := least(greatest(coalesce(p_n, 1), 1), 50); v_cost int;
begin
  perform private.rate_limit('factory_act', 1200, 3600);
  if p is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if private.rlm_lv(r.xp) < (p ->> 'level')::int then raise exception 'level_too_low' using errcode = 'P0001'; end if;
  v_cost := v_n * (p ->> 'cost')::int;
  perform private.rlm_player(r.owner_id, 'workshop');
  if not private.jcovers((select wallet from public.realm_players where player_id = r.owner_id and kind = 'workshop'), jsonb_build_object('sparks', v_cost)) then raise exception 'not_enough' using errcode = 'P0001'; end if;
  update public.realm_players set wallet = private.jadd(wallet, jsonb_build_object('sparks', v_cost), -1) where player_id = r.owner_id and kind = 'workshop';
  update public.realm_factories set owned = jsonb_set(owned, array[p_piece], to_jsonb(coalesce((owned ->> p_piece)::int, 0) + v_n)) where realm_id = r.id;
  return private.rfac_out(r.id, r.owner_id, jsonb_build_object('level_up', private.rlm_xp(r.id, 5 + v_cost / 25)));
end $$;

/** save a new layout: what's built so far is collected first, then the new layout's rates take over */
create or replace function public.factory_save(p_id uuid, p_grid jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.realms%rowtype := private.rfac_owned(p_id); f public.realm_factories%rowtype := private.rfac_row(p_id); c jsonb := private.rfac_cfg(); v_size int; k text; cell jsonb; x int; y int;
  v_used jsonb := '{}'::jsonb; v_clean jsonb := '{}'::jsonb; v_col jsonb; e record;
begin
  perform private.rate_limit('factory_save', 600, 3600);
  if p_grid is null or jsonb_typeof(p_grid) <> 'object' then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
  v_size := private.rfac_size(private.rlm_lv(r.xp));
  for k, cell in select key, value from jsonb_each(p_grid) loop
    if k !~ '^\d{1,2},\d{1,2}$' then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    x := split_part(k, ',', 1)::int; y := split_part(k, ',', 2)::int;
    if x >= v_size or y >= v_size then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    if c -> 'pieces' -> (cell ->> 't') is null or coalesce((cell ->> 'd')::int, -1) not between 0 and 3 then raise exception 'invalid_layout' using errcode = 'P0001'; end if;
    v_used := jsonb_set(v_used, array[cell ->> 't'], to_jsonb(coalesce((v_used ->> (cell ->> 't'))::int, 0) + 1));
    v_clean := v_clean || jsonb_build_object(k, jsonb_build_object('t', cell ->> 't', 'd', (cell ->> 'd')::int));
  end loop;
  for e in select key, value::int n from jsonb_each_text(v_used) loop
    if e.n > coalesce((f.owned ->> e.key)::int, 0) then raise exception 'factory_not_enough_pieces' using errcode = 'P0001', detail = e.key; end if;
  end loop;
  v_col := private.rfac_collect(r.id);
  update public.realm_factories set grid = v_clean, rates = private.rfac_solve(v_clean) -> 'income', collected_at = now() where realm_id = r.id;
  return private.rfac_out(r.id, r.owner_id, v_col);
end $$;

-- a second minigame for the workshop: Wire Puzzle
update public.game_config set value = jsonb_set(value, '{kinds,workshop,games,wires}',
  (value -> 'kinds' -> 'workshop' -> 'games' -> 'line') || jsonb_build_object('name', 'Wire Puzzle', 'emoji', '🔌', 'blurb', 'Turn the wire tiles to carry power from the battery to every bulb. Faster solves score more.', 'level', 3))
 where key = 'realms' and value -> 'kinds' -> 'workshop' -> 'games' ? 'line' and not (value -> 'kinds' -> 'workshop' -> 'games' ? 'wires');

do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text sig, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'private' and p.proname like 'rfac\_%') or (n.nspname = 'public' and p.proname like 'factory\_%') loop
    execute format('revoke all on function %s from public', f.sig);
    if f.nspname = 'public' then
      execute format('revoke all on function %s from anon', f.sig);
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;
