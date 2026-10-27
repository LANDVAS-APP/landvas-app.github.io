-- LANDVAS core functions: helpers, accounts, map queries, plot ownership, economy
-- All client-callable functions are SECURITY DEFINER, validate the caller with
-- auth.uid(), and are the ONLY write path for game state (tables are read-only
-- to API roles; see the security migration).

-- ===== Generic helpers ======================================================

create or replace function private.cfg(p_key text) returns jsonb
language sql stable as $$ select value from public.game_config where key = p_key $$;

create or replace function private.flag(p_key text) returns boolean
language sql stable as $$ select coalesce((select enabled from public.feature_flags where key = p_key), false) $$;

create or replace function private.uid() returns uuid
language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  return v;
end $$;

create or replace function private.require_active_player() returns uuid
language plpgsql as $$
declare v_uid uuid := private.uid(); v_status text; v_until timestamptz;
begin
  select status, suspended_until into v_status, v_until from public.players where id = v_uid;
  if not found then raise exception 'onboarding_required' using errcode = 'P0001'; end if;
  if v_status = 'suspended' and v_until is not null and v_until <= now() then
    update public.players set status = 'active', suspended_until = null, suspension_reason = null where id = v_uid;
  elsif v_status <> 'active' then
    raise exception 'account_restricted' using errcode = 'P0001', detail = v_status;
  end if;
  update public.players set last_active_at = now() where id = v_uid and last_active_at < now() - interval '5 minutes';
  return v_uid;
end $$;

create or replace function private.has_role(p_uid uuid, p_roles text[]) returns boolean
language sql stable as $$
  select p_uid is not null and exists (
    select 1 from public.admin_roles
    where player_id = p_uid and (role = any(coalesce(p_roles, '{}')) or role in ('owner', 'admin')))
$$;

create or replace function private.require_admin(p_roles text[] default '{}') returns uuid
language plpgsql as $$
declare v_uid uuid := private.uid();
begin
  if not private.has_role(v_uid, p_roles) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return v_uid;
end $$;

create or replace function private.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb)
returns void language sql as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb))
$$;

-- Fixed-window rate limiter. Limits can be overridden in game_config.rate_limits.
create or replace function private.rate_limit(p_action text, p_max int, p_window_seconds int) returns void
language plpgsql as $$
declare
  v_uid uuid := auth.uid();
  v_override jsonb := private.cfg('rate_limits') -> p_action;
  v_max int := coalesce((v_override ->> 0)::int, p_max);
  v_window int := coalesce((v_override ->> 1)::int, p_window_seconds);
  v_start timestamptz;
  v_count int;
begin
  if v_uid is null then return; end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / v_window) * v_window);
  insert into private.rate_limits (player_id, action, window_start, count)
  values (v_uid, p_action, v_start, 1)
  on conflict (player_id, action, window_start) do update set count = private.rate_limits.count + 1
  returning count into v_count;
  if v_count > v_max then
    raise exception 'rate_limited' using errcode = 'P0001', detail = p_action;
  end if;
end $$;

-- Idempotency: the first call with a key does the work; replays return the
-- stored result. Concurrent duplicates block on the primary key, then replay.
create or replace function private.idem_begin(p_uid uuid, p_key text, p_op text) returns jsonb
language plpgsql as $$
declare v_res jsonb; v_op text;
begin
  if p_key is null then return null; end if;
  if char_length(p_key) not between 8 and 80 then
    raise exception 'invalid_idempotency_key' using errcode = 'P0001';
  end if;
  insert into private.idempotent_ops (player_id, key, op) values (p_uid, p_key, p_op) on conflict do nothing;
  if found then return null; end if;
  select op, result into v_op, v_res from private.idempotent_ops where player_id = p_uid and key = p_key;
  if v_op <> p_op then raise exception 'idempotency_key_reused' using errcode = 'P0001'; end if;
  if v_res is null then raise exception 'operation_in_progress' using errcode = 'P0001'; end if;
  return v_res || jsonb_build_object('replayed', true);
end $$;

create or replace function private.idem_finish(p_uid uuid, p_key text, p_result jsonb) returns jsonb
language plpgsql as $$
begin
  if p_key is not null then
    update private.idempotent_ops set result = p_result where player_id = p_uid and key = p_key;
  end if;
  return p_result;
end $$;

-- ===== Resource ledger ======================================================

create or replace function private.ledger_apply(
  p_player uuid, p_resource text, p_delta bigint, p_reason text,
  p_ref_type text default null, p_ref_id text default null, p_idem text default null, p_actor uuid default null
) returns bigint
language plpgsql as $$
declare v_bal bigint;
begin
  if p_delta is null or p_delta = 0 then
    select amount into v_bal from public.resource_balances where player_id = p_player and resource = p_resource;
    return coalesce(v_bal, 0);
  end if;
  insert into public.resource_balances (player_id, resource, amount) values (p_player, p_resource, 0)
  on conflict do nothing;
  update public.resource_balances
     set amount = amount + p_delta, updated_at = now()
   where player_id = p_player and resource = p_resource and amount + p_delta >= 0
  returning amount into v_bal;
  if not found then
    raise exception 'insufficient_funds' using errcode = 'P0001', detail = p_resource;
  end if;
  insert into public.resource_ledger (player_id, resource, delta, balance_after, reason, ref_type, ref_id, idempotency_key, actor_id)
  values (p_player, p_resource, p_delta, v_bal, p_reason, p_ref_type, p_ref_id, p_idem, p_actor);
  return v_bal;
end $$;

