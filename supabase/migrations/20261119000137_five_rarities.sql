-- Five new rarities, and the plot-type collection no longer boosts rent (it stays as an album).
--   Dragon 🐉       grows with your daily streak: +10% for every day in a row you check in, up to ×10
--   Eclipse 🌑      an ordinary plot most days — but about one day in seven the eclipse comes: ×25 all day
--   Vampire 🧛      feeds on its neighbours: +50% for every other player's plot within ~100 m, up to ×10
--   Mirror 🪞       copies the rent of your best other plot
--   Singularity 🕳️  one in a million: every plot you own earns double
-- Dragon, Eclipse, Vampire and Mirror ride the day-by-day engine (like Chaos and Phoenix); Singularity joins the
-- all-your-rent multiplier (like Prismatic and Genesis).

-- ---- the collection: an album, not a bonus ---------------------------------------------------------------------------
update public.game_config set value = value || '{"enabled": false, "tiers": []}'::jsonb where key = 'collection';

-- ---- the rarities ------------------------------------------------------------------------------------------------------
insert into public.plot_rarities (id, name, weight, usd_per_second, ink_reward_multiplier, price_multiplier, color, glow, sort, ppm, emoji, ability) values
  ('dragon',      'Dragon',      0, 0.0000000130, 2.9, 1, '#22C55E', '#BBF7D0', 16, 250, '🐉', 'Grows with your daily streak: +10% rent for every day in a row you check in, up to ×10. Miss a day and it sleeps.'),
  ('eclipse',     'Eclipse',     0, 0.0000000130, 3,   1, '#7C3AED', '#FDE68A', 17, 250, '🌑', 'Most days an ordinary plot — but about one day in seven the eclipse comes: ×25 rent all day.'),
  ('vampire',     'Vampire',     0, 0.0000000140, 3,   1, '#DC2626', '#FECDD3', 18, 200, '🧛', 'Feeds on its neighbours: +50% rent for every other player’s plot within about 100 m, up to ×10.'),
  ('mirror',      'Mirror',      0, 0.0000000150, 3.2, 1, '#7DD3FC', '#F0F9FF', 19, 100, '🪞', 'Copies the rent of your best other plot — pair it with an ultra and it earns like one.'),
  ('singularity', 'Singularity', 0, 0.0000010000, 8,   1, '#B4FF39', '#F2FFD6', 20,   1, '🕳️', 'One in a million. Bends everything around it: every plot you own earns double.')
on conflict (id) do update set name = excluded.name, usd_per_second = excluded.usd_per_second, ink_reward_multiplier = excluded.ink_reward_multiplier,
  color = excluded.color, glow = excluded.glow, sort = excluded.sort, ppm = excluded.ppm, emoji = excluded.emoji, ability = excluded.ability;

update public.game_config set value = value || '{"dragon": {"per_day": 0.1, "max": 10}, "eclipse": {"one_in": 7, "mult": 25},
  "vampire": {"per_neighbour": 0.5, "max": 10, "cells": 11}, "singularity": {"pct": 100}}'::jsonb
 where key = 'rarity_abilities';

-- ---- the day-by-day multipliers ------------------------------------------------------------------------------------------
create or replace function private.dragon_mult(p_uid uuid, p_day date) returns numeric language sql stable as $$
  select case when s.last_day is not null and s.last_day >= p_day - 1 and s.streak > 0
              then least(1 + coalesce((c ->> 'per_day')::numeric, 0.1) * s.streak, coalesce((c ->> 'max')::numeric, 10)) else 1 end
  from (select private.cfg('rarity_abilities') -> 'dragon' c) x
  left join public.daily_streaks s on s.player_id = p_uid
$$;
create or replace function private.eclipse_mult(p_gx int, p_gy int, p_day date) returns numeric language sql stable as $$
  select case when abs(private.cell_roll('eclipse' || p_day::text, p_gx, p_gy)) % greatest(coalesce((c ->> 'one_in')::int, 7), 1) = 0
              then coalesce((c ->> 'mult')::numeric, 25) else 1 end
  from (select private.cfg('rarity_abilities') -> 'eclipse' c) x
$$;
create or replace function private.vampire_mult(p public.world_plots) returns numeric language sql stable as $$
  select least(1 + coalesce((c ->> 'per_neighbour')::numeric, 0.5) * (
      select count(*) from public.world_plots q
       where q.gx between p.gx - r and p.gx + r and q.gy between p.gy - r and p.gy + r
         and q.owner_id is not null and q.owner_id <> p.owner_id),
    coalesce((c ->> 'max')::numeric, 10))
  from (select private.cfg('rarity_abilities') -> 'vampire' c, coalesce((private.cfg('rarity_abilities') -> 'vampire' ->> 'cells')::int, 11) r) x
