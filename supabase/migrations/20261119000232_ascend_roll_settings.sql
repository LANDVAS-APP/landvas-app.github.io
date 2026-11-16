-- Rolls, part 2: ⬆️ Ascend, and the owner's roll settings (admin.landvas.app → Rolls).
--
-- ⬆️ Ascend: don't like the rarity a plot rolled? Pay Ink to roll it again — but it can only go up. The rarity it has
-- is locked in as the floor: each try either climbs to a higher tier (the new floor) or stays where it is. Every try
-- on the same plot costs more than the last (it gets expensive fast), and every try makes the tiers above a little
-- likelier. It works on the everyday ladder (Common → Mythic by default), on plots you claimed in the last 24 hours
-- (the owner can change all of it in game_config 'ascend', or switch it off).

create table if not exists public.plot_ascents (
  gx int not null, gy int not null,
  owner_id uuid not null references public.players (id) on delete cascade,
  claimed_at timestamptz not null,
  tries int not null default 0,
  from_rarity text,
  ink bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (gx, gy));
create index if not exists plot_ascents_owner on public.plot_ascents (owner_id);
alter table public.plot_ascents enable row level security;
revoke all on public.plot_ascents from anon, authenticated;

create table if not exists private.ascend_log (
  id bigint generated always as identity primary key,
  player_id uuid references public.players (id) on delete cascade,
  gx int not null, gy int not null, from_rarity text not null, to_rarity text not null, cost bigint not null, try int not null,
  at timestamptz not null default now());
create index if not exists ascend_log_player on private.ascend_log (player_id);
create index if not exists ascend_log_at on private.ascend_log (at desc);

insert into public.game_config (key, value, description) values ('ascend', $cfg${
  "enabled": true,
  "base_ink": 100,
  "growth": 1.6,
  "tier_mult": 1.35,
  "pity": 0.12,
  "max_rarity": "mythic",
  "window_hours": 24,
  "max_tries": 30,
  "allow_ultras": false,
  "ultra_mult": 1
}$cfg$::jsonb, 'Ascend: pay Ink to reroll a plot''s rarity, only ever upward; each try costs more and nudges the odds up')
on conflict (key) do nothing;

create or replace function private.ascend_cfg() returns jsonb language sql stable as $$
  select coalesce(private.cfg('ascend'), '{}'::jsonb)
$$;

/** everything about Ascending this plot right now: can it, what it costs, the odds of each tier above */
create or replace function private.ascend_view(p_uid uuid, p_gx int, p_gy int) returns jsonb language plpgsql stable as $$
declare c jsonb := private.ascend_cfg(); p public.world_plots; a public.plot_ascents; v_tries int := 0; v_cap int; v_cur int; v_why text; v_cost bigint;
  v_up numeric := 0; v_stay numeric := 0; v_mult numeric; v_odds jsonb := '[]'::jsonb; r record; v_tier int; v_win numeric; v_ultra numeric := 0;
  v_max text := coalesce(nullif(c ->> 'max_rarity', ''), 'mythic');