-- Apply a cost object like {"ink": 120, "pigments": 5} as debits.
create or replace function private.charge(p_player uuid, p_cost jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_cost, '{}'::jsonb)) loop
    if r.amount > 0 then
      perform private.ledger_apply(p_player, r.key, -r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
    end if;
  end loop;
end $$;

-- Ink is the land currency and is ONLY earned by winning plot minigames, so a
-- grant of Ink for any other reason is refused (admin corrections use
-- ledger_apply directly and are audited).
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason <> 'minigame' then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
    end if;
  end loop;
end $$;

create or replace function private.balances(p_player uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'ink', coalesce(max(amount) filter (where resource = 'ink'), 0),
    'pigments', coalesce(max(amount) filter (where resource = 'pigments'), 0),
    'brush_points', coalesce(max(amount) filter (where resource = 'brush_points'), 0),
    'gallery_tokens', coalesce(max(amount) filter (where resource = 'gallery_tokens'), 0))
  from public.resource_balances where player_id = p_player
$$;

-- Artist level from lifetime Brush Points: level n needs 50 * (n-1)^2 BP.
create or replace function private.artist_level(p_bp bigint) returns int
language sql immutable as $$ select floor(sqrt(greatest(coalesce(p_bp, 0), 0) / 50.0))::int + 1 $$;

-- ===== Grid helpers (mirrors src/shared/grid.ts exactly) =====================

-- Park–Miller style integer hash; all intermediates stay below 2^53 so the
-- TypeScript implementation produces identical values.
create or replace function private.mix(a bigint, b bigint) returns bigint
language sql immutable parallel safe as $$
  select ((((((a * 92821 + b * 68917 + 12345) % 2147483647) * 48271) % 2147483647) * 48271) % 2147483647)
$$;

create or replace function private.plot_type_for(p_gx int, p_gy int) returns text
language plpgsql stable as $$
declare v_total int; v_roll bigint; v_acc int := 0; r record; v_ids text[];
begin
  select coalesce(sum(weight), 0), array_agg(id order by sort, id) into v_total, v_ids
  from public.plot_types where weight > 0;
  if v_total = 0 then return 'graphite'; end if;
  if private.mix(p_gx, p_gy) % 100 < 22 then
    return v_ids[(private.mix(p_gx, p_gy + 7) % cardinality(v_ids))::int + 1];
  end if;
  v_roll := private.mix(p_gx >> 3, p_gy >> 3) % v_total;
  for r in select id, weight from public.plot_types where weight > 0 order by sort, id loop
    v_acc := v_acc + r.weight;
    if v_roll < v_acc then return r.id; end if;
  end loop;
  return v_ids[1];
end $$;

-- Rarity is per cell (salt-and-pepper, not regional) so every neighbourhood has
-- a few rare plots worth walking to. Mirrors rarityFor() in src/shared/rarity.ts.
create or replace function private.plot_rarity_for(p_gx int, p_gy int) returns text
language plpgsql stable as $$
declare v_total int; v_roll bigint; v_acc int := 0; r record;
begin
  select coalesce(sum(weight), 0) into v_total from public.plot_rarities where weight > 0;
  if v_total = 0 then return 'common'; end if;
  v_roll := private.mix(p_gx + 40503, p_gy * 3 + 977) % v_total;
  for r in select id, weight from public.plot_rarities where weight > 0 order by sort, id loop
    v_acc := v_acc + r.weight;
    if v_roll < v_acc then return r.id; end if;
  end loop;
  return 'common';
end $$;

create or replace function private.lng_of(p_ugx double precision) returns double precision
language sql immutable as $$
  select (((p_ugx / 65536.0 * 360.0 - 180.0) + 540.0)::numeric % 360.0 - 180.0)::double precision
$$;

create or replace function private.lat_of(p_gy double precision) returns double precision
language sql immutable as $$ select degrees(atan(sinh(pi() * (1 - 2 * p_gy / 65536.0)))) $$;

create or replace function private.cells_adjacent(a_gx int, a_gy int, b_gx int, b_gy int) returns boolean
language sql immutable parallel safe as $$
  select (a_gy = b_gy and (abs(a_gx - b_gx) = 1 or abs(a_gx - b_gx) = 65535))
      or (a_gx = b_gx and abs(a_gy - b_gy) = 1)
$$;

create or replace function private.neighbors(p_gx int, p_gy int)
returns table (gx int, gy int, dir text)
language sql immutable as $$
  select (p_gx + 1) % 65536, p_gy, 'e'
  union all select (p_gx + 65535) % 65536, p_gy, 'w'
  union all select p_gx, p_gy - 1, 'n' where p_gy > 0
  union all select p_gx, p_gy + 1, 's' where p_gy < 65535
$$;

-- cells: jsonb array of [gx, gy]
create or replace function private.cells_connected(p_cells jsonb) returns boolean
language plpgsql immutable as $$
declare v_total int; v_reached int;
begin
  if p_cells is null or jsonb_array_length(p_cells) = 0 then return false; end if;
  with recursive cells as (
    select distinct (c ->> 0)::int as gx, (c ->> 1)::int as gy from jsonb_array_elements(p_cells) c
  ), walk(gx, gy) as (
    (select gx, gy from cells order by gy, gx limit 1)
    union
    select c.gx, c.gy from walk w join cells c on private.cells_adjacent(w.gx, w.gy, c.gx, c.gy)
  )
  select (select count(*) from cells), (select count(*) from walk) into v_total, v_reached;
  return v_total = v_reached;
end $$;

-- Unwrap a connected cell set that may straddle the antimeridian so that it
-- has a contiguous bbox. Returns {cells:[[ugx,gy]..], min_gx, max_gx, min_gy, max_gy}.
create or replace function private.cells_unwrap(p_cells jsonb) returns jsonb
language plpgsql immutable as $$
declare v_min int; v_max int; v_wrap boolean;
begin
  select min((c ->> 0)::int), max((c ->> 0)::int) into v_min, v_max from jsonb_array_elements(p_cells) c;
  v_wrap := (v_max - v_min) > 32768;
  return (
    select jsonb_build_object(
      'cells', jsonb_agg(jsonb_build_array(u.ugx, u.gy) order by u.gy, u.ugx),
      'min_gx', min(u.ugx), 'max_gx', max(u.ugx), 'min_gy', min(u.gy), 'max_gy', max(u.gy),
      'wrapped', v_wrap)
    from (
      select case when v_wrap and (c ->> 0)::int > 32767 then (c ->> 0)::int - 65536 else (c ->> 0)::int end as ugx,
             (c ->> 1)::int as gy
      from jsonb_array_elements(p_cells) c
    ) u
  );
end $$;

create or replace function private.cell_key(p_gx int, p_gy int) returns text
language sql immutable as $$ select p_gx::text || '_' || p_gy::text $$;

-- ===== Daily reset boundary ==================================================
-- Boost allowances and rewarded minigame wins reset once a day at
-- rent.boost.reset_hour_utc (default 09:00 UTC = 4 AM US Eastern standard time).

create or replace function private.day_start(p_ts timestamptz) returns timestamptz
language sql stable as $$
  select (date_trunc('day', (p_ts at time zone 'UTC') - make_interval(hours => c.h)) + make_interval(hours => c.h)) at time zone 'UTC'
  from (select coalesce((private.cfg('rent') -> 'boost' ->> 'reset_hour_utc')::int, 9) as h) c
$$;

-- ===== USD rent =============================================================

-- Rent of one plot: its rarity's rate plus rent.level_bonus (1%) per level above 1.
create or replace function private.plot_rent_rate(p_rarity text, p_level int) returns numeric
language sql stable as $$
  select r.usd_per_second
         * (1 + coalesce((private.cfg('rent') ->> 'level_bonus')::numeric, 0.01) * (greatest(coalesce(p_level, 1), 1) - 1))
  from public.plot_rarities r where r.id = p_rarity
$$;

-- Total base (unboosted) rent of everything a player owns, USD per second.
create or replace function private.rent_rate(p_uid uuid) returns numeric
language sql stable as $$
  with c as (select coalesce((private.cfg('rent') ->> 'level_bonus')::numeric, 0.01) as lb)
  select coalesce(sum(r.usd_per_second * (1 + c.lb * (p.level - 1))), 0)
  from public.world_plots p
  join public.plot_rarities r on r.id = p.rarity
  cross join c
  where p.owner_id = p_uid
$$;

-- Accrual over [settled_at, now], capped at rent.max_offline_days, with the
-- boost multiplier applied to the part of the window covered by boost_until.
-- Returns {seconds, boosted_seconds, amount, rate}. Pure read.
create or replace function private.rent_accrual(p_settled_at timestamptz, p_boost_until timestamptz, p_rate numeric)
returns jsonb language sql stable as $$
  with c as (
    select coalesce((private.cfg('rent') -> 'boost' ->> 'multiplier')::numeric, 20) as mult,
           coalesce((private.cfg('rent') ->> 'max_offline_days')::numeric, 30) * 86400 as cap
  ), w as (
    select least(greatest(extract(epoch from (now() - p_settled_at)), 0), c.cap) as secs, c.mult from c
  ), b as (
    select w.secs, w.mult,
           least(greatest(extract(epoch from (coalesce(p_boost_until, p_settled_at) - p_settled_at)), 0), w.secs) as boosted
    from w
  )
  select jsonb_build_object('seconds', b.secs, 'boosted_seconds', b.boosted, 'rate', p_rate,
                            'amount', p_rate * ((b.secs - b.boosted) + b.mult * b.boosted))
  from b
$$;

-- Bank accrued rent into balance_usd. Must run BEFORE anything that changes the
-- rent rate (ownership, level) or the boost window, so each second is paid at
-- the rate and multiplier that were in force during it.
create or replace function private.rent_settle(p_uid uuid) returns numeric
language plpgsql as $$
declare a public.rent_accounts%rowtype; v_acc jsonb; v_amount numeric; v_rate numeric; v_bal numeric;
begin
  insert into public.rent_accounts (player_id, settled_at) values (p_uid, now()) on conflict do nothing;
  select * into a from public.rent_accounts where player_id = p_uid for update;
  if a.settled_at >= now() then return 0; end if;
  v_rate := private.rent_rate(p_uid);
  v_acc := private.rent_accrual(a.settled_at, a.boost_until, v_rate);
  v_amount := round((v_acc ->> 'amount')::numeric, 15);
  update public.rent_accounts
     set balance_usd = balance_usd + v_amount, lifetime_usd = lifetime_usd + v_amount,
         settled_at = now(), updated_at = now()
   where player_id = p_uid
  returning balance_usd into v_bal;
  if v_amount > 0 then
    insert into public.rent_ledger (player_id, kind, amount_usd, balance_after, seconds, boosted_seconds, rate_usd_per_second)
    values (p_uid, 'rent', v_amount, v_bal, round((v_acc ->> 'seconds')::numeric, 3),
            round((v_acc ->> 'boosted_seconds')::numeric, 3), v_rate);
  end if;
  return v_amount;
end $$;

-- Everything a client needs to render a live, per-second rent counter:
--   live(t) = balance_usd + rate * ((t - settled_at) - boosted(t)) + multiplier * rate * boosted(t)
--   boosted(t) = clamp(boost_until - settled_at, 0, t - settled_at)
create or replace function private.rent_json(p_uid uuid) returns jsonb
language plpgsql stable as $$
declare
  a public.rent_accounts%rowtype; v_cfg jsonb := private.cfg('rent'); v_b jsonb := v_cfg -> 'boost';
  v_rate numeric; v_acc jsonb; v_live numeric; v_used int; v_day_start timestamptz := private.day_start(now());
  v_free int := coalesce((v_b ->> 'free_per_day')::int, 6); v_mult numeric := coalesce((v_b ->> 'multiplier')::numeric, 20);
begin
  select * into a from public.rent_accounts where player_id = p_uid;
  if not found then
    a.balance_usd := 0; a.held_usd := 0; a.lifetime_usd := 0; a.paid_usd := 0; a.settled_at := now();
    a.boost_until := null; a.boost_day := null; a.boosts_used := 0;
  end if;
  v_rate := private.rent_rate(p_uid);
  v_acc := private.rent_accrual(a.settled_at, a.boost_until, v_rate);
  v_live := a.balance_usd + (v_acc ->> 'amount')::numeric;
  v_used := case when a.boost_day = (v_day_start at time zone 'UTC')::date then a.boosts_used else 0 end;
  return jsonb_build_object(
    'enabled', coalesce((v_cfg ->> 'enabled')::boolean, true),
    'currency', coalesce(v_cfg ->> 'currency', 'USD'),
    'balance_usd', a.balance_usd,
    'settled_at', a.settled_at,
    'live_usd', round(v_live, 15),
    'held_usd', a.held_usd,
    'paid_usd', a.paid_usd,
    'lifetime_usd', round(a.lifetime_usd + (v_acc ->> 'amount')::numeric, 15),
    'rate_usd_per_second', v_rate,
    'max_offline_days', coalesce((v_cfg ->> 'max_offline_days')::int, 30),
    'boost', jsonb_build_object(
      'multiplier', v_mult,
      'until', a.boost_until,
      'active', coalesce(a.boost_until > now(), false),
      'remaining_seconds', greatest(coalesce(extract(epoch from (a.boost_until - now())), 0), 0)::int,
      'minutes_per_boost', coalesce((v_b ->> 'minutes_per_boost')::int, 30),
      'max_stack_hours', coalesce((v_b ->> 'max_stack_hours')::numeric, 8),
      'free_per_day', v_free,
      'used_today', v_used,
      'left_today', greatest(v_free - v_used, 0),
      'resets_at', v_day_start + interval '1 day'),
    'by_rarity', (select coalesce(jsonb_object_agg(rarity, n), '{}'::jsonb)
                  from (select rarity, count(*) as n from public.world_plots where owner_id = p_uid group by rarity) s),
    'server_time', now());
end $$;

-- ===== Explorer (location) ==================================================

create or replace function private.haversine_m(lng1 float8, lat1 float8, lng2 float8, lat2 float8) returns float8
language sql immutable parallel safe as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;

create or replace function private.lng_to_gx(p_lng float8) returns int
language sql immutable parallel safe as $$
  select least(65535, greatest(0, floor((p_lng + 180) / 360 * 65536)))::int
$$;

create or replace function private.lat_to_gy(p_lat float8) returns int
language sql immutable parallel safe as $$
  select least(65535, greatest(0, floor((1 - ln(tan(radians(p_lat)) + 1 / cos(radians(p_lat))) / pi()) / 2 * 65536)))::int
$$;

-- Chebyshev distance in plots, wrapping at the antimeridian.
create or replace function private.cell_distance(a_gx int, a_gy int, b_gx int, b_gy int) returns int
language sql immutable parallel safe as $$
  select greatest(least(abs(a_gx - b_gx), 65536 - abs(a_gx - b_gx)), abs(a_gy - b_gy))
$$;

-- Where the explorer is right now: its fix, or how far it has got on a manual
-- trip (constant speed along the straight Web Mercator line from fix to dest).
create or replace function private.explorer_now(p_uid uuid)
returns table (lng float8, lat float8, gx int, gy int, traveling boolean, arrives_at timestamptz, mode text)
language plpgsql stable as $$
declare
  e public.explorers%rowtype; v_dist float8; v_f float8 := 1;
  v_x0 float8; v_y0 float8; v_x1 float8; v_y1 float8; v_x float8; v_y float8; v_lng float8; v_lat float8; v_arr timestamptz;
begin
  select * into e from public.explorers where player_id = p_uid;
  if not found then return; end if;
  if e.dest_lng is null then
    v_lng := e.lng; v_lat := e.lat;
  else
    v_dist := private.haversine_m(e.lng, e.lat, e.dest_lng, e.dest_lat);
    v_arr := e.fixed_at + make_interval(secs => v_dist / e.speed_mps);
    if v_dist > 0 then
      v_f := least(1, greatest(extract(epoch from (now() - e.fixed_at)), 0) * e.speed_mps / v_dist);
    end if;
    v_x0 := (e.lng + 180) / 360; v_x1 := (e.dest_lng + 180) / 360;
    if v_x1 - v_x0 > 0.5 then v_x1 := v_x1 - 1; elsif v_x0 - v_x1 > 0.5 then v_x1 := v_x1 + 1; end if;
    v_y0 := (1 - ln(tan(radians(e.lat)) + 1 / cos(radians(e.lat))) / pi()) / 2;
    v_y1 := (1 - ln(tan(radians(e.dest_lat)) + 1 / cos(radians(e.dest_lat))) / pi()) / 2;
    v_x := v_x0 + (v_x1 - v_x0) * v_f;
    v_y := v_y0 + (v_y1 - v_y0) * v_f;
    v_x := v_x - floor(v_x);
    v_lng := v_x * 360 - 180;
    v_lat := degrees(atan(sinh(pi() * (1 - 2 * v_y))));
  end if;
  return query select v_lng, v_lat, private.lng_to_gx(v_lng), private.lat_to_gy(v_lat),
                      e.dest_lng is not null and v_f < 1, v_arr, e.mode;
end $$;

create or replace function private.explorer_json(p_uid uuid) returns jsonb
language plpgsql stable as $$
declare e public.explorers%rowtype; c record; v_cfg jsonb := private.cfg('explorer');
begin
  select * into e from public.explorers where player_id = p_uid;
  if not found then return null; end if;
  select * into c from private.explorer_now(p_uid);
  return jsonb_build_object(
    'mode', e.mode, 'lng', c.lng, 'lat', c.lat, 'gx', c.gx, 'gy', c.gy,
    'origin', jsonb_build_object('lng', e.lng, 'lat', e.lat),
    'fixed_at', e.fixed_at, 'accuracy_m', e.accuracy_m,
    'dest', case when e.dest_lng is not null then jsonb_build_object('lng', e.dest_lng, 'lat', e.dest_lat) end,
    'speed_mps', e.speed_mps, 'traveling', c.traveling, 'arrives_at', c.arrives_at,
    'jump_available_at', case when e.last_jump_at is null then null
                              else e.last_jump_at + make_interval(hours => coalesce((v_cfg ->> 'jump_cooldown_hours')::int, 24)) end,
    'reach', coalesce((v_cfg ->> 'claim_reach')::int, 1),
    'server_time', now());
end $$;

-- Claims are limited to plots within explorer.claim_reach plots of the explorer
-- (flag location_gated_claims; on by default).
create or replace function private.require_in_reach(p_uid uuid, p_gx int, p_gy int) returns void
language plpgsql stable as $$
declare c record; v_reach int := coalesce((private.cfg('explorer') ->> 'claim_reach')::int, 1); v_d int;
begin
  if not private.flag('location_gated_claims') then return; end if;
  select * into c from private.explorer_now(p_uid);
  if not found then raise exception 'explorer_required' using errcode = 'P0001'; end if;
  v_d := private.cell_distance(c.gx, c.gy, p_gx, p_gy);
  if v_d > v_reach then
    raise exception 'out_of_reach' using errcode = 'P0001', detail = v_d::text;
  end if;
end $$;

-- ===== Group / project helpers (used by ownership; detailed in fusion migration)

create or replace function private.empty_manifest() returns jsonb
language sql immutable as $$
  select '{"layers":[{"id":"layer-1","name":"Layer 1","opacity":1,"visible":true,"tiles":{}}]}'::jsonb
$$;

create or replace function private.manifest_tile_count(p_manifest jsonb) returns int
language sql immutable as $$
  select coalesce(sum((select count(*) from jsonb_object_keys(coalesce(l -> 'tiles', '{}'::jsonb)))), 0)::int
  from jsonb_array_elements(coalesce(p_manifest -> 'layers', '[]'::jsonb)) l
$$;

create or replace function private.refresh_group(p_group uuid) returns void
language plpgsql as $$
declare v_cells jsonb; v_u jsonb;
begin
  select jsonb_agg(jsonb_build_array(gx, gy)) into v_cells from public.canvas_group_members where group_id = p_group;
  if v_cells is null then
    update public.canvas_groups set plot_count = 0, min_gx = null, min_gy = null, max_gx = null, max_gy = null, updated_at = now()
    where id = p_group;
    return;
  end if;
  v_u := private.cells_unwrap(v_cells);
  update public.canvas_groups
     set plot_count = jsonb_array_length(v_cells),
         min_gx = (v_u ->> 'min_gx')::int, min_gy = (v_u ->> 'min_gy')::int,
         max_gx = (v_u ->> 'max_gx')::int, max_gy = (v_u ->> 'max_gy')::int,
         updated_at = now()
   where id = p_group;
end $$;

create or replace function private.create_version(
  p_project uuid, p_owner uuid, p_kind text, p_manifest jsonb, p_cells jsonb, p_note text default null
) returns uuid
language plpgsql as $$
declare v_no int; v_id uuid; v_parent uuid; v_layer jsonb; v_pos int := 0;
begin
  select version_count + 1, current_version_id into v_no, v_parent
  from public.artwork_projects where id = p_project for update;
  insert into public.artwork_versions (project_id, owner_id, version_no, parent_version_id, kind, manifest, cells, layer_count, tile_count, note)
  values (p_project, p_owner, v_no, v_parent, p_kind, p_manifest, p_cells,
          jsonb_array_length(p_manifest -> 'layers'), private.manifest_tile_count(p_manifest), p_note)
  returning id into v_id;
  update public.artwork_projects
     set current_version_id = v_id, version_count = v_no, updated_at = now()
   where id = p_project;
  delete from public.artwork_layers where project_id = p_project;
  for v_layer in select * from jsonb_array_elements(p_manifest -> 'layers') loop
    insert into public.artwork_layers (project_id, layer_id, position, name, opacity, visible, tile_count)
    values (p_project, v_layer ->> 'id', v_pos, v_layer ->> 'name',
            coalesce((v_layer ->> 'opacity')::real, 1), coalesce((v_layer ->> 'visible')::boolean, true),
            (select count(*) from jsonb_object_keys(coalesce(v_layer -> 'tiles', '{}'::jsonb))));
    v_pos := v_pos + 1;
  end loop;
  return v_id;
end $$;

create or replace function private.create_group_with_cells(
  p_uid uuid, p_cells jsonb, p_manifest jsonb, p_name text, p_kind text, p_title text default null
) returns uuid
language plpgsql as $$
declare v_group uuid; v_project uuid;
begin
  insert into public.canvas_groups (owner_id, name) values (p_uid, coalesce(p_name, 'Untitled canvas'))
  returning id into v_group;
  insert into public.canvas_group_members (group_id, gx, gy)
  select v_group, (c ->> 0)::int, (c ->> 1)::int from jsonb_array_elements(p_cells) c;
  insert into public.artwork_projects (owner_id, group_id, title)
  values (p_uid, v_group, coalesce(p_title, 'Untitled'))
  returning id into v_project;
  update public.canvas_groups set project_id = v_project where id = v_group;
  perform private.create_version(v_project, p_uid, p_kind, p_manifest, p_cells, null);
  perform private.refresh_group(v_group);
  return v_group;
end $$;

-- ===== Ownership core =======================================================

-- Atomically transfer an unowned plot to p_uid. Two concurrent callers can never
-- both succeed: the INSERT is serialised by the primary key and the UPDATE only
-- matches rows whose owner is still NULL.
create or replace function private.take_plot(p_uid uuid, p_gx int, p_gy int, p_method text, p_cost jsonb)
returns jsonb
language plpgsql as $$
declare v_type text; v_rarity text; v_group uuid;
begin
  if p_gx is null or p_gy is null or p_gx not between 0 and 65535 or p_gy not between 0 and 65535 then
    raise exception 'invalid_plot' using errcode = 'P0001';
  end if;
  v_type := private.plot_type_for(p_gx, p_gy);
  v_rarity := private.plot_rarity_for(p_gx, p_gy);
  insert into public.world_plots (gx, gy, plot_type, rarity, owner_id, claimed_at)
  values (p_gx, p_gy, v_type, v_rarity, p_uid, now())
  on conflict (gx, gy) do nothing;
  if not found then
    update public.world_plots
       set owner_id = p_uid, claimed_at = now(), level = 1,
           art_publication_id = null, art_rev = null, updated_at = now()
     where gx = p_gx and gy = p_gy and owner_id is null and not locked
    returning plot_type, rarity into v_type, v_rarity;
    if not found then
      raise exception 'plot_unavailable' using errcode = 'P0001';
    end if;
  end if;
  insert into public.plot_ownership (gx, gy, player_id, method, cost)
  values (p_gx, p_gy, p_uid, p_method, coalesce(p_cost, '{}'::jsonb));
  v_group := private.create_group_with_cells(p_uid, jsonb_build_array(jsonb_build_array(p_gx, p_gy)),
                                             private.empty_manifest(), null, 'initial');
  insert into public.map_updates (kind, min_gx, min_gy, max_gx, max_gy) values ('ownership', p_gx, p_gy, p_gx, p_gy);
  return jsonb_build_object('gx', p_gx, 'gy', p_gy, 'plot_type', v_type, 'rarity', v_rarity, 'group_id', v_group,
                            'usd_per_second', private.plot_rent_rate(v_rarity, 1));
end $$;

-- Price of an unowned plot in Ink (TerraMine-style flat price by default:
-- base_ink x growth^(owned-1) x type multiplier x rarity multiplier).
create or replace function private.acquire_cost(p_uid uuid, p_gx int, p_gy int) returns jsonb
language plpgsql stable as $$
declare
  v_cfg jsonb := private.cfg('economy') -> 'acquire';
  v_owned int; v_type text; v_rarity text; v_tm numeric; v_rm numeric; v_cost numeric;
begin
  select count(*) into v_owned from public.world_plots where owner_id = p_uid;
  select plot_type, rarity into v_type, v_rarity from public.world_plots where gx = p_gx and gy = p_gy;
  v_type := coalesce(v_type, private.plot_type_for(p_gx, p_gy));
  v_rarity := coalesce(v_rarity, private.plot_rarity_for(p_gx, p_gy));
  select acquire_multiplier into v_tm from public.plot_types where id = v_type;
  select price_multiplier into v_rm from public.plot_rarities where id = v_rarity;
  v_cost := coalesce((v_cfg ->> 'base_ink')::numeric, 100)
            * power(coalesce((v_cfg ->> 'growth')::numeric, 1), greatest(v_owned - 1, 0))
            * coalesce(v_tm, 1) * coalesce(v_rm, 1);
  v_cost := least(round(v_cost), coalesce((v_cfg ->> 'max_ink')::numeric, 1000000));
  return jsonb_build_object('ink', v_cost::bigint, 'owned', v_owned, 'plot_type', v_type, 'rarity', v_rarity);
end $$;

-- ===== Profile JSON =========================================================

create or replace function private.profile_json(p_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_seed', p.avatar_seed, 'avatar_style', p.avatar_style, 'accent_color', p.accent_color,
    'bio', p.bio, 'created_at', p.created_at)
  from public.profiles p where p.id = p_id
$$;

-- ===== Public RPCs: accounts ================================================

create or replace function public.world_config() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'grid', jsonb_build_object('level', 16, 'size', 65536, 'plot_px', 256, 'art_min_zoom', 8, 'art_max_zoom', 16),
    'plot_types', (select jsonb_agg(to_jsonb(t) order by t.sort, t.id) from public.plot_types t),
    'rarities', (select jsonb_agg(to_jsonb(r) order by r.sort, r.id) from public.plot_rarities r),
    'economy', private.cfg('economy'),
    'rent', private.cfg('rent'),
    'explorer', private.cfg('explorer'),
    'limits', private.cfg('limits'),
    'shop', private.cfg('shop'),
    'legal', private.cfg('legal'),
    'minigames', private.cfg('minigames'),
    'flags', (select coalesce(jsonb_object_agg(key, jsonb_build_object('enabled', enabled, 'config', config)), '{}'::jsonb)
              from public.feature_flags where is_public),
    'server_time', now())
