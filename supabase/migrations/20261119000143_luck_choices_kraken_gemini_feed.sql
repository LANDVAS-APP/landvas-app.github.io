-- Luck you can see, two new ultras, and a livelier feed.
--  * Luck rerolls: every 20 Luck is a free reroll on your next claim — anywhere: the map, the Hot Zone, simple mode —
--    up to 6 rolls in all. You see every roll and choose the one plot you keep. (Under 20, Luck waits.)
--  * Sacrifice anything: plots, Ink (no daily limit any more), Inkborn and unhatched eggs. Luck tops out at 100.
--  * Eclipse and Vampire are gone. Their plots become Comet and Kraken plots:
--      Kraken 🐙   lurks under the map and drags in the rent around it: +75% for every other player's plot within
--                  about 200 m, up to ×20
--      Gemini ♊   comes alive in pairs: on its own an ordinary ultra, but own two and each earns ×12
--  * The live feed: Luck sacrifices and picks, Crowns claimed, shiny pulls, flights to the Hot Zone, estates that earn
--    their rent day.
--  * Admins can edit every rarity: its odds (weight or 1-in-N), rent, Ink bonus, emoji and ability text.

-- ---- the two new ultras, and the two that go --------------------------------------------------------------------------
insert into public.plot_rarities (id, name, weight, usd_per_second, ink_reward_multiplier, price_multiplier, color, glow, sort, ppm, emoji, ability) values
  ('kraken', 'Kraken', 0, 0.0000000150, 3.2, 1, '#0EA5A4', '#99F6E4', 23, 200, '🐙', 'Lurks under the map and drags in the rent around it: +75% for every other player’s plot within about 200 m, up to ×20.'),
  ('gemini', 'Gemini', 0, 0.0000000140, 3,   1, '#F472B6', '#FBCFE8', 24, 250, '♊', 'Comes alive in pairs: on its own an ordinary ultra, but own two Gemini plots and each earns ×12.')
on conflict (id) do update set name = excluded.name, usd_per_second = excluded.usd_per_second, ink_reward_multiplier = excluded.ink_reward_multiplier,
  color = excluded.color, glow = excluded.glow, sort = excluded.sort, ppm = excluded.ppm, emoji = excluded.emoji, ability = excluded.ability;
update public.world_plots set rarity = 'kraken' where rarity = 'vampire';
update public.world_plots set rarity = 'comet' where rarity = 'eclipse';
update public.roll_tickets set min_rarity = 'mythic' where min_rarity in ('eclipse', 'vampire');
delete from public.plot_rarities where id in ('eclipse', 'vampire');
update public.game_config set value = (value - 'eclipse' - 'vampire') || '{"kraken": {"per_neighbour": 0.75, "max": 20, "cells": 21}, "gemini": {"pair_mult": 12}}'::jsonb
 where key = 'rarity_abilities';
update public.achievements set is_active = false where key in ('rar_eclipse', 'rar_vampire');
insert into public.achievements (key, name, description, icon, category, metric, threshold, reward, sort) values
  ('rar_kraken', 'Release the Kraken', 'Own a Kraken plot.', 'rarity:kraken', 'rarity', 'rar_kraken', 1, '{"pigments": 50, "gallery_tokens": 4}', 123),
  ('rar_gemini', 'Double Trouble', 'Own a Gemini plot.', 'rarity:gemini', 'rarity', 'rar_gemini', 1, '{"pigments": 45, "gallery_tokens": 3}', 124),
  ('gemini_pair', 'Twin Flames', 'Own a pair of Gemini plots.', 'rarity:gemini', 'rarity', 'rar_gemini', 2, '{"pigments": 80, "gallery_tokens": 6}', 125)
on conflict (key) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, metric = excluded.metric, threshold = excluded.threshold, is_active = true;

create or replace function private.kraken_mult(p public.world_plots) returns numeric language sql stable as $$
  select least(1 + coalesce((c ->> 'per_neighbour')::numeric, 0.75) * (
      select count(*) from public.world_plots q
       where q.gx between p.gx - r and p.gx + r and q.gy between p.gy - r and p.gy + r
         and q.owner_id is not null and q.owner_id <> p.owner_id),
    coalesce((c ->> 'max')::numeric, 20))
  from (select private.cfg('rarity_abilities') -> 'kraken' c, coalesce((private.cfg('rarity_abilities') -> 'kraken' ->> 'cells')::int, 21) r) x
