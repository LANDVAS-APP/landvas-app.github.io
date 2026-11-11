-- v1.2: three more ultra rarities, and Prismatic made rarer (1 in 100,000).
--   Chaos 🎲    its rent multiplier re-rolls every day at the daily reset: anywhere from ×0 to ×20 (salted on the
--               server, so tomorrow's roll can't be known)
--   Phoenix 🔥  ×2 rent on days you check in; it fades 25% for every day you miss (down to ashes); the day you come
--               back it's reborn at ×10
--   Crown 👑    only one per city (the Hot Zone cities), only rolled inside one; whoever holds it is that city's Crown:
--               2× rent on everything they own (holding more than one doesn't stack), and the title
-- Chaos and Phoenix change by the day, so their extra rent is added up day by day (like Solar/Lunar's windows), and
-- rent is settled when you check in so a Phoenix's change starts exactly then.

update public.plot_rarities set ppm = 10 where id = 'prismatic';

insert into public.plot_rarities (id, name, weight, usd_per_second, ink_reward_multiplier, price_multiplier, color, glow, sort, ppm, emoji, ability) values
  ('chaos',   'Chaos',   0, 0.0000000100, 2.8, 1, '#FF2E63', '#FFE14D', 13, 300, '🎲', 'Its rent multiplier re-rolls every day: anywhere from ×0 to ×20.'),
  ('phoenix', 'Phoenix', 0, 0.0000000120, 3,   1, '#FF5A1F', '#FFD166', 14, 300, '🔥', '×2 rent on days you check in, fades 25% each day you miss — and is reborn ×10 the day you come back.'),
  ('crown',   'Crown',   0, 0.0000000500, 4,   1, '#FFD23F', '#FFF4B8', 15, 0,   '👑', 'Only one per city. Its holder is that city’s Crown: 2× rent on everything they own.')
on conflict (id) do nothing;

update public.game_config set value = value || '{"chaos": {"values": [0, 0.5, 1, 1, 2, 2, 3, 5, 10, 20]}, "phoenix": {"lit": 2, "reborn": 10, "fade_per_day": 0.25}, "crown": {"ppm": 1000, "pct": 100, "max": 1}}'::jsonb
 where key = 'rarity_abilities';

alter table public.daily_streaks add column if not exists reborn_day date;

-- ---- the Crown: which city a plot is in, and one Crown per city --------------------------------------------------
create or replace function private.city_at(p_gx int, p_gy int) returns jsonb language sql stable as $$
  select c from (select private.cfg('hot_zones') z) x, jsonb_array_elements(coalesce(z -> 'cities', '[]')) c
  where ((p_gx - (c ->> 'gx')::int)::numeric ^ 2 + (p_gy - (c ->> 'gy')::int)::numeric ^ 2) <= (coalesce((z ->> 'radius')::int, 2500)::numeric ^ 2)
  limit 1
$$;
create or replace function private.crown_held(p_city text) returns boolean language sql stable as $$
  select exists (select 1 from public.world_plots p where p.rarity = 'crown' and p.owner_id is not null and private.city_at(p.gx, p.gy) ->> 'name' = p_city)
$$;

create or replace function private.plot_rarity_for(p_gx int, p_gy int) returns text
language plpgsql stable as $$
declare v_total int; r record; v_hot boolean := private.in_hot_zone(p_gx, p_gy);
  v_um numeric := case when v_hot then coalesce((private.cfg('hot_zones') ->> 'ultra_mult')::numeric, 5) else 1 end;
  v_u bigint := abs(private.cell_roll('ultra', p_gx, p_gy)) % 1000000; v_uacc numeric := 0; v_a text; v_b text; v_city jsonb;
begin
  -- the Crown: only inside a city, and only while that city has none (checked again when it's claimed)
  v_city := private.city_at(p_gx, p_gy);
  if v_city is not null and abs(private.cell_roll('crown', p_gx, p_gy)) % 1000000
       < coalesce((private.cfg('rarity_abilities') -> 'crown' ->> 'ppm')::numeric, 1000) * v_um
     and not private.crown_held(v_city ->> 'name') then
    return 'crown';
  end if;
  for r in select id, ppm from public.plot_rarities where ppm > 0 order by ppm, sort loop
    v_uacc := v_uacc + r.ppm * v_um;
    if v_u < v_uacc then return r.id; end if;
  end loop;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return 'common'; end if;
  v_a := private.rarity_pick(private.cell_roll('rarity', p_gx, p_gy) % v_total);
  if not v_hot then return v_a; end if;
  v_b := private.rarity_pick(abs(private.cell_roll('hot' || private.today()::text, p_gx, p_gy)) % v_total);
  return case when (select sort from public.plot_rarities where id = v_b) > (select sort from public.plot_rarities where id = v_a) then v_b else v_a end;
end $$;

-- two players can't take the same city's Crown at once: the claim locks the city and checks again
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, '  v_rarity := private.plot_rarity_for(p_gx, p_gy);',
    '  v_rarity := private.plot_rarity_for(p_gx, p_gy);' || chr(10) ||
    '  if v_rarity = ''crown'' then' || chr(10) ||
    '    perform pg_advisory_xact_lock(hashtext(''crown:'' || coalesce(private.city_at(p_gx, p_gy) ->> ''name'', '''')));' || chr(10) ||
    '    if private.crown_held(private.city_at(p_gx, p_gy) ->> ''name'') then v_rarity := ''mythic''; end if;' || chr(10) ||
    '  end if;');
  if n = d then raise exception 'chaos/phoenix/crown: take_plot anchor not found'; end if;
  execute n;
end $$;

-- the Crown's 2× (+100%, once however many you hold) joins the multiplier on all your rent
create or replace function private.rent_mult(p_uid uuid) returns numeric language sql stable as $$
  select 1 + (coalesce(private.collection_pct(p_uid), 0)
    + least(coalesce((a -> 'prismatic' ->> 'pct')::numeric, 5) * (select count(*) from public.world_plots where owner_id = p_uid and rarity = 'prismatic'), coalesce((a -> 'prismatic' ->> 'max_pct')::numeric, 50))
    + coalesce((a -> 'genesis' ->> 'pct')::numeric, 25) * least((select count(*) from public.world_plots where owner_id = p_uid and rarity = 'genesis'), 4)
    + coalesce((a -> 'crown' ->> 'pct')::numeric, 100) * least((select count(*) from public.world_plots where owner_id = p_uid and rarity = 'crown'), coalesce((a -> 'crown' ->> 'max')::int, 1))) / 100
  from (select private.cfg('rarity_abilities') a) x
$$;

-- ---- Chaos and Phoenix: a multiplier per plot per day --------------------------------------------------------------
/** the game day a moment falls in (days roll over at the daily reset, like the streak) */
create or replace function private.game_day(p_ts timestamptz) returns date language sql stable as $$ select (private.day_start(p_ts) at time zone 'UTC')::date $$;
create or replace function private.chaos_mult(p_gx int, p_gy int, p_day date) returns numeric language sql stable as $$
  select coalesce((v ->> (abs(private.cell_roll('chaos' || p_day::text, p_gx, p_gy)) % greatest(jsonb_array_length(v), 1))::int)::numeric, 1)
  from (select coalesce(private.cfg('rarity_abilities') -> 'chaos' -> 'values', '[1]'::jsonb) v) x
$$;
create or replace function private.phoenix_mult(p_uid uuid, p_day date) returns numeric language sql stable as $$
  select case
    when s.last_day is null then 1
    when p_day <= s.last_day then case when s.reborn_day = p_day then coalesce((c ->> 'reborn')::numeric, 10) else coalesce((c ->> 'lit')::numeric, 2) end
    else greatest(0, 1 - coalesce((c ->> 'fade_per_day')::numeric, 0.25) * (p_day - s.last_day)) end
  from (select private.cfg('rarity_abilities') -> 'phoenix' c) x
  left join public.daily_streaks s on s.player_id = p_uid
$$;
/** a Chaos or Phoenix plot's multiplier on a given day (1 for every other plot) */
create or replace function private.plot_day_mult(p public.world_plots, p_day date) returns numeric language sql stable as $$
  select case p.rarity when 'chaos' then private.chaos_mult(p.gx, p.gy, p_day) when 'phoenix' then private.phoenix_mult(p.owner_id, p_day) else 1 end
$$;
/** the extra (or, for a fading Phoenix, missing) rent of Chaos and Phoenix plots over [from, to], day by day */
create or replace function private.daily_extra(p_uid uuid, p_from timestamptz, p_to timestamptz) returns numeric language sql stable as $$
  with plots as (
    select p, private.plot_rate(p, r.usd_per_second) * private.rent_mult(p_uid) as rate
    from public.world_plots p join public.plot_rarities r on r.id = p.rarity
    where p.owner_id = p_uid and p.rarity in ('chaos', 'phoenix')),
  days as (
    select ds, ds + interval '1 day' as de from generate_series(private.day_start(p_from), private.day_start(p_to), interval '1 day') ds where p_to > p_from)
  select coalesce(sum(pl.rate * (private.plot_day_mult(pl.p, (d.ds at time zone 'UTC')::date) - 1)
                      * greatest(0, extract(epoch from least(d.de, p_to) - greatest(d.ds, p_from)))), 0)
  from plots pl cross join days d
$$;
create or replace function private.daily_extra_json(p_uid uuid, p_settled_at timestamptz) returns jsonb language sql stable as $$
  with t as (select private.day_start(now()) ds, greatest(p_settled_at, now() - make_interval(days => coalesce((private.cfg('rent') ->> 'max_offline_days')::int, 30))) f)
  select jsonb_build_object(
    -- what Chaos/Phoenix added before today began; today's extra rate (per second); and when today started and ends
    'prior', private.daily_extra(p_uid, t.f, greatest(t.f, t.ds)),
    'rate', coalesce((select sum(private.plot_rate(p, r.usd_per_second) * private.rent_mult(p_uid) * (private.plot_day_mult(p, private.game_day(now())) - 1))
                      from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.owner_id = p_uid and p.rarity in ('chaos', 'phoenix')), 0),
    'start', t.ds, 'end', t.ds + interval '1 day')
  from t
$$;
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.rent_settle(uuid)'::regprocedure);
  n := replace(d, '+ private.ability_extra(p_uid, a.settled_at), 15);',
    '+ private.ability_extra(p_uid, a.settled_at) + private.daily_extra(p_uid, greatest(a.settled_at, now() - make_interval(days => coalesce((private.cfg(''rent'') ->> ''max_offline_days'')::int, 30))), now()), 15);');
  if n = d then raise exception 'chaos/phoenix/crown: rent_settle anchor not found'; end if;
  execute n;
  d := pg_get_functiondef('private.rent_json(uuid)'::regprocedure);
  n := replace(d, '+ private.ability_extra(p_uid, a.settled_at));',
    '+ private.ability_extra(p_uid, a.settled_at) + private.daily_extra(p_uid, greatest(a.settled_at, now() - make_interval(days => coalesce((private.cfg(''rent'') ->> ''max_offline_days'')::int, 30))), now()));');
  n := replace(n, '''extras'', private.rent_extras_json(p_uid),', '''extras'', private.rent_extras_json(p_uid) || jsonb_build_object(''daily'', private.daily_extra_json(p_uid, a.settled_at)),');
  if position('daily_extra(' in n) = 0 or position('daily_extra_json' in n) = 0 then raise exception 'chaos/phoenix/crown: rent_json anchors not found'; end if;
  execute n;
  -- my plots: today's multiplier for Chaos and Phoenix plots
  d := pg_get_functiondef('public.my_plots()'::regprocedure);
  n := replace(d, $a$'shiny', p.shiny)$a$, $a$'shiny', p.shiny, 'today_mult', case when p.rarity in ('chaos', 'phoenix') then private.plot_day_mult(p, private.game_day(now())) end)$a$);
  if n = d then raise exception 'chaos/phoenix/crown: my_plots anchor not found'; end if;
  execute n;
  -- checking in settles rent first (so a Phoenix's change starts now), and a comeback after a missed day is a rebirth
  d := pg_get_functiondef('public.daily_claim()'::regprocedure);
  n := replace(d, '  if s.last_day = v_day then raise exception ''already_claimed'' using errcode = ''P0001''; end if;',
    '  if s.last_day = v_day then raise exception ''already_claimed'' using errcode = ''P0001''; end if;' || chr(10) ||
    '  perform private.rent_settle(v_uid);' || chr(10) ||
    '  if s.last_day is not null and s.last_day < v_day - 1 then update public.daily_streaks set reborn_day = v_day where player_id = v_uid; end if;');
  if n = d then raise exception 'chaos/phoenix/crown: daily_claim anchor not found'; end if;
  execute n;
  -- the Hot Zone says whether its city's Crown is still out there
  d := pg_get_functiondef('public.hot_zone_today()'::regprocedure);
  n := replace(d, $a$'ends_at', private.day_start(now()) + interval '1 day',$a$,
    $a$'ends_at', private.day_start(now()) + interval '1 day', 'crown_free', not private.crown_held(private.hot_zone(private.today()) ->> 'name'),$a$);
  if n = d then raise exception 'chaos/phoenix/crown: hot_zone_today anchor not found'; end if;
  execute n;
end $$;

-- ---- the Crowns of the world ----------------------------------------------------------------------------------------
create or replace function public.crowns() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('city', c ->> 'name',
    'holder', (select pr.username from public.world_plots p join public.profiles pr on pr.id = p.owner_id
               where p.rarity = 'crown' and p.owner_id is not null and private.city_at(p.gx, p.gy) ->> 'name' = c ->> 'name' limit 1),
    'since', (select p.claimed_at from public.world_plots p where p.rarity = 'crown' and p.owner_id is not null and private.city_at(p.gx, p.gy) ->> 'name' = c ->> 'name' limit 1))
    order by c ->> 'name'), '[]')
  from (select private.cfg('hot_zones') z) x, jsonb_array_elements(coalesce(z -> 'cities', '[]')) c
$$;

revoke all on function public.crowns() from public, anon;
grant execute on function public.crowns() to authenticated;
do $$
declare f text;
begin
  foreach f in array array['private.city_at(integer, integer)', 'private.crown_held(text)', 'private.game_day(timestamptz)', 'private.chaos_mult(integer, integer, date)',
    'private.phoenix_mult(uuid, date)', 'private.plot_day_mult(public.world_plots, date)', 'private.daily_extra(uuid, timestamptz, timestamptz)', 'private.daily_extra_json(uuid, timestamptz)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
