-- v0.9.2 Bigger land, more to play — and no more rent upgrades.
--
-- 1) Games open up with the size of the place. A place on one plot gets a quarter of its type's games, two or three
--    merged plots get half, and four or more get all of them (and a 2x2 square can become the Estate instead).
--    The arcade: 4 cabinets → 8 → all 16. Farms 2 → 3 → 6, businesses 1 → 2 → 4, the realm types 1 → 1 → 2.
--    Games open in a fixed order (the arcade's lowest-level cabinets first). Enforced in every *_start function.
-- 2) Plots can no longer be upgraded for rent. Every plot goes back to level 1 (rent is banked at the old rate first)
--    and everything players spent on plot upgrades is refunded.

insert into public.game_config (key, value, description) values ('plot_access', $cfg${
  "steps": [[1, 0.25], [2, 0.5], [4, 1]],
  "order": {
    "farm": ["tractor", "sheep", "veggie_catch", "pest_pop", "pollinator", "recipe_rush"],
    "business": ["lemon_pour", "delivery_dash", "haggle", "stock_trader"]
  }
}$cfg$::jsonb, 'How many of a place''s games are open by how many plots it has: [[plots, share], …]; the unlock order per place type (arcade and realms go by level).')
on conflict (key) do update set value = excluded.value;

-- ---- which games a place type has, in the order they open --------------------------------------------------------
create or replace function private.place_games(p_kind text) returns text[]
language plpgsql stable as $$
declare v text[]; o jsonb := private.cfg('plot_access') -> 'order' -> p_kind; c jsonb;
begin
  if p_kind = 'arcade' then
    select array_agg(key order by coalesce((value ->> 'level')::int, 1), coalesce((value ->> 'order')::int, 99), key) into v
      from jsonb_each(private.arc_cfg() -> 'games');
  elsif p_kind = 'farm' or p_kind = 'business' then
    c := case p_kind when 'farm' then private.farm_cfg() else private.biz_cfg() end -> 'games';
    -- the configured order first, then any game added later
    select array_agg(k order by coalesce(p, 999), k) into v
      from (select key as k, (select ord from jsonb_array_elements_text(coalesce(o, '[]'::jsonb)) with ordinality e(x, ord) where x = key) as p from jsonb_object_keys(c) key) s;
  else
    c := private.rlm_cfg(p_kind) -> 'games';
    if c is null then return '{}'; end if;
    select array_agg(key order by coalesce((value ->> 'level')::int, 1), key) into v from jsonb_each(c);
  end if;
  return coalesce(v, '{}');
end $$;

/** how many of n games are open for a place on p plots */
create or replace function private.place_open(p_n int, p_plots int) returns int
language plpgsql stable as $$
declare s jsonb; v_share numeric := 0.25;
begin
  for s in select * from jsonb_array_elements(coalesce(private.cfg('plot_access') -> 'steps', '[[1,0.25],[2,0.5],[4,1]]'::jsonb)) loop
    if p_plots >= (s ->> 0)::int then v_share := (s ->> 1)::numeric; end if;
  end loop;
  return least(p_n, greatest(1, ceil(p_n * v_share)::int));
end $$;

create or replace function private.group_plots(p_group uuid) returns int
language sql stable as $$ select count(*)::int from public.canvas_group_members where group_id = p_group $$;

/** the place's type and land, from its id */
create or replace function private.place_of(p_kind text, p_id uuid, out kind text, out group_id uuid)
language plpgsql stable as $$
begin
  if p_kind = 'arcade' then select 'arcade', a.group_id into kind, group_id from public.arcades a where a.id = p_id;
  elsif p_kind = 'farm' then select 'farm', f.group_id into kind, group_id from public.farms f where f.id = p_id;
  elsif p_kind = 'business' then select 'business', b.group_id into kind, group_id from public.businesses b where b.id = p_id;
  else select r.kind, r.group_id into kind, group_id from public.realms r where r.id = p_id;
  end if;
end $$;

/** what's open at a place: its plots, how many games, which ones, and what merging more would open */
create or replace function private.place_access_json(p_kind text, p_group uuid) returns jsonb
language plpgsql stable as $$
declare v_all text[] := private.place_games(p_kind); n int := coalesce(array_length(v_all, 1), 0); p int := greatest(1, coalesce(private.group_plots(p_group), 1));
  v_open int; v_next int; s jsonb;