$$;

create or replace function public.my_state() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_player public.players%rowtype; v_bal jsonb;
begin
  select * into v_player from public.players where id = v_uid;
  if not found then
    return jsonb_build_object('onboarded', false, 'user_id', v_uid,
                              'terms_current', private.cfg('legal') ->> 'terms_version');
  end if;
  -- an active player's rent is banked at least hourly, so the offline cap
  -- (rent.max_offline_days) only ever affects players who stopped visiting
  if exists (select 1 from public.rent_accounts where player_id = v_uid and settled_at < now() - interval '1 hour') then
    perform private.rent_settle(v_uid);
  end if;
  v_bal := private.balances(v_uid);
  return jsonb_build_object(
    'onboarded', true,
    'user_id', v_uid,
    'player', jsonb_build_object(
      'status', v_player.status, 'suspended_until', v_player.suspended_until,
      'suspension_reason', v_player.suspension_reason, 'strikes', v_player.strikes,
      'terms_version', v_player.terms_version, 'terms_accepted_at', v_player.terms_accepted_at,
      'starter_plot_claimed', v_player.starter_plot_claimed, 'created_at', v_player.created_at),
    'profile', private.profile_json(v_uid),
    'balances', v_bal,
    'rent', private.rent_json(v_uid),
    'explorer', private.explorer_json(v_uid),
    'plot_count', (select count(*) from public.world_plots where owner_id = v_uid),
    'group_count', (select count(*) from public.canvas_groups where owner_id = v_uid and status = 'active'),
    'unlocks', (select coalesce(jsonb_agg(unlock_key order by unlock_key), '[]'::jsonb) from public.player_unlocks where player_id = v_uid),
    'roles', (select coalesce(jsonb_agg(role order by role), '[]'::jsonb) from public.admin_roles where player_id = v_uid),
    'artist_level', private.artist_level((v_bal ->> 'brush_points')::bigint),
    'achievement_count', (select count(*) from public.player_achievements where player_id = v_uid),
    'terms_current', private.cfg('legal') ->> 'terms_version',
    'server_time', now());