begin
  select * into p from public.world_plots where gx = p_gx and gy = p_gy;
  if not found or p.owner_id is distinct from p_uid then return jsonb_build_object('ok', false, 'why', 'not_owned', 'gx', p_gx, 'gy', p_gy); end if;
  select * into a from public.plot_ascents where gx = p_gx and gy = p_gy;
  if a.gx is not null and a.owner_id = p_uid and a.claimed_at = p.claimed_at then v_tries := a.tries; end if;
  select sort into v_cap from public.plot_rarities where id = v_max and weight > 0;
  v_cap := coalesce(v_cap, (select max(sort) from public.plot_rarities where weight > 0));
  select sort into v_cur from public.plot_rarities where id = p.rarity and weight > 0;
  v_win := greatest(coalesce((c ->> 'window_hours')::numeric, 24), 0);
  v_why := case when not coalesce((c ->> 'enabled')::boolean, true) then 'disabled'
                when v_cur is null then 'not_on_ladder'
                when v_cur >= v_cap then 'top'
                when v_win > 0 and p.claimed_at < now() - make_interval(secs => v_win * 3600) then 'too_old'
                when v_tries >= greatest(coalesce((c ->> 'max_tries')::int, 30), 1) then 'max_tries'
                when p.locked or p.folded_at is not null then 'locked' end;
  -- every try so far makes the tiers above a little likelier
  v_mult := 1 + greatest(coalesce((c ->> 'pity')::numeric, 0.12), 0) * v_tries;
  for r in select id, sort, weight from public.plot_rarities where weight > 0 order by sort loop
    if r.sort <= coalesce(v_cur, 0) then v_stay := v_stay + r.weight; elsif r.sort <= v_cap then v_up := v_up + r.weight * v_mult; end if;
  end loop;
  if coalesce((c ->> 'allow_ultras')::boolean, false) then
    select coalesce(sum(ppm), 0) * greatest(coalesce((c ->> 'ultra_mult')::numeric, 1), 0) / 1000000.0 into v_ultra from public.plot_rarities where tier = 'ultra' and ppm > 0;
    v_ultra := least(v_ultra, 0.5);
  end if;
  if v_up + v_stay > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('rarity', id, 'pct', round(weight * v_mult / (v_up + v_stay) * (1 - v_ultra) * 100, 2)) order by sort), '[]'::jsonb) into v_odds
      from public.plot_rarities where weight > 0 and sort > coalesce(v_cur, 0) and sort <= v_cap;
  end if;
  select count(*) into v_tier from public.plot_rarities where weight > 0 and sort < coalesce(v_cur, 0);
  v_cost := ceil(greatest(coalesce((c ->> 'base_ink')::numeric, 100), 1)
                 * power(greatest(coalesce((c ->> 'growth')::numeric, 1.6), 1), v_tries)
                 * power(greatest(coalesce((c ->> 'tier_mult')::numeric, 1.35), 1), v_tier));
  return jsonb_build_object('ok', v_why is null, 'why', v_why, 'gx', p_gx, 'gy', p_gy, 'rarity', p.rarity, 'cost', least(v_cost, 1000000000), 'tries', v_tries,
    'max_tries', greatest(coalesce((c ->> 'max_tries')::int, 30), 1), 'chance_up', case when v_up + v_stay > 0 then round((v_up / (v_up + v_stay) * (1 - v_ultra) + v_ultra) * 100, 2) else 0 end,
    'odds', v_odds, 'ultra_pct', round(v_ultra * 100, 4), 'cap', v_max, 'window_hours', v_win,
    'ends_at', case when v_win > 0 then p.claimed_at + make_interval(secs => v_win * 3600) end,
    'spent', case when a.gx is not null and a.owner_id = p_uid and a.claimed_at = p.claimed_at then a.ink else 0 end,
    'from', case when a.gx is not null and a.owner_id = p_uid and a.claimed_at = p.claimed_at then a.from_rarity end);
end $$;