$$;
create or replace function private.gemini_mult(p public.world_plots) returns numeric language sql stable as $$
  select case when (select count(*) from public.world_plots where owner_id = p.owner_id and rarity = 'gemini') >= 2
              then coalesce((private.cfg('rarity_abilities') -> 'gemini' ->> 'pair_mult')::numeric, 12) else 1 end
$$;
create or replace function private.plot_day_mult(p public.world_plots, p_day date) returns numeric language sql stable as $$
  select case p.rarity
    when 'chaos' then private.chaos_mult(p.gx, p.gy, p_day)
    when 'phoenix' then private.phoenix_mult(p.owner_id, p_day)
    when 'dragon' then private.dragon_mult(p.owner_id, p_day)
    when 'kraken' then private.kraken_mult(p)
    when 'gemini' then private.gemini_mult(p)
    when 'mirror' then private.mirror_mult(p)
    else 1 end
$$;
create or replace function private.day_rarities() returns text[] language sql immutable as $$
  select array['chaos', 'phoenix', 'dragon', 'kraken', 'gemini', 'mirror']
$$;
drop function if exists private.eclipse_mult(integer, integer, date);
drop function if exists private.vampire_mult(public.world_plots);

-- ---- Luck: rerolls you choose from ----------------------------------------------------------------------------------------
update public.game_config set value = value || '{"max": 100, "ink_daily_max": 1000000, "points_per_roll": 20, "max_rolls": 6,
  "inkborn": 12, "inkborn_bonded": 20, "egg": 8, "egg_rare": 18}'::jsonb where key = 'luck';

create table if not exists public.luck_choices (
  player_id uuid not null references public.players (id) on delete cascade,
  gx int not null, gy int not null,
  options jsonb not null,         -- ["rare", "mythic", …]: the first is the cell's own roll
  picked int,
  created_at timestamptz not null default now(),
  primary key (player_id, gx, gy)
);
alter table public.luck_choices enable row level security;
revoke all on public.luck_choices from anon, authenticated;

/** spend Luck on a claim: one extra roll per 20 Luck (up to 6 in all), ultras likelier; the best is kept until you choose */
create or replace function private.luck_roll(p_uid uuid, p_gx int, p_gy int, p_rarity text) returns text language plpgsql as $$
declare c jsonb := private.cfg('luck'); v_luck int; v_n int; v_used int; v_total int; v_opts jsonb := jsonb_build_array(p_rarity);
  v_best text := p_rarity; v_try text; r record; i int; v_x numeric; v_per int;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) or p_rarity like 'crown%' then return p_rarity; end if;
  select luck into v_luck from public.player_luck where player_id = p_uid for update;
  v_per := greatest(coalesce((c ->> 'points_per_roll')::int, 20), 1);
  v_n := least(floor(coalesce(v_luck, 0)::numeric / v_per)::int, coalesce((c ->> 'max_rolls')::int, 6) - 1);
  if v_n < 1 then return p_rarity; end if;
  v_used := v_n * v_per;
  update public.player_luck set luck = luck - v_used, lucky_rolls = lucky_rolls + 1, updated_at = now() where player_id = p_uid;
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  v_x := 1 + v_used::numeric / greatest(coalesce((c ->> 'points_per_ultra_x')::numeric, 10), 1);
  for i in 1 .. v_n loop
    v_try := private.rarity_pick(floor(random() * v_total)::int);
    for r in select id, ppm from public.plot_rarities where ppm > 0 order by ppm loop
      if random() * 1000000 < r.ppm * v_x then v_try := r.id; exit; end if;
    end loop;
    v_opts := v_opts || jsonb_build_array(v_try);
    if private.plot_rarity_rank(v_try) > private.plot_rarity_rank(v_best) then v_best := v_try; end if;
  end loop;
  insert into public.luck_choices (player_id, gx, gy, options) values (p_uid, p_gx, p_gy, v_opts)
  on conflict (player_id, gx, gy) do update set options = excluded.options, picked = null, created_at = now();
  return v_best;