end $$;

create or replace function public.complete_onboarding(
  p_username text, p_display_name text default null, p_avatar_seed text default null,
  p_avatar_style text default 'prism', p_accent_color text default '#7B5CFF', p_accept_terms_version text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_terms text := private.cfg('legal') ->> 'terms_version';
begin
  if exists (select 1 from public.players where id = v_uid) then
    raise exception 'already_onboarded' using errcode = 'P0001';
  end if;
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'invalid_username' using errcode = 'P0001';
  end if;
  if lower(p_username) in ('admin', 'administrator', 'landvas', 'moderator', 'mod', 'support', 'system', 'staff', 'official', 'root', 'null', 'undefined') then
    raise exception 'username_reserved' using errcode = 'P0001';
  end if;
  if p_accept_terms_version is distinct from v_terms then
    raise exception 'terms_required' using errcode = 'P0001', detail = v_terms;
  end if;
  insert into public.players (id, terms_version, terms_accepted_at) values (v_uid, v_terms, now());
  begin
    insert into public.profiles (id, username, display_name, avatar_seed, avatar_style, accent_color)
    values (v_uid, p_username, nullif(trim(p_display_name), ''),
            coalesce(nullif(p_avatar_seed, ''), md5(random()::text)),
            coalesce(p_avatar_style, 'prism'), coalesce(p_accent_color, '#7B5CFF'));
  exception when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
  end;
  insert into public.resource_balances (player_id, resource, amount)
  select v_uid, r, 0 from unnest(array['ink', 'pigments', 'brush_points', 'gallery_tokens']) r;
  return public.my_state();
end $$;

create or replace function public.accept_terms(p_version text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  if p_version is distinct from private.cfg('legal') ->> 'terms_version' then
    raise exception 'terms_version_mismatch' using errcode = 'P0001';
  end if;
  update public.players set terms_version = p_version, terms_accepted_at = now() where id = v_uid;
  if not found then raise exception 'onboarding_required' using errcode = 'P0001'; end if;
  return public.my_state();
end $$;

create or replace function public.update_profile(
  p_display_name text default null, p_bio text default null, p_avatar_seed text default null,
  p_avatar_style text default null, p_accent_color text default null,
  p_featured_publication_id uuid default null, p_favorite_publication_ids jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_favs uuid[];
begin
  perform private.rate_limit('update_profile', 30, 3600);
  if p_featured_publication_id is not null and not exists (
    select 1 from public.artwork_publications where id = p_featured_publication_id and owner_id = v_uid and status = 'published') then
    raise exception 'invalid_featured_artwork' using errcode = 'P0001';
  end if;
  if p_favorite_publication_ids is not null then
    select coalesce(array_agg(distinct x::uuid), '{}') into v_favs from jsonb_array_elements_text(p_favorite_publication_ids) x;
    if cardinality(v_favs) > 6 then raise exception 'too_many_favorites' using errcode = 'P0001'; end if;
    if exists (select 1 from unnest(v_favs) f where not exists (
      select 1 from public.artwork_publications a where a.id = f and a.status = 'published')) then
      raise exception 'invalid_favorite' using errcode = 'P0001';
    end if;
  end if;
  update public.profiles set
    display_name = case when p_display_name is null then display_name else nullif(trim(p_display_name), '') end,
    bio = case when p_bio is null then bio else nullif(trim(p_bio), '') end,
    avatar_seed = coalesce(nullif(p_avatar_seed, ''), avatar_seed),
    avatar_style = coalesce(p_avatar_style, avatar_style),
    accent_color = coalesce(p_accent_color, accent_color),
    featured_publication_id = coalesce(p_featured_publication_id, featured_publication_id),
    favorite_publication_ids = coalesce(v_favs, favorite_publication_ids),
    updated_at = now()
  where id = v_uid;
  return private.profile_json(v_uid);
end $$;

-- ===== Public RPCs: map =====================================================

-- Owned plots inside a grid bbox (x may be given unwrapped: -65536..131071).
-- Returns compact rows: [gx, gy, type, level, is_mine, group_id, has_art, username, accent, rarity]
create or replace function public.plots_in_bbox(p_min_gx int, p_min_gy int, p_max_gx int, p_max_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_res jsonb;
begin
  if p_max_gx < p_min_gx or p_max_gy < p_min_gy or p_max_gx - p_min_gx > 1024 or p_max_gy - p_min_gy > 1024 then
    raise exception 'bbox_too_large' using errcode = 'P0001';
  end if;
  p_min_gy := greatest(p_min_gy, 0);
  p_max_gy := least(p_max_gy, 65535);
  with ranges as (
    select greatest(p_min_gx, 0) as x0, least(p_max_gx, 65535) as x1 where p_max_gx >= 0 and p_min_gx <= 65535
    union all select p_min_gx + 65536, 65535 where p_min_gx < 0
    union all select 0, p_max_gx - 65536 where p_max_gx > 65535
  ), blocks as (
    select distinct by_, bx_
    from ranges r, generate_series(r.x0 >> 6, r.x1 >> 6) bx_, generate_series(p_min_gy >> 6, p_max_gy >> 6) by_
  )
  select coalesce(jsonb_agg(jsonb_build_array(p.gx, p.gy, p.plot_type, p.level, p.owner_id = v_uid, m.group_id,
                                               p.art_rev is not null, pr.username, pr.accent_color, p.rarity)), '[]'::jsonb)
    into v_res
  from blocks b
  join public.world_plots p on p.by = b.by_ and p.bx = b.bx_
  left join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
  left join public.profiles pr on pr.id = p.owner_id
  where p.owner_id is not null
    and p.gy between p_min_gy and p_max_gy
    and exists (select 1 from ranges r where p.gx between r.x0 and r.x1);
  return v_res;
end $$;

-- Aggregated ownership counts for low zoom levels (z in 3,5,7,9,11).
create or replace function public.density_in_bbox(p_z int, p_x0 int, p_y0 int, p_x1 int, p_y1 int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_array(d.x, d.y, d.owned)), '[]'::jsonb)
  from (
    select x, y, owned from public.world_density
    where z = p_z and owned > 0 and x between p_x0 and p_x1 and y between p_y0 and p_y1
    limit 4096
  ) d
$$;

-- Art tile index for a list of 16x16 tile blocks at zoom p_z.
-- p_blocks: [[bx, by], ...] (max 64). Returns {"bx_by": [[x, y, rev], ...]}.
create or replace function public.art_tile_index(p_z int, p_blocks jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_res jsonb;
begin
  if jsonb_array_length(p_blocks) > 64 then raise exception 'too_many_blocks' using errcode = 'P0001'; end if;
  with req as (
    select distinct (b ->> 0)::int as bx, (b ->> 1)::int as by from jsonb_array_elements(p_blocks) b
  )
  select coalesce(jsonb_object_agg(k, tiles), '{}'::jsonb) into v_res from (
    select r.bx || '_' || r.by as k,
           coalesce((select jsonb_agg(jsonb_build_array(t.x, t.y, t.rev))
                     from public.art_tiles t where t.z = p_z and t.by = r.by and t.bx = r.bx), '[]'::jsonb) as tiles
    from req r
  ) s;
  return v_res;
end $$;

create or replace function public.map_updates_since(p_since_id bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'latest_id', (select coalesce(max(id), 0) from public.map_updates),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'kind', u.kind, 'min_gx', u.min_gx, 'min_gy', u.min_gy,
                                          'max_gx', u.max_gx, 'max_gy', u.max_gy, 'publication_id', u.publication_id) order by u.id)
      from (select * from public.map_updates where id > coalesce(p_since_id, 0) order by id limit 500) u), '[]'::jsonb))