$$;
create or replace function private.mirror_mult(p public.world_plots) returns numeric language sql stable as $$
  select greatest(1, coalesce((
      select max(private.plot_rate(q, r.usd_per_second)) from public.world_plots q join public.plot_rarities r on r.id = q.rarity
       where q.owner_id = p.owner_id and q.rarity <> 'mirror' and (q.gx, q.gy) <> (p.gx, p.gy)), 0)
    / nullif(private.plot_rate(p, (select usd_per_second from public.plot_rarities where id = 'mirror')), 0))
$$;

create or replace function private.plot_day_mult(p public.world_plots, p_day date) returns numeric language sql stable as $$
  select case p.rarity
    when 'chaos' then private.chaos_mult(p.gx, p.gy, p_day)
    when 'phoenix' then private.phoenix_mult(p.owner_id, p_day)
    when 'dragon' then private.dragon_mult(p.owner_id, p_day)
    when 'eclipse' then private.eclipse_mult(p.gx, p.gy, p_day)
    when 'vampire' then private.vampire_mult(p)
    when 'mirror' then private.mirror_mult(p)
    else 1 end
$$;
create or replace function private.day_rarities() returns text[] language sql immutable as $$
  select array['chaos', 'phoenix', 'dragon', 'eclipse', 'vampire', 'mirror']
$$;

create or replace function private.daily_extra(p_uid uuid, p_from timestamptz, p_to timestamptz) returns numeric language sql stable as $$
  with plots as (
    select p, private.plot_rate(p, r.usd_per_second) * private.rent_mult(p_uid) as rate
    from public.world_plots p join public.plot_rarities r on r.id = p.rarity
    where p.owner_id = p_uid and p.rarity = any (private.day_rarities())),
  days as (
    select ds, ds + interval '1 day' as de from generate_series(private.day_start(p_from), private.day_start(p_to), interval '1 day') ds where p_to > p_from)
  select coalesce(sum(pl.rate * (private.plot_day_mult(pl.p, (d.ds at time zone 'UTC')::date) - 1)
                      * greatest(0, extract(epoch from least(d.de, p_to) - greatest(d.ds, p_from)))), 0)
  from plots pl cross join days d
$$;
create or replace function private.daily_extra_json(p_uid uuid, p_settled_at timestamptz) returns jsonb language sql stable as $$
  with t as (select private.day_start(now()) ds, greatest(p_settled_at, now() - make_interval(days => coalesce((private.cfg('rent') ->> 'max_offline_days')::int, 30))) f)
  select jsonb_build_object(
    'prior', private.daily_extra(p_uid, t.f, greatest(t.f, t.ds)),
    'rate', coalesce((select sum(private.plot_rate(p, r.usd_per_second) * private.rent_mult(p_uid) * (private.plot_day_mult(p, private.game_day(now())) - 1))
                      from public.world_plots p join public.plot_rarities r on r.id = p.rarity where p.owner_id = p_uid and p.rarity = any (private.day_rarities())), 0),
    'start', t.ds, 'end', t.ds + interval '1 day')
  from t
$$;

-- my plots: today's multiplier for every day-by-day rarity
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.my_plots()'::regprocedure);
  n := replace(d, $a$case when p.rarity in ('chaos', 'phoenix') then private.plot_day_mult(p, private.game_day(now())) end$a$,
                  $a$case when p.rarity = any (private.day_rarities()) then private.plot_day_mult(p, private.game_day(now())) end$a$);
  if n = d then raise exception 'five rarities: my_plots anchor not found'; end if;
  execute n;
end $$;

-- ---- Singularity: double everything (joins the all-your-rent multiplier) ---------------------------------------------------
-- (the collection term stays, at 0 while it's switched off)
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.rent_mult(uuid)'::regprocedure);
  n := replace(d, $a$+ coalesce((a -> 'genesis' ->> 'pct')::numeric, 25)$a$,
                  $a$+ coalesce((a -> 'singularity' ->> 'pct')::numeric, 100) * least((select count(*) from public.world_plots where owner_id = p_uid and rarity = 'singularity'), 1)
    + coalesce((a -> 'genesis' ->> 'pct')::numeric, 25)$a$);
  if n = d then raise exception 'five rarities: rent_mult anchor not found'; end if;
  execute n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.dragon_mult(uuid, date)', 'private.eclipse_mult(integer, integer, date)', 'private.vampire_mult(public.world_plots)',
    'private.mirror_mult(public.world_plots)', 'private.day_rarities()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