end $$;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.take_plot(uuid,integer,integer,text,jsonb)'::regprocedure);
  n := replace(d, 'private.luck_apply(p_uid, ', 'private.luck_roll(p_uid, p_gx, p_gy, ');
  n := replace(n, $a$return jsonb_build_object('lucky', v_lucky is not null,$a$,
    $a$return jsonb_build_object('lucky', v_lucky is not null, 'choices', (select options from public.luck_choices where player_id = p_uid and gx = p_gx and gy = p_gy and picked is null and created_at > now() - interval '1 minute'),$a$);
  if position('luck_roll' in n) = 0 or position('''choices''' in n) = 0 then raise exception 'luck choices: take_plot anchors not found'; end if;
  execute n;
end $$;

/** keep the one you want out of the rolls Luck gave you */
create or replace function public.luck_pick(p_gx int, p_gy int, p_idx int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); l public.luck_choices; v_r text; v_n int;
begin
  select * into l from public.luck_choices where player_id = v_uid and gx = p_gx and gy = p_gy for update;
  if not found or l.picked is not null then raise exception 'nothing_to_pick' using errcode = 'P0001'; end if;
  v_n := jsonb_array_length(l.options);
  if p_idx is null or p_idx < 0 or p_idx >= v_n then raise exception 'invalid_choice' using errcode = 'P0001'; end if;
  v_r := l.options ->> p_idx;
  if not exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and owner_id = v_uid) then raise exception 'not_owned' using errcode = 'P0001'; end if;
  perform private.rent_settle(v_uid);
  update public.world_plots set rarity = v_r, updated_at = now() where gx = p_gx and gy = p_gy;
  update public.luck_choices set picked = p_idx where player_id = v_uid and gx = p_gx and gy = p_gy;
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  insert into public.feed_events (kind, player_id, data) values ('luck', v_uid, jsonb_build_object('sub', 'pick', 'rarity', v_r, 'of', v_n));
  return jsonb_build_object('rarity', v_r, 'usd_per_second', private.plot_rent_rate(v_r, 1), 'rent', private.rent_json(v_uid),
                            'achievements', private.evaluate_achievements(v_uid));
end $$;

-- ---- sacrifice anything ---------------------------------------------------------------------------------------------------
create or replace function private.luck_gain(p_uid uuid, p_pts int, p_what text, p_detail jsonb default '{}'::jsonb) returns void language plpgsql as $$
begin
  insert into public.player_luck (player_id) values (p_uid) on conflict (player_id) do nothing;
  update public.player_luck set luck = least(luck + p_pts, coalesce((private.cfg('luck') ->> 'max')::int, 100)), sacrificed = sacrificed + 1, updated_at = now()
   where player_id = p_uid;
  insert into public.feed_events (kind, player_id, data)
  values ('luck', p_uid, p_detail || jsonb_build_object('sub', 'sacrifice', 'what', p_what, 'gained', p_pts,
          'luck', (select luck from public.player_luck where player_id = p_uid)));
end $$;
create or replace function private.luck_room(p_uid uuid) returns void language plpgsql as $$
begin
  if coalesce((select luck from public.player_luck where player_id = p_uid), 0) >= coalesce((private.cfg('luck') ->> 'max')::int, 100) then
    raise exception 'luck_full' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.luck_sacrifice_inkborn(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.cfg('luck'); i public.inkborn; v_pts int;
begin
  perform private.rate_limit('luck_sacrifice', 600, 3600);
  perform private.luck_room(v_uid);
  select * into i from public.inkborn where id = p_id and owner_id = v_uid for update;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if (select count(*) from public.inkborn where owner_id = v_uid) <= 1 then raise exception 'last_inkborn' using errcode = 'P0001'; end if;
  v_pts := case when i.bond >= 50 then coalesce((c ->> 'inkborn_bonded')::int, 20) else coalesce((c ->> 'inkborn')::int, 12) end;
  delete from public.inkborn where id = p_id;
  perform private.luck_gain(v_uid, v_pts, 'inkborn', jsonb_build_object('name', i.name));
  return private.luck_json(v_uid) || jsonb_build_object('gained', v_pts);
end $$;

create or replace function public.luck_sacrifice_egg(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.cfg('luck'); e public.inkborn_eggs; v_pts int;
begin
  perform private.rate_limit('luck_sacrifice', 600, 3600);
  perform private.luck_room(v_uid);
  select * into e from public.inkborn_eggs where id = p_id and owner_id = v_uid and hatched_inkborn is null for update;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  v_pts := case when e.mutated or e.kind in ('glimmer', 'cosmic') then coalesce((c ->> 'egg_rare')::int, 18) else coalesce((c ->> 'egg')::int, 8) end;
  delete from public.inkborn_eggs where id = p_id;
  perform private.luck_gain(v_uid, v_pts, 'egg', jsonb_build_object('egg', e.kind));
  return private.luck_json(v_uid) || jsonb_build_object('gained', v_pts);
end $$;

-- plots and Ink: no daily limits any more (Luck still tops out at 100), and they show on the feed
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.luck_sacrifice_plot(integer,integer)'::regprocedure);
  n := replace(d, $a$  insert into public.player_luck (player_id) values (v_uid) on conflict (player_id) do nothing;
  update public.player_luck set luck = least(luck + v_pts, coalesce((c ->> 'max')::int, 100)), sacrificed = sacrificed + 1, updated_at = now() where player_id = v_uid;$a$,
    $a$  perform private.luck_gain(v_uid, v_pts, 'plot', jsonb_build_object('rarity', p.rarity, 'shiny', p.shiny));$a$);
  n := replace(n, $a$  perform private.rate_limit('luck_sacrifice', 120, 3600);$a$, $a$  perform private.rate_limit('luck_sacrifice', 600, 3600);
  perform private.luck_room(v_uid);$a$);
  if position('luck_gain' in n) = 0 or position('luck_room' in n) = 0 then raise exception 'luck: luck_sacrifice_plot anchors not found'; end if;
  execute n;
  d := pg_get_functiondef('public.luck_offer_ink(integer)'::regprocedure);
  n := replace(d, $a$  if l.luck + p_points > v_max then raise exception 'luck_full' using errcode = 'P0001'; end if;$a$,
    $a$  if l.luck >= v_max then raise exception 'luck_full' using errcode = 'P0001'; end if;
  p_points := least(p_points, v_max - l.luck);$a$);
  n := replace(n, $a$  return private.luck_json(v_uid) || jsonb_build_object('gained', p_points,$a$,
    $a$  insert into public.feed_events (kind, player_id, data) values ('luck', v_uid, jsonb_build_object('sub', 'sacrifice', 'what', 'ink', 'ink', v_cost, 'gained', p_points, 'luck', l.luck + p_points));
  return private.luck_json(v_uid) || jsonb_build_object('gained', p_points,$a$);
  if position('least(p_points' in n) = 0 or position('''ink'', v_cost' in n) = 0 then raise exception 'luck: luck_offer_ink anchors not found'; end if;
  execute n;
end $$;

-- the altar lists your Inkborn and unhatched eggs too
create or replace function public.luck_status() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.cfg('luck');
begin
  return private.luck_json(v_uid) || jsonb_build_object(
    'per_roll', coalesce((c ->> 'points_per_roll')::int, 20), 'max_rolls', coalesce((c ->> 'max_rolls')::int, 6),
    'plots', coalesce((
      select jsonb_agg(jsonb_build_object('gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'shiny', p.shiny, 'name', g.name,
               'luck', least(coalesce((c -> 'plot' ->> case when coalesce(r.ppm, 0) > 0 then 'ultra' else p.rarity end)::int, 1), 1000))
             order by r.sort, p.claimed_at)
      from public.world_plots p join public.plot_rarities r on r.id = p.rarity
      join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
      join public.canvas_groups g on g.id = m.group_id
      where p.owner_id = v_uid and g.kind = 'base' and g.plot_count = 1 and g.status = 'active' and not p.locked and p.rarity not like 'crown%'), '[]'::jsonb),
    'inkborn', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'genome', i.genome, 'bond', i.bond,
               'luck', case when i.bond >= 50 then coalesce((c ->> 'inkborn_bonded')::int, 20) else coalesce((c ->> 'inkborn')::int, 12) end) order by i.created_at)
             from public.inkborn i where i.owner_id = v_uid), '[]'::jsonb),
    'eggs', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'shell', e.shell, 'mutated', e.mutated,
               'luck', case when e.mutated or e.kind in ('glimmer', 'cosmic') then coalesce((c ->> 'egg_rare')::int, 18) else coalesce((c ->> 'egg')::int, 8) end) order by e.laid_at)
             from public.inkborn_eggs e where e.owner_id = v_uid and e.hatched_inkborn is null), '[]'::jsonb));
end $$;

-- ---- the live feed: more of what's happening -----------------------------------------------------------------------------
alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig', 'base', 'core', 'harvest', 'ipo', 'arcade',
                  'luck', 'crown', 'flight', 'estate'));

-- claims say if they're shiny; a Crown claimed is its own moment
create or replace function private.feed_claim_trg() returns trigger
language plpgsql as $$
declare v_rarity text; v_type text; v_shiny boolean; v_city int; k public.world_cities;
begin
  if new.method in ('starter', 'acquire', 'purchase') then
    select rarity, plot_type, shiny, city_id into v_rarity, v_type, v_shiny, v_city from public.world_plots where gx = new.gx and gy = new.gy;
    insert into public.feed_events (kind, player_id, data)
    values ('claim', new.player_id, jsonb_build_object('rarity', v_rarity, 'plot_type', v_type, 'starter', new.method = 'starter', 'shiny', coalesce(v_shiny, false)));
    if v_rarity like 'crown%' and v_city is not null then
      select * into k from public.world_cities where id = v_city;
      insert into public.feed_events (kind, player_id, data)
      values ('crown', new.player_id, jsonb_build_object('tier', v_rarity,
              'place', case v_rarity when 'crown' then k.name when 'crown_state' then k.state else k.country_name end, 'country', k.country));
    end if;
  end if;
  return null;
end $$;

-- flights: the Hot Zone by name; a pin is just "somewhere" (no locations on the feed)
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.travel_fly_to(double precision,double precision,text)'::regprocedure);
  n := replace(d, $a$  return public.travel_status();$a$, $a$  insert into public.feed_events (kind, player_id, data)
  values ('flight', v_uid, jsonb_build_object('to', case when p_name like 'Hot Zone%' then p_name end, 'hot', coalesce(p_name like 'Hot Zone%', false)));
  return public.travel_status();$a$);
  if n = d then raise exception 'feed: travel_fly_to anchor not found'; end if;
  execute n;
end $do$;

-- estates: the moment a checklist is done
create or replace function private.estate_feed() returns trigger language plpgsql as $$
begin
  if private.landlord_done(new.group_id, new.cycle) and not exists (
       select 1 from public.feed_events f where f.kind = 'estate' and f.data ->> 'group' = new.group_id::text and f.data ->> 'cycle' = new.cycle::text) then
    insert into public.feed_events (kind, player_id, data)
    select 'estate', g.owner_id, jsonb_build_object('group', g.id, 'cycle', new.cycle, 'houses', g.plot_count,
             'mult', coalesce((private.cfg('residential') ->> 'landlord_mult')::numeric, 50))
    from public.canvas_groups g where g.id = new.group_id;
  end if;
  return null;
end $$;
drop trigger if exists landlord_progress_feed on public.landlord_progress;
create trigger landlord_progress_feed after insert or update on public.landlord_progress for each row execute function private.estate_feed();

-- ---- admins edit every part of a rarity ------------------------------------------------------------------------------------
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.admin_update_rarity(text,jsonb)'::regprocedure);
  n := replace(d, $a$    glow = coalesce(p_patch ->> 'glow', glow)$a$, $a$    glow = coalesce(p_patch ->> 'glow', glow),
    ppm = coalesce((p_patch ->> 'ppm')::int, ppm),
    emoji = case when p_patch ? 'emoji' then nullif(p_patch ->> 'emoji', '') else emoji end,
    ability = case when p_patch ? 'ability' then nullif(p_patch ->> 'ability', '') else ability end$a$);
  n := replace(n, $a$  update public.plot_rarities set$a$, $a$  if (p_patch ? 'ppm' and (p_patch ->> 'ppm')::int not between 0 and 1000000) or (p_patch ? 'weight' and (p_patch ->> 'weight')::int not between 0 and 1000000) then
    raise exception 'invalid_odds' using errcode = 'P0001';
  end if;
  update public.plot_rarities set$a$);
  if position('ppm = coalesce' in n) = 0 or position('invalid_odds' in n) = 0 then raise exception 'admin: admin_update_rarity anchors not found'; end if;
  execute n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.luck_pick(integer, integer, integer)', 'public.luck_sacrifice_inkborn(uuid)', 'public.luck_sacrifice_egg(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.kraken_mult(public.world_plots)', 'private.gemini_mult(public.world_plots)', 'private.luck_roll(uuid, integer, integer, text)',
    'private.luck_gain(uuid, integer, text, jsonb)', 'private.luck_room(uuid)', 'private.estate_feed()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