create or replace function public.ascend_quote(p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return private.ascend_view(private.require_active_player(), p_gx, p_gy);
end $$;

/** one try: pay, then climb (or stay) */
create or replace function public.ascend_roll(p_gx int, p_gy int, p_idempotency_key text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.ascend_cfg(); v_prev jsonb; v jsonb; p public.world_plots; v_cur int; v_cap int;
  v_mult numeric; v_tot numeric := 0; v_x numeric; v_acc numeric := 0; r record; v_to text; v_up boolean := false; v_cost bigint; v_tries int; v_res jsonb;
  v_max text := coalesce(nullif(c ->> 'max_rarity', ''), 'mythic'); v_ultra numeric := 0;
begin
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'ascend_roll');
  if v_prev is not null then return v_prev; end if;
  perform private.rate_limit('ascend', 600, 3600);
  select * into p from public.world_plots where gx = p_gx and gy = p_gy for update;
  v := private.ascend_view(v_uid, p_gx, p_gy);
  if not (v ->> 'ok')::boolean then raise exception '%', 'ascend_' || (v ->> 'why') using errcode = 'P0001'; end if;
  v_cost := (v ->> 'cost')::bigint; v_tries := (v ->> 'tries')::int;
  perform private.charge(v_uid, jsonb_build_object('ink', v_cost), 'ascend', 'plot', private.cell_key(p_gx, p_gy),
    'ascend:' || p_gx || ':' || p_gy || ':' || to_char(p.claimed_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS') || ':' || v_tries);
  -- the roll
  select sort into v_cur from public.plot_rarities where id = p.rarity;
  select sort into v_cap from public.plot_rarities where id = v_max and weight > 0;
  v_cap := coalesce(v_cap, (select max(sort) from public.plot_rarities where weight > 0));
  v_mult := 1 + greatest(coalesce((c ->> 'pity')::numeric, 0.12), 0) * v_tries;
  if coalesce((c ->> 'allow_ultras')::boolean, false) then
    v_ultra := (v ->> 'ultra_pct')::numeric / 100;
    if random() < v_ultra then
      select id into v_to from public.plot_rarities where tier = 'ultra' and ppm > 0 order by -ln(1 - random()) / ppm limit 1;
    end if;
  end if;
  if v_to is null then
    for r in select id, sort, weight from public.plot_rarities where weight > 0 and sort <= v_cap order by sort loop
      v_tot := v_tot + case when r.sort > v_cur then r.weight * v_mult else r.weight end;
    end loop;
    v_x := random() * v_tot;
    for r in select id, sort, weight from public.plot_rarities where weight > 0 and sort <= v_cap order by sort loop
      v_acc := v_acc + case when r.sort > v_cur then r.weight * v_mult else r.weight end;
      if v_x < v_acc then v_to := case when r.sort > v_cur then r.id end; exit; end if;
    end loop;
  end if;
  v_up := v_to is not null;
  insert into public.plot_ascents (gx, gy, owner_id, claimed_at, tries, from_rarity, ink) values (p_gx, p_gy, v_uid, p.claimed_at, 1, p.rarity, v_cost)
  on conflict (gx, gy) do update set
    tries = case when plot_ascents.owner_id = excluded.owner_id and plot_ascents.claimed_at = excluded.claimed_at then plot_ascents.tries + 1 else 1 end,
    from_rarity = case when plot_ascents.owner_id = excluded.owner_id and plot_ascents.claimed_at = excluded.claimed_at then plot_ascents.from_rarity else excluded.from_rarity end,
    ink = case when plot_ascents.owner_id = excluded.owner_id and plot_ascents.claimed_at = excluded.claimed_at then plot_ascents.ink + excluded.ink else excluded.ink end,
    owner_id = excluded.owner_id, claimed_at = excluded.claimed_at, updated_at = now();
  insert into private.ascend_log (player_id, gx, gy, from_rarity, to_rarity, cost, try) values (v_uid, p_gx, p_gy, p.rarity, coalesce(v_to, p.rarity), v_cost, v_tries + 1);
  if v_up then
    perform private.rent_settle(v_uid);
    update public.world_plots set rarity = v_to, updated_at = now() where gx = p_gx and gy = p_gy;
    insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
    if private.plot_rarity_rank(v_to) >= private.plot_rarity_rank('legendary') then
      insert into public.feed_events (kind, player_id, data) values ('luck', v_uid, jsonb_build_object('sub', 'ascend', 'rarity', v_to, 'from', p.rarity, 'tries', v_tries + 1));
    end if;
  end if;
  v_res := jsonb_build_object('up', v_up, 'from', p.rarity, 'to', coalesce(v_to, p.rarity), 'cost', v_cost, 'try', v_tries + 1,
    'quote', private.ascend_view(v_uid, p_gx, p_gy), 'balances', private.balances(v_uid), 'rent', private.rent_json(v_uid),
    'usd_per_second', (select private.plot_rate(w, rr.usd_per_second) from public.world_plots w join public.plot_rarities rr on rr.id = w.rarity where w.gx = p_gx and w.gy = p_gy));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

-- ---- the owner's roll settings --------------------------------------------------------------------------------------
create or replace function public.admin_roll_settings() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g jsonb := private.godroll_cfg();
begin
  perform private.require_admin(array['economy']);
  return jsonb_build_object(
    'godrolls', g, 'ascend', private.ascend_cfg(),
    'pool', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'w', p.w) order by p.w) from private.godroll_pool() p), '[]'::jsonb),
    'rarities', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'tier', tier, 'sort', sort, 'weight', weight, 'ppm', ppm, 'ppb', ppb) order by sort) from public.plot_rarities), '[]'::jsonb),
    'godroll_stats', (select jsonb_build_object('total', count(*), 'last_30d', count(*) filter (where at > now() - interval '30 days'),
                       'echo', count(*) filter (where kind = 'echo'), 'pantheon', count(*) filter (where kind = 'pantheon'),
                       'by_luck', count(*) filter (where how = 'luck'), 'by_ticket', count(*) filter (where how = 'ticket'), 'by_staff', count(*) filter (where how = 'staff'))
                      from private.godroll_log),
    'godroll_recent', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'player', private.profile_json(l.player_id), 'kind', l.kind, 'rolls', l.rolls, 'rarities', l.rarities,
                       'types', l.types, 'how', l.how, 'kept', l.kept, 'at', l.at, 'gx', l.gx, 'gy', l.gy) order by l.at desc)
                      from (select * from private.godroll_log order by at desc limit 40) l), '[]'::jsonb),
    'claims_7d', (select count(*) from public.plot_ownership where method in ('acquire', 'starter') and acquired_at > now() - interval '7 days'),
    'ascend_stats', (select jsonb_build_object('tries_7d', count(*), 'ink_7d', coalesce(sum(cost), 0), 'ups_7d', count(*) filter (where to_rarity <> from_rarity),
                       'players_7d', count(distinct player_id),
                       'reached', coalesce((select jsonb_object_agg(to_rarity, n) from (select to_rarity, count(*) n from private.ascend_log
                                   where at > now() - interval '7 days' and to_rarity <> from_rarity group by to_rarity) z), '{}'::jsonb))
                      from private.ascend_log where at > now() - interval '7 days'));