begin
  v_open := case when n = 0 then 0 else private.place_open(n, p) end;
  -- the next size up that opens more
  for s in select * from jsonb_array_elements(coalesce(private.cfg('plot_access') -> 'steps', '[[1,0.25],[2,0.5],[4,1]]'::jsonb)) loop
    if v_next is null and (s ->> 0)::int > p and private.place_open(n, (s ->> 0)::int) > v_open then v_next := (s ->> 0)::int; end if;
  end loop;
  return jsonb_build_object('plots', p, 'total', n, 'open', v_open, 'games', to_jsonb(v_all), 'allowed', to_jsonb(v_all[1:v_open]),
    'next', case when v_next is null then null else jsonb_build_object('plots', v_next, 'open', private.place_open(n, v_next)) end);
end $$;

/** raise if the game isn't open at this place yet (unknown games and places fall through to the caller's own checks) */
create or replace function private.place_gate(p_kind text, p_id uuid, p_game text) returns void
language plpgsql stable as $$
declare pl record; v_all text[]; i int;
begin
  select * into pl from private.place_of(p_kind, p_id);
  if pl.kind is null then return; end if;
  v_all := private.place_games(pl.kind);
  i := array_position(v_all, p_game);
  if i is null then return; end if;
  if i > private.place_open(array_length(v_all, 1), greatest(1, coalesce(private.group_plots(pl.group_id), 1))) then
    raise exception 'needs_bigger_place' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.place_access(p_kind text, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare pl record;
begin
  perform private.require_active_player();
  select * into pl from private.place_of(p_kind, p_id);
  if pl.kind is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  return private.place_access_json(pl.kind, pl.group_id);
end $$;
revoke all on function public.place_access(text, uuid) from public, anon;
grant execute on function public.place_access(text, uuid) to authenticated;

-- every game start checks it first
do $$
declare f record; d text; n text;
begin
  for f in select * from (values
      ('public.arcade_start'::text, 'arcade'::text, 'p_arcade'::text),
      ('public.realm_start', 'realm', 'p_id'),
      ('public.farm_game_start', 'farm', 'p_farm'),
      ('public.biz_game_start', 'business', 'p_biz')) v(fn, kind, arg) loop
    for d in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
              where s.nspname || '.' || p.proname = f.fn loop
      n := regexp_replace(d, chr(10) || 'begin' || chr(10), chr(10) || 'begin' || chr(10) || '  perform private.place_gate(''' || f.kind || ''', ' || f.arg || ', p_game);' || chr(10));
      if n = d then raise exception 'place access: no begin in %', f.fn; end if;
      execute n;
    end loop;
  end loop;
end $$;

-- ---- no more plot upgrades -----------------------------------------------------------------------------------------
-- bank everyone's rent at the old rate, then put every plot back to level 1
do $$
declare u uuid;
begin
  for u in select distinct owner_id from public.world_plots where level > 1 and owner_id is not null loop
    perform private.rent_settle(u);
  end loop;
  update public.world_plots set level = 1, updated_at = now() where level > 1;
end $$;

-- refund exactly what each player spent on upgrades
do $$
declare r record;
begin
  for r in select player_id, resource, -sum(delta) as spent from public.resource_ledger
            where reason = 'upgrade_level' and delta < 0 group by player_id, resource having -sum(delta) > 0 loop
    perform private.ledger_apply(r.player_id, r.resource, r.spent::bigint, 'upgrade_refund', 'plot_upgrades', null, 'upgrade-refund:' || r.player_id || ':' || r.resource);
  end loop;
end $$;

create or replace function public.upgrade_plot(p_gx int, p_gy int, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_active_player();
  raise exception 'upgrades_removed' using errcode = 'P0001';
end $$;

update public.game_config set value = value - 'upgrade' || '{"upgrade": {"max_level": 1, "level_cost_ink": [0], "level_cost_pigments": [0]}}'::jsonb where key = 'economy';
update public.achievements set is_active = false where metric = 'upgrades';