$$;

-- Everything the plot panel needs, in one round trip.
create or replace function public.plot_details(p_gx int, p_gy int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_plot public.world_plots%rowtype;
  v_type text;
  v_rarity text;
  v_group uuid;
  v_res jsonb;
  v_is_mine boolean := false;
  v_starter boolean := false;
  v_ex record;
  v_reach int := coalesce((private.cfg('explorer') ->> 'claim_reach')::int, 1);
  v_level int;
begin
  if p_gx not between 0 and 65535 or p_gy not between 0 and 65535 then
    raise exception 'invalid_plot' using errcode = 'P0001';
  end if;
  select * into v_plot from public.world_plots where gx = p_gx and gy = p_gy;
  v_type := coalesce(v_plot.plot_type, private.plot_type_for(p_gx, p_gy));
  v_rarity := coalesce(v_plot.rarity, private.plot_rarity_for(p_gx, p_gy));
  v_level := coalesce(v_plot.level, 1);
  v_is_mine := v_uid is not null and v_plot.owner_id = v_uid;
  if v_uid is not null then
    select not starter_plot_claimed into v_starter from public.players where id = v_uid;
  end if;
  select group_id into v_group from public.canvas_group_members where gx = p_gx and gy = p_gy;

  v_res := jsonb_build_object(
    'gx', p_gx, 'gy', p_gy,
    'center', jsonb_build_object('lng', private.lng_of(p_gx + 0.5), 'lat', private.lat_of(p_gy + 0.5)),
    'plot_type', v_type,
    'type_info', (select to_jsonb(t) from public.plot_types t where t.id = v_type),
    'rarity', v_rarity,
    'rarity_info', (select to_jsonb(r) from public.plot_rarities r where r.id = v_rarity),
    'rent', jsonb_build_object(
      'usd_per_second', private.plot_rent_rate(v_rarity, v_level),
      'boost_multiplier', coalesce((private.cfg('rent') -> 'boost' ->> 'multiplier')::numeric, 20)),
    'owned', v_plot.owner_id is not null,
    'is_mine', v_is_mine,
    'owner', case when v_plot.owner_id is not null then private.profile_json(v_plot.owner_id) end,
    'level', v_level,
    'claimed_at', v_plot.claimed_at,
    'locked', coalesce(v_plot.locked, false),
    'art', (select jsonb_build_object('publication_id', a.id, 'title', a.title, 'published_at', a.published_at,
                                      'plot_count', a.plot_count, 'artist', private.profile_json(a.owner_id),
                                      'appreciation_count', a.appreciation_count)
            from public.artwork_publications a where a.id = v_plot.art_publication_id),
    'neighbors', (
      select jsonb_agg(jsonb_build_object(
        'gx', n.gx, 'gy', n.gy, 'dir', n.dir,
        'plot_type', coalesce(w.plot_type, private.plot_type_for(n.gx, n.gy)),
        'rarity', coalesce(w.rarity, private.plot_rarity_for(n.gx, n.gy)),
        'owned', w.owner_id is not null,
        'is_mine', v_uid is not null and w.owner_id = v_uid,
        'owner_username', (select username from public.profiles where id = w.owner_id),
        'group_id', m.group_id,
        'same_group', v_group is not null and m.group_id = v_group) order by n.dir)
      from private.neighbors(p_gx, p_gy) n
      left join public.world_plots w on w.gx = n.gx and w.gy = n.gy
      left join public.canvas_group_members m on m.gx = n.gx and m.gy = n.gy)
  );

  -- reach from the viewer's own explorer (never reveals anyone else's position)
  if v_uid is not null then
    select * into v_ex from private.explorer_now(v_uid);
    if found then
      v_res := v_res || jsonb_build_object('reach', jsonb_build_object(
        'explorer', true, 'distance', private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy), 'max', v_reach,
        'in_reach', not private.flag('location_gated_claims') or private.cell_distance(v_ex.gx, v_ex.gy, p_gx, p_gy) <= v_reach));
    else
      v_res := v_res || jsonb_build_object('reach', jsonb_build_object(
        'explorer', false, 'distance', null, 'max', v_reach, 'in_reach', not private.flag('location_gated_claims')));
    end if;
  end if;

  if v_is_mine then
    v_res := v_res || jsonb_build_object(
      'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'plot_count', g.plot_count, 'project_id', g.project_id,
                                          'min_gx', g.min_gx, 'min_gy', g.min_gy, 'max_gx', g.max_gx, 'max_gy', g.max_gy)
                from public.canvas_groups g where g.id = v_group),
      'connections', (
        select coalesce(jsonb_agg(distinct jsonb_build_object('group_id', g.id, 'name', g.name, 'plot_count', g.plot_count)), '[]'::jsonb)
        from public.canvas_group_members me
        join private.neighbors(me.gx, me.gy) n on true
        join public.canvas_group_members m on m.gx = n.gx and m.gy = n.gy and m.group_id <> v_group
        join public.canvas_groups g on g.id = m.group_id and g.owner_id = v_uid and g.status = 'active'
        where me.group_id = v_group));
  elsif v_plot.owner_id is null then
    v_res := v_res || jsonb_build_object(
      'acquire', case when v_uid is not null and exists (select 1 from public.players where id = v_uid)
                      then private.acquire_cost(v_uid, p_gx, p_gy) || jsonb_build_object('starter_available', coalesce(v_starter, false))
                      else jsonb_build_object('starter_available', true) end,
      'available', not coalesce(v_plot.locked, false));
  end if;
  return v_res;
