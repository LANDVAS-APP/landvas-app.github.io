-- v0.16: daily limits reset at 6 pm (Denver time) instead of 3 am; canvases can grow to
-- 10,000+ plots (and the checks that walk a canvas's plots now scale to that size);
-- referrals can stack an earnings share on top of the invite bonus — the inviter gets a
-- share (10% by default) of the Ink the invited player earns, up to a cap per invite
-- (1,000 Ink by default).

-- ===== 1. Daily reset at a local hour ==============================================
-- rent.boost.reset_hour (0-23, local) in rent.boost.reset_tz (an IANA time zone).
create or replace function private.valid_tz(p_tz text) returns boolean
language plpgsql stable as $$
begin
  perform now() at time zone p_tz;
  return p_tz ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$';
exception when others then return false;
end $$;

create or replace function private.day_start(p_ts timestamptz) returns timestamptz
language sql stable as $$
  select (date_trunc('day', (p_ts at time zone c.tz) - make_interval(hours => c.h)) + make_interval(hours => c.h)) at time zone c.tz
  from (select coalesce((b ->> 'reset_hour')::int, 18) as h,
               case when private.valid_tz(coalesce(b ->> 'reset_tz', 'America/Denver')) then coalesce(b ->> 'reset_tz', 'America/Denver') else 'America/Denver' end as tz
          from (select coalesce(private.cfg('rent') -> 'boost', '{}'::jsonb) b) x) c
$$;

update public.game_config
   set value = jsonb_set(jsonb_set(value, '{boost,reset_hour}', '18'::jsonb, true), '{boost,reset_tz}', '"America/Denver"'::jsonb, true)
 where key = 'rent';

-- ===== 2. Much bigger canvases =====================================================
update public.game_config
   set value = value || jsonb_build_object('max_canvas_plots', greatest(coalesce((value ->> 'max_canvas_plots')::int, 0), 10000),
                                           'max_canvas_side', greatest(coalesce((value ->> 'max_canvas_side')::int, 0), 200))
 where key = 'limits';

-- neighbour walks use hashed equality joins instead of comparing every pair of plots
create or replace function private.cells_connected(p_cells jsonb) returns boolean
language plpgsql immutable as $$
declare v_total int; v_reached int;
begin
  if p_cells is null or jsonb_array_length(p_cells) = 0 then return false; end if;
  with recursive cells as materialized (
    select distinct (c ->> 0)::int as gx, (c ->> 1)::int as gy from jsonb_array_elements(p_cells) c
  ), walk(gx, gy) as (
    (select gx, gy from cells order by gy, gx limit 1)
    union
    select c.gx, c.gy from walk w
      cross join (values (1, 0), (-1, 0), (0, 1), (0, -1)) d(dx, dy)
      join cells c on c.gx = ((w.gx + d.dx + 4194304) % 4194304) and c.gy = w.gy + d.dy
  )
  select (select count(*) from cells), (select count(*) from walk) into v_total, v_reached;
  return v_total = v_reached;
end $$;

create or replace function private.components(p_cells jsonb) returns setof jsonb
language plpgsql immutable as $$
declare v_left jsonb := p_cells; v_comp jsonb;
begin
  while v_left is not null and jsonb_array_length(v_left) > 0 loop
    with recursive cells as materialized (
      select distinct (c ->> 0)::int as gx, (c ->> 1)::int as gy from jsonb_array_elements(v_left) c
    ), walk(gx, gy) as (
      (select gx, gy from cells order by gy, gx limit 1)
      union
      select c.gx, c.gy from walk w
        cross join (values (1, 0), (-1, 0), (0, 1), (0, -1)) d(dx, dy)
        join cells c on c.gx = ((w.gx + d.dx + 4194304) % 4194304) and c.gy = w.gy + d.dy
    )
    select jsonb_agg(jsonb_build_array(gx, gy) order by gy, gx) into v_comp from walk;
    return next v_comp;
    select jsonb_agg(jsonb_build_array(l.gx, l.gy) order by l.gy, l.gx) into v_left
    from (select (c ->> 0)::int gx, (c ->> 1)::int gy from jsonb_array_elements(v_left) c
          except
          select (k ->> 0)::int, (k ->> 1)::int from jsonb_array_elements(v_comp) k) l;
  end loop;
end $$;

-- tile keys are checked against the canvas with one set difference, not one search per tile
create or replace function private.validate_manifest(p_manifest jsonb, p_member_keys text[], p_max_layers int) returns void
language plpgsql immutable as $$
declare v_layer jsonb; v_ids text[] := '{}'; v_key text; v_count int; v_op numeric;
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' or jsonb_typeof(p_manifest -> 'layers') is distinct from 'array' then
    raise exception 'invalid_manifest' using errcode = 'P0001';
  end if;
  if octet_length(p_manifest::text) > 4000000 then
    raise exception 'manifest_too_large' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(p_manifest -> 'layers');
  if v_count < 1 or v_count > p_max_layers then
    raise exception 'invalid_layer_count' using errcode = 'P0001', detail = v_count::text;
  end if;
  for v_layer in select * from jsonb_array_elements(p_manifest -> 'layers') loop
    if jsonb_typeof(v_layer) <> 'object' or coalesce(v_layer ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,40}$'
       or (v_layer ->> 'id') = any(v_ids) then
      raise exception 'invalid_layer' using errcode = 'P0001';
    end if;
    v_ids := array_append(v_ids, v_layer ->> 'id');
    if char_length(coalesce(v_layer ->> 'name', '')) not between 1 and 40 then
      raise exception 'invalid_layer_name' using errcode = 'P0001';
    end if;
    if v_layer ? 'opacity' then
      if jsonb_typeof(v_layer -> 'opacity') <> 'number' then raise exception 'invalid_opacity' using errcode = 'P0001'; end if;
      v_op := (v_layer ->> 'opacity')::numeric;
      if v_op < 0 or v_op > 1 then raise exception 'invalid_opacity' using errcode = 'P0001'; end if;
    end if;
    if v_layer ? 'visible' and jsonb_typeof(v_layer -> 'visible') <> 'boolean' then
      raise exception 'invalid_layer' using errcode = 'P0001';
    end if;
    if jsonb_typeof(coalesce(v_layer -> 'tiles', '{}'::jsonb)) <> 'object' then
      raise exception 'invalid_tiles' using errcode = 'P0001';
    end if;
    select k into v_key from (select jsonb_object_keys(coalesce(v_layer -> 'tiles', '{}'::jsonb)) k
                              except select unnest(p_member_keys)) x limit 1;
    if v_key is not null then
      raise exception 'tile_outside_canvas' using errcode = 'P0001', detail = v_key;
    end if;
    if exists (select 1 from jsonb_each_text(coalesce(v_layer -> 'tiles', '{}'::jsonb)) t where t.value !~ '^[0-9a-f]{64}$') then
      raise exception 'invalid_tile_hash' using errcode = 'P0001';
    end if;
  end loop;
end $$;

-- ===== 3. Referral earnings share ==================================================
-- referrals.share = {"enabled": true, "pct": 10, "cap_ink": 1000}: on top of reward_ink (paid once
-- the invited player qualifies), the inviter receives pct% of every bit of Ink the invited
-- player earns, until cap_ink has been paid for that invite.
update public.game_config
   set value = value || jsonb_build_object('share', coalesce(value -> 'share', '{"enabled": true, "pct": 10, "cap_ink": 1000}'::jsonb))
 where key = 'referrals';

alter table public.referrals add column if not exists share_ink int not null default 0;
alter table public.referrals add column if not exists share_acc numeric not null default 0;

create or replace function private.referral_share(p_player uuid, p_amount bigint, p_reason text) returns void
language plpgsql as $$
declare
  s jsonb := coalesce(private.cfg('referrals') -> 'share', '{}'::jsonb); r public.referrals%rowtype;
  v_cap int; v_owed int; v_pay int;
begin
  if p_amount <= 0 or not coalesce((s ->> 'enabled')::boolean, false) then return; end if;
  -- only Ink the player earned by playing counts (not referral payouts, refunds or rent conversion)
  if p_reason in ('referral', 'referral_welcome', 'referral_share', 'usd_conversion', 'duel_refund') then return; end if;
  select * into r from public.referrals where referee_id = p_player and status <> 'void' for update;
  if not found then return; end if;
  v_cap := coalesce((s ->> 'cap_ink')::int, 1000);
  if r.share_ink >= v_cap then return; end if;
  if exists (select 1 from public.players where id = r.referrer_id and status = 'banned') then return; end if;
  r.share_acc := r.share_acc + p_amount * coalesce((s ->> 'pct')::numeric, 10) / 100;
  v_owed := least(floor(r.share_acc)::int, v_cap);
  v_pay := greatest(v_owed - r.share_ink, 0);
  update public.referrals set share_acc = r.share_acc, share_ink = share_ink + v_pay where referee_id = p_player;
  if v_pay > 0 then
    perform private.ledger_apply(r.referrer_id, 'ink', v_pay, 'referral_share', 'player', p_player::text, null);
  end if;
end $$;

create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
      if r.key = 'ink' then perform private.referral_share(p_player, r.amount, p_reason); end if;
    end if;
  end loop;
end $$;

create or replace function public.my_referrals() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_cfg jsonb := coalesce(private.cfg('referrals'), '{}'::jsonb); v_default text;
begin
  v_default := private.ensure_referral_code(v_uid);
  return jsonb_build_object(
    'enabled', coalesce((v_cfg ->> 'enabled')::boolean, true),
    'reward_ink', coalesce((v_cfg ->> 'reward_ink')::int, 500),
    'referee_reward_ink', coalesce((v_cfg ->> 'referee_reward_ink')::int, 0),
    'qualify', coalesce(v_cfg ->> 'qualify', 'first_win'),
    'daily_cap', coalesce((v_cfg ->> 'daily_cap')::int, 25),
    'share', jsonb_build_object('enabled', coalesce((v_cfg -> 'share' ->> 'enabled')::boolean, false),
                                'pct', coalesce((v_cfg -> 'share' ->> 'pct')::numeric, 10),
                                'cap_ink', coalesce((v_cfg -> 'share' ->> 'cap_ink')::int, 1000)),
    'default_code', v_default,
    'custom_code', (select code from public.referral_codes where player_id = v_uid and kind = 'custom'),
    'stats', (select jsonb_build_object(
                'total', count(*), 'pending', count(*) filter (where status = 'pending'),
                'rewarded', count(*) filter (where status = 'rewarded'),
                'earned_ink', coalesce(sum(reward_ink) filter (where status = 'rewarded'), 0),
                'share_ink', coalesce(sum(share_ink), 0),
                'share_today', (select coalesce(sum(delta), 0) from public.resource_ledger
                                 where player_id = v_uid and resource = 'ink' and reason = 'referral_share' and created_at >= private.day_start(now())))
              from public.referrals where referrer_id = v_uid),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(r.referee_id), 'status', r.status,
                                                             'reward_ink', r.reward_ink, 'share_ink', r.share_ink,
                                                             'created_at', r.created_at, 'qualified_at', r.qualified_at)
                                         order by r.created_at desc), '[]'::jsonb)
               from (select * from public.referrals where referrer_id = v_uid order by created_at desc limit 50) r),
    'referred_by', (select jsonb_build_object('player', private.profile_json(r.referrer_id), 'status', r.status, 'code', r.code)
                    from public.referrals r where r.referee_id = v_uid),
    'can_redeem', not exists (select 1 from public.referrals where referee_id = v_uid)
                  and (select created_at from public.players where id = v_uid)
                      > now() - make_interval(days => coalesce((v_cfg ->> 'redeem_window_days')::int, 7)),
    'resets_at', private.day_start(now()) + interval '1 day');