end $$;

/** change the Godroll ('godrolls') or Ascend ('ascend') settings: the keys given replace those keys */
create or replace function public.admin_set_roll_settings(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v jsonb; k text; x jsonb;
  nums text[] := case p_key when 'godrolls' then array['echo_one_in', 'pantheon_one_in', 'luck_boost', 'hot_zone_mult', 'rolls_min', 'rolls_max', 'shiny_pct']
                            when 'ascend' then array['base_ink', 'growth', 'tier_mult', 'pity', 'window_hours', 'max_tries', 'ultra_mult'] end;
  bools text[] := case p_key when 'godrolls' then array['enabled', 'needs_luck', 'weighted', 'announce'] when 'ascend' then array['enabled', 'allow_ultras'] end;
begin
  if p_key not in ('godrolls', 'ascend') then raise exception 'invalid_key' using errcode = 'P0001'; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then raise exception 'invalid_value' using errcode = 'P0001'; end if;
  for k, x in select * from jsonb_each(p_value) loop
    if k = any (nums) then
      if jsonb_typeof(x) <> 'number' or (x::text)::numeric < 0 then raise exception 'invalid_value' using errcode = 'P0001', detail = k; end if;
    elsif k = any (bools) then
      if jsonb_typeof(x) <> 'boolean' then raise exception 'invalid_value' using errcode = 'P0001', detail = k; end if;
    elsif p_key = 'godrolls' and k = 'pool' then
      if x #>> '{}' not in ('ultras', 'ultras_primordials') then raise exception 'invalid_value' using errcode = 'P0001', detail = k; end if;
    elsif p_key = 'godrolls' and k in ('include', 'exclude') then
      if jsonb_typeof(x) <> 'array' or exists (select 1 from jsonb_array_elements_text(x) e where not exists (select 1 from public.plot_rarities r where r.id = e)) then
        raise exception 'invalid_value' using errcode = 'P0001', detail = k;
      end if;
    elsif p_key = 'ascend' and k = 'max_rarity' then
      if not exists (select 1 from public.plot_rarities where id = x #>> '{}' and weight > 0) then raise exception 'invalid_value' using errcode = 'P0001', detail = k; end if;
    else
      raise exception 'invalid_value' using errcode = 'P0001', detail = k;
    end if;
  end loop;
  if p_key = 'godrolls' then
    if coalesce((p_value ->> 'rolls_min')::numeric, 2) not between 2 and 7 or coalesce((p_value ->> 'rolls_max')::numeric, 6) not between 2 and 7
       or coalesce((p_value ->> 'echo_one_in')::numeric, 1) < 1 or coalesce((p_value ->> 'pantheon_one_in')::numeric, 1) < 1 then
      raise exception 'invalid_value' using errcode = 'P0001', detail = 'range';
    end if;
  else
    if coalesce((p_value ->> 'growth')::numeric, 1) < 1 or coalesce((p_value ->> 'tier_mult')::numeric, 1) < 1 or coalesce((p_value ->> 'max_tries')::numeric, 1) < 1 then
      raise exception 'invalid_value' using errcode = 'P0001', detail = 'range';
    end if;
  end if;
  select value into v from public.game_config where key = p_key;
  update public.game_config set value = coalesce(v, '{}'::jsonb) || p_value, updated_at = now(), updated_by = v_uid where key = p_key;
  perform private.audit('rolls.settings', 'config', p_key, jsonb_build_object('before', v, 'set', p_value));
  return public.admin_roll_settings();
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.ascend_quote(integer, integer)', 'public.ascend_roll(integer, integer, text)', 'public.admin_roll_settings()', 'public.admin_set_roll_settings(text, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.ascend_cfg()', 'private.ascend_view(uuid, integer, integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