end $$;

-- ===== Public RPCs: ownership & economy =====================================

create or replace function public.claim_starter_plot(p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_res jsonb; v_bonus jsonb := coalesce(private.cfg('economy') -> 'starter_bonus', '{}'::jsonb);
begin
  perform private.rate_limit('claim', 30, 3600);
  perform 1 from public.players where id = v_uid and not starter_plot_claimed for update;
  if not found then raise exception 'starter_already_claimed' using errcode = 'P0001'; end if;
  perform private.require_in_reach(v_uid, p_gx, p_gy);
  perform private.rent_settle(v_uid);
  v_res := private.take_plot(v_uid, p_gx, p_gy, 'starter', '{}'::jsonb);
  update public.players set starter_plot_claimed = true where id = v_uid;
  perform private.grant(v_uid, v_bonus, 'starter_bonus', 'plot', private.cell_key(p_gx, p_gy), 'starter_bonus');
  return v_res || jsonb_build_object('bonus', v_bonus, 'achievements', private.evaluate_achievements(v_uid),
                                     'balances', private.balances(v_uid), 'rent', private.rent_json(v_uid));
end $$;

-- Buy an unowned plot with Ink (the only way to get more land). Ink itself is
-- only earned by winning plot minigames.
create or replace function public.acquire_plot(p_gx int, p_gy int, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_prev jsonb; v_cost jsonb; v_res jsonb;
begin
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'acquire_plot');
  if v_prev is not null then return v_prev; end if;
  perform private.rate_limit('acquire', 120, 3600);
  if exists (select 1 from public.world_plots where gx = p_gx and gy = p_gy and (owner_id is not null or locked)) then
    raise exception 'plot_unavailable' using errcode = 'P0001';
  end if;
  if (select count(*) from public.world_plots where owner_id = v_uid) >= coalesce((private.cfg('limits') ->> 'max_plots_per_player')::int, 2500) then
    raise exception 'plot_limit_reached' using errcode = 'P0001';
  end if;
  perform private.require_in_reach(v_uid, p_gx, p_gy);
  v_cost := private.acquire_cost(v_uid, p_gx, p_gy);
  perform private.rent_settle(v_uid);
  perform private.ledger_apply(v_uid, 'ink', -(v_cost ->> 'ink')::bigint, 'acquire_plot', 'plot',
                               private.cell_key(p_gx, p_gy), p_idempotency_key);
  v_res := private.take_plot(v_uid, p_gx, p_gy, 'acquire', jsonb_build_object('ink', v_cost -> 'ink'));
  perform private.grant(v_uid, jsonb_build_object('brush_points', 5), 'acquire_plot', 'plot', private.cell_key(p_gx, p_gy), p_idempotency_key);
  v_res := v_res || jsonb_build_object('cost', v_cost, 'balances', private.balances(v_uid), 'rent', private.rent_json(v_uid),
                                       'achievements', private.evaluate_achievements(v_uid));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

-- Raise a plot's level: +1% rent (rent.level_bonus) and +5% minigame Ink
-- (minigames.plot_level_bonus) per level. Costs Ink + Pigments.
create or replace function public.upgrade_plot(p_gx int, p_gy int, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  v_prev jsonb; v_up jsonb := private.cfg('economy') -> 'upgrade'; v_level int; v_cost jsonb; v_max int; v_res jsonb;
begin
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'upgrade_plot');
  if v_prev is not null then return v_prev; end if;
  perform private.rate_limit('upgrade', 120, 3600);
  select level into v_level from public.world_plots where gx = p_gx and gy = p_gy and owner_id = v_uid for update;
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  v_max := least(coalesce((v_up ->> 'max_level')::int, 10), 10);
  if v_level >= v_max then raise exception 'max_level' using errcode = 'P0001'; end if;
  v_cost := jsonb_build_object('ink', coalesce(v_up -> 'level_cost_ink' -> v_level, '0'::jsonb),
                               'pigments', coalesce(v_up -> 'level_cost_pigments' -> v_level, '0'::jsonb));
  -- bank rent at the old rate first so the upgrade never applies retroactively
  perform private.rent_settle(v_uid);
  perform private.charge(v_uid, v_cost, 'upgrade_level', 'plot', private.cell_key(p_gx, p_gy), p_idempotency_key);
  update public.world_plots set level = level + 1, updated_at = now() where gx = p_gx and gy = p_gy;
  perform private.grant(v_uid, jsonb_build_object('brush_points', 8), 'upgrade', 'plot', private.cell_key(p_gx, p_gy), p_idempotency_key);
  v_res := jsonb_build_object('ok', true, 'cost', v_cost, 'balances', private.balances(v_uid),
                              'plot', public.plot_details(p_gx, p_gy), 'rent', private.rent_json(v_uid),
                              'achievements', private.evaluate_achievements(v_uid));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

-- ===== Public RPCs: rent & boost ============================================

create or replace function public.rent_state() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  perform private.rate_limit('rent_state', 600, 3600);
  perform private.rent_settle(v_uid);
  return private.rent_json(v_uid);
end $$;

-- Free boost: +minutes_per_boost of the boost multiplier on ALL rent, stacking
-- up to max_stack_hours, limited to free_per_day presses per daily reset.
create or replace function public.activate_boost(p_idempotency_key text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player();
  v_prev jsonb; v_b jsonb := private.cfg('rent') -> 'boost'; a public.rent_accounts%rowtype;
  v_day date := (private.day_start(now()) at time zone 'UTC')::date; v_used int; v_free int; v_minutes int;
  v_cap timestamptz; v_new timestamptz; v_res jsonb;
begin
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'activate_boost');
  if v_prev is not null then return v_prev; end if;
  perform private.rate_limit('boost', 60, 3600);
  if not coalesce((private.cfg('rent') ->> 'enabled')::boolean, true) then
    raise exception 'rent_disabled' using errcode = 'P0001';
  end if;
  perform private.rent_settle(v_uid);
  select * into a from public.rent_accounts where player_id = v_uid for update;
  v_used := case when a.boost_day = v_day then a.boosts_used else 0 end;
  v_free := coalesce((v_b ->> 'free_per_day')::int, 6);
  if v_used >= v_free then
    raise exception 'boost_daily_limit' using errcode = 'P0001', detail = (private.day_start(now()) + interval '1 day')::text;
  end if;
  v_minutes := greatest(coalesce((v_b ->> 'minutes_per_boost')::int, 30), 1);
  v_cap := now() + make_interval(secs => coalesce((v_b ->> 'max_stack_hours')::numeric, 8) * 3600);
  if coalesce(a.boost_until, now()) >= v_cap - interval '1 minute' then
    raise exception 'boost_capped' using errcode = 'P0001';
  end if;
  v_new := least(greatest(coalesce(a.boost_until, now()), now()) + make_interval(mins => v_minutes), v_cap);
  update public.rent_accounts
     set boost_until = v_new, boost_day = v_day, boosts_used = v_used + 1, updated_at = now()
   where player_id = v_uid;
  insert into public.boost_activations (player_id, source, minutes, boost_until) values (v_uid, 'free', v_minutes, v_new);
  v_res := private.rent_json(v_uid);
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

create or replace function public.my_rent_ledger(p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(l) - 'player_id' - 'actor_id' order by l.id desc), '[]'::jsonb)
  from (select * from public.rent_ledger where player_id = auth.uid() order by id desc limit least(greatest(p_limit, 1), 200)) l