end $$;

-- ===== 4. Admin settings validation ================================================
create or replace function public.admin_config_set(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['economy']); v_old jsonb; g record;
begin
  select value into v_old from public.game_config where key = p_key for update;
  if not found then raise exception 'unknown_config_key' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_value) is distinct from jsonb_typeof(v_old) then raise exception 'config_type_mismatch' using errcode = 'P0001'; end if;
  if p_key = 'economy' and not (p_value ? 'acquire' and p_value ? 'upgrade' and p_value ? 'starter_bonus' and p_value ? 'publish_reward') then
    raise exception 'config_missing_required_keys' using errcode = 'P0001';
  end if;
  if p_key = 'economy' and ((p_value -> 'starter_bonus') ? 'ink' or (p_value -> 'publish_reward') ? 'ink') then
    raise exception 'ink_minigame_only' using errcode = 'P0001';
  end if;
  if p_key = 'economy' and coalesce((p_value -> 'acquire' ->> 'base_ink')::numeric, -1) not between 1 and 1000000 then
    raise exception 'invalid_economy_config' using errcode = 'P0001';
  end if;
  if p_key = 'rent' and (
       coalesce((p_value -> 'boost' ->> 'multiplier')::numeric, 0) not between 1 and 100
    or coalesce((p_value -> 'boost' ->> 'minutes_per_boost')::int, 0) not between 1 and 1440
    or coalesce((p_value -> 'boost' ->> 'max_stack_hours')::numeric, 0) not between 0.5 and 72
    or coalesce((p_value -> 'boost' ->> 'free_per_day')::int, -1) not between 0 and 96
    or coalesce((p_value -> 'boost' ->> 'reset_hour_utc')::int, 0) not between 0 and 23
    or coalesce((p_value -> 'boost' ->> 'reset_hour')::int, 18) not between 0 and 23
    or not private.valid_tz(coalesce(p_value -> 'boost' ->> 'reset_tz', 'America/Denver'))
    or coalesce((p_value ->> 'level_bonus')::numeric, -1) not between 0 and 1
    or coalesce((p_value ->> 'max_offline_days')::int, 0) not between 1 and 3650
    or coalesce((p_value -> 'convert' ->> 'ink_per_usd')::numeric, 100) not between 1 and 1000000) then
    raise exception 'invalid_rent_config' using errcode = 'P0001';
  end if;
  if p_key = 'rent' then
    perform private.rent_settle(player_id) from public.rent_accounts;
  end if;
  if p_key = 'explorer' and (
       coalesce((p_value ->> 'claim_reach')::int, -1) not between 0 and 100
    or coalesce((p_value ->> 'max_speed_kmh')::numeric, 0) not between 10 and 5000
    or coalesce((p_value ->> 'travel_speed_kmh')::numeric, 0) not between 1 and 2000
    or coalesce((p_value ->> 'jump_cooldown_hours')::int, -1) not between 0 and 8760
    or (p_value ? 'joystick' and (
         coalesce((p_value -> 'joystick' ->> 'speed_kmh')::numeric, 0) not between 1 and 500
      or coalesce((p_value -> 'joystick' ->> 'tank_seconds')::numeric, -1) not between 0 and 86400
      or coalesce((p_value -> 'joystick' ->> 'burst_seconds')::numeric, 4) not between 1 and 30))) then
    raise exception 'invalid_explorer_config' using errcode = 'P0001';
  end if;
  if p_key = 'minigames' then
    if not (p_value ? 'rewards') or coalesce((p_value -> 'rewards' ->> 'base_ink')::numeric, -1) not between 0 and 100000
       or coalesce((p_value -> 'rewards' ->> 'ink_per_level')::numeric, -1) not between 0 and 10000
       or coalesce((p_value -> 'rewards' ->> 'score_ink_divisor')::numeric, 0) not between 1 and 1000000
       or coalesce((p_value ->> 'daily_rewarded_wins_per_game')::int, -1) not between 0 and 1000
       or coalesce((p_value ->> 'plot_level_bonus')::numeric, -1) not between 0 and 10
       or coalesce((p_value ->> 'ink_multiplier')::numeric, 1) not between 0 and 100 then
      raise exception 'invalid_minigame_config' using errcode = 'P0001';
    end if;
    perform private.check_minigame_games(p_value);
  end if;
  if p_key = 'shop' and (jsonb_typeof(p_value -> 'items') is distinct from 'array'
       or exists (select 1 from jsonb_array_elements(p_value -> 'items') i
                  where coalesce(i ->> 'key', '') !~ '^[a-z0-9_.]{2,48}$'
                     or exists (select 1 from jsonb_each_text(coalesce(i -> 'cost', '{}'::jsonb)) c
                                where c.key not in ('ink', 'pigments', 'brush_points', 'gallery_tokens') or c.value !~ '^[0-9]{1,7}$'))) then
    raise exception 'invalid_shop_config' using errcode = 'P0001';
  end if;
  if p_key = 'referrals' and (
       coalesce((p_value ->> 'reward_ink')::int, -1) not between 0 and 100000
    or coalesce((p_value ->> 'referee_reward_ink')::int, 0) not between 0 and 100000
    or coalesce((p_value ->> 'daily_cap')::int, -1) not between 0 and 10000
    or coalesce((p_value ->> 'redeem_window_days')::int, -1) not between 0 and 3650
    or coalesce(p_value ->> 'qualify', '') not in ('signup', 'starter_plot', 'first_win')
    or coalesce((p_value -> 'share' ->> 'pct')::numeric, 10) not between 0 and 100
    or coalesce((p_value -> 'share' ->> 'cap_ink')::numeric, 1000) not between 0 and 10000000) then
    raise exception 'invalid_referral_config' using errcode = 'P0001';
  end if;
  if p_key = 'moderation' and coalesce(p_value ->> 'mode', '') not in ('manual', 'auto', 'screened') then
    raise exception 'invalid_moderation_mode' using errcode = 'P0001';
  end if;
  if p_key = 'limits' and (coalesce((p_value ->> 'max_canvas_side')::int, 0) not between 1 and 500
                           or coalesce((p_value ->> 'max_canvas_plots')::int, 0) not between 1 and 100000) then
    raise exception 'invalid_limits' using errcode = 'P0001';
  end if;
  update public.game_config set value = p_value, updated_at = now(), updated_by = v_uid where key = p_key;
  perform private.audit('config.set', 'config', p_key, jsonb_build_object('old', v_old, 'new', p_value));
  return public.admin_config_get();
end $$;

do $$
begin
  execute 'revoke all on function private.referral_share(uuid, bigint, text) from public';
  execute 'revoke all on function private.valid_tz(text) from public';
  execute 'revoke all on function public.admin_config_set(text, jsonb) from public, anon';
  execute 'grant execute on function public.admin_config_set(text, jsonb) to authenticated, service_role';
  execute 'revoke all on function public.my_referrals() from public, anon';
  execute 'grant execute on function public.my_referrals() to authenticated, service_role';
end $$;