$$;

-- ===== Public RPCs: explorer =================================================

create or replace function public.my_explorer() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return private.explorer_json(private.uid());
end $$;

-- A GPS fix from the device. Accepted if reachable from the last known position
-- at explorer.max_speed_kmh (teleport protection); a far jump is accepted once
-- per jump cooldown (e.g. after a flight), otherwise ignored ({accepted:false,
-- wait_seconds}) and logged as a security event.
create or replace function public.report_position(p_lng float8, p_lat float8, p_accuracy_m float8 default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_cfg jsonb := private.cfg('explorer');
  e public.explorers%rowtype; c record; v_since timestamptz; v_dist float8; v_dt float8; v_max float8; v_tol float8; v_wait int;
  v_acc real := least(greatest(coalesce(p_accuracy_m, 50), 0), 5000)::real;
begin
  perform private.rate_limit('position', 1200, 3600);
  if p_lng is null or p_lat is null or p_lng not between -180 and 180 or p_lat not between -85.05 and 85.05 then
    raise exception 'invalid_position' using errcode = 'P0001';
  end if;
  select * into e from public.explorers where player_id = v_uid for update;
  if not found then
    insert into public.explorers (player_id, mode, lng, lat, fixed_at, accuracy_m) values (v_uid, 'gps', p_lng, p_lat, now(), v_acc);
    return private.explorer_json(v_uid) || jsonb_build_object('accepted', true, 'placed', true);
  end if;
  select * into c from private.explorer_now(v_uid);
  v_since := case when e.dest_lng is null then e.fixed_at else least(coalesce(c.arrives_at, now()), now()) end;
  v_dist := private.haversine_m(c.lng, c.lat, p_lng, p_lat);
  v_dt := greatest(extract(epoch from (now() - v_since)), 1);
  v_max := coalesce((v_cfg ->> 'max_speed_kmh')::float8, 1000) / 3.6;
  v_tol := 1000 + v_acc + coalesce(e.accuracy_m, 50);
  if v_dist > v_max * v_dt + v_tol then
    if e.last_jump_at is null or e.last_jump_at < now() - make_interval(hours => coalesce((v_cfg ->> 'jump_cooldown_hours')::int, 24)) then
      update public.explorers set mode = 'gps', lng = p_lng, lat = p_lat, fixed_at = now(), accuracy_m = v_acc,
             dest_lng = null, dest_lat = null, speed_mps = null, last_jump_at = now(), updated_at = now()
       where player_id = v_uid;
      insert into private.security_events (player_id, kind, details)
      values (v_uid, 'gps_reanchor', jsonb_build_object('distance_m', round(v_dist::numeric), 'seconds', round(v_dt::numeric)));
      return private.explorer_json(v_uid) || jsonb_build_object('accepted', true, 'reanchored', true);
    end if;
    -- not an error (GPS glitches happen): keep the old position, log, and tell the client how long to wait
    v_wait := ceil((v_dist - v_tol) / v_max - v_dt)::int;
    insert into private.security_events (player_id, kind, details)
    values (v_uid, 'gps_jump_rejected', jsonb_build_object('distance_m', round(v_dist::numeric), 'seconds', round(v_dt::numeric)));
    return private.explorer_json(v_uid) || jsonb_build_object('accepted', false, 'rejected', 'position_jump', 'wait_seconds', v_wait);
  end if;
  update public.explorers set mode = 'gps', lng = p_lng, lat = p_lat, fixed_at = now(), accuracy_m = v_acc,
         dest_lng = null, dest_lat = null, speed_mps = null, updated_at = now()
   where player_id = v_uid;
  return private.explorer_json(v_uid) || jsonb_build_object('accepted', true);
end $$;

-- Manual movement where GPS is unavailable: the first placement is instant;
-- afterwards the explorer travels at explorer.travel_speed_kmh, or jumps
-- instantly once per explorer.jump_cooldown_hours.
create or replace function public.travel_to(p_lng float8, p_lat float8, p_jump boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_active_player(); v_cfg jsonb := private.cfg('explorer');
  e public.explorers%rowtype; c record; v_cool interval;
begin
  perform private.rate_limit('travel', 240, 3600);
  if p_lng is null or p_lat is null or p_lng not between -180 and 180 or p_lat not between -85.05 and 85.05 then
    raise exception 'invalid_position' using errcode = 'P0001';
  end if;
  select * into e from public.explorers where player_id = v_uid for update;
  if not found then
    insert into public.explorers (player_id, mode, lng, lat, fixed_at) values (v_uid, 'manual', p_lng, p_lat, now());
    return private.explorer_json(v_uid) || jsonb_build_object('placed', true);
  end if;
  if not coalesce((v_cfg ->> 'manual_travel')::boolean, true) then
    raise exception 'manual_travel_disabled' using errcode = 'P0001';
  end if;
  v_cool := make_interval(hours => coalesce((v_cfg ->> 'jump_cooldown_hours')::int, 24));
  if p_jump then
    if e.last_jump_at is not null and e.last_jump_at > now() - v_cool then
      raise exception 'jump_cooldown' using errcode = 'P0001', detail = (e.last_jump_at + v_cool)::text;
    end if;
    update public.explorers set mode = 'manual', lng = p_lng, lat = p_lat, fixed_at = now(), accuracy_m = null,
           dest_lng = null, dest_lat = null, speed_mps = null, last_jump_at = now(), updated_at = now()
     where player_id = v_uid;
    return private.explorer_json(v_uid) || jsonb_build_object('jumped', true);
  end if;
  select * into c from private.explorer_now(v_uid);
  update public.explorers
     set mode = 'manual', lng = c.lng, lat = c.lat, fixed_at = now(), accuracy_m = null,
         dest_lng = p_lng, dest_lat = p_lat,
         speed_mps = greatest(coalesce((v_cfg ->> 'travel_speed_kmh')::float8, 20), 1) / 3.6, updated_at = now()
   where player_id = v_uid;
  return private.explorer_json(v_uid);
end $$;

create or replace function public.purchase_unlock(p_key text, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_prev jsonb; v_item jsonb; v_res jsonb;
begin
  v_prev := private.idem_begin(v_uid, p_idempotency_key, 'purchase_unlock');
  if v_prev is not null then return v_prev; end if;
  select i into v_item from jsonb_array_elements(private.cfg('shop') -> 'items') i where i ->> 'key' = p_key;
  if v_item is null or coalesce((v_item ->> 'enabled')::boolean, true) = false then
    raise exception 'unknown_item' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.player_unlocks where player_id = v_uid and unlock_key = p_key) then
    raise exception 'already_unlocked' using errcode = 'P0001';
  end if;
  if v_item ? 'requires' and not exists (
    select 1 from public.player_unlocks where player_id = v_uid and unlock_key = v_item ->> 'requires') then
    raise exception 'requires_unlock' using errcode = 'P0001', detail = v_item ->> 'requires';
  end if;
  perform private.charge(v_uid, v_item -> 'cost', 'unlock', 'unlock', p_key, p_idempotency_key);
  insert into public.player_unlocks (player_id, unlock_key) values (v_uid, p_key);
  v_res := jsonb_build_object('ok', true, 'key', p_key, 'balances', private.balances(v_uid),
                              'unlocks', (select jsonb_agg(unlock_key order by unlock_key) from public.player_unlocks where player_id = v_uid));
  return private.idem_finish(v_uid, p_idempotency_key, v_res);
end $$;

create or replace function public.my_plots() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'gx', p.gx, 'gy', p.gy, 'plot_type', p.plot_type, 'rarity', p.rarity, 'level', p.level, 'claimed_at', p.claimed_at,
      'group_id', m.group_id, 'has_art', p.art_rev is not null,
      'usd_per_second', private.plot_rent_rate(p.rarity, p.level))
      order by p.claimed_at)
    from public.world_plots p
    left join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
    where p.owner_id = v_uid), '[]'::jsonb);
end $$;

create or replace function public.my_ledger(p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(l) - 'player_id' - 'actor_id' order by l.id desc), '[]'::jsonb)
  from (select * from public.resource_ledger where player_id = auth.uid() order by id desc limit least(greatest(p_limit, 1), 200)) l
$$;

create or replace function public.my_palettes() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'colors', to_jsonb(colors)) order by created_at), '[]'::jsonb)
  from public.player_palettes where player_id = auth.uid()
$$;

create or replace function public.save_palette(p_id uuid, p_name text, p_colors jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_colors text[]; v_id uuid;
begin
  perform private.rate_limit('palette', 60, 3600);
  select array_agg(c) into v_colors from jsonb_array_elements_text(p_colors) c;
  if v_colors is null or exists (select 1 from unnest(v_colors) c where c !~ '^#[0-9A-Fa-f]{6}$') then
    raise exception 'invalid_colors' using errcode = 'P0001';
  end if;
  if p_id is null then
    if (select count(*) from public.player_palettes where player_id = v_uid) >= 20 then
      raise exception 'palette_limit' using errcode = 'P0001';
    end if;
    insert into public.player_palettes (player_id, name, colors) values (v_uid, p_name, v_colors) returning id into v_id;
  else
    update public.player_palettes set name = p_name, colors = v_colors, updated_at = now()
    where id = p_id and player_id = v_uid returning id into v_id;
    if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  end if;
  return public.my_palettes();
end $$;

create or replace function public.delete_palette(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  delete from public.player_palettes where id = p_id and player_id = v_uid;
  return public.my_palettes();
end $$;

create or replace function public.report_client_error(p_message text, p_context jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return; end if;
  perform private.rate_limit('client_error', 30, 3600);
  insert into private.client_errors (player_id, message, context)
  values (auth.uid(), left(coalesce(p_message, ''), 2000), coalesce(p_context, '{}'::jsonb));
end $$;
