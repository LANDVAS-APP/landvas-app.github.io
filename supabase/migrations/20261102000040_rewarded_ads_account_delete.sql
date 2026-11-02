-- v0.24: rewarded ads between actions (verified by the ad network, never by the app), and
-- deleting your own account from inside the game (required by the App Store and Google Play).

-- ===== rewarded ads =====================================================================
-- The app asks for a reward by showing an ad with custom data "reward|ref|nonce". Only AdMob's
-- signed server-side callback (Edge Function admob-ssv, service key) can grant it.
update public.feature_flags set description = 'Rewarded ads in the iOS / Android apps (AdMob). Rewards are granted only by AdMob''s signed server-side callback. Turn on once real AdMob ids are in the app build.',
  config = '{}'::jsonb where key = 'rewarded_ads';

insert into public.game_config (key, value, description) values ('ads', '{
  "daily_cap": 20,
  "rewards": {
    "joystick_refill": {"enabled": true, "label": "Refill your joystick tank"},
    "inkborn_energy":  {"enabled": true, "label": "Wake your Inkborn up", "energy": 40},
    "job_rush":        {"enabled": true, "label": "Bring your Inkborn home now"},
    "game_double":     {"enabled": true, "label": "Double your Inkborn game Ink"},
    "spring_boost":    {"enabled": true, "label": "Fill your Ink Spring faster", "hours": 2}
  }
}', 'Rewarded ads: how many a player can watch a day, and what each kind of ad gives. Ads only run in the mobile apps.')
on conflict (key) do nothing;

alter table private.ad_rewards drop constraint if exists ad_rewards_reward_check;
alter table private.ad_rewards add column if not exists ref text, add column if not exists nonce text, add column if not exists result jsonb;
create index if not exists ad_rewards_player_day_idx on private.ad_rewards (player_id, created_at desc);
create unique index if not exists ad_rewards_nonce_idx on private.ad_rewards (player_id, nonce) where nonce is not null;

alter table public.inkborn_games add column if not exists doubled boolean not null default false;

create or replace function private.ads_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('ads'), '{}'::jsonb) $$;

create or replace function private.ads_today(p_player uuid) returns int language sql stable as $$
  select count(*)::int from private.ad_rewards where player_id = p_player and created_at >= private.day_start(now())
$$;

-- Ink an ad gives back counts as its own reason
create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured',
                                            'sketch', 'doodle', 'duet', 'stamp_sale', 'inkborn', 'ad_reward') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
      if r.key = 'ink' and p_reason <> 'ad_reward' then perform private.referral_share(p_player, r.amount, p_reason); end if;
    end if;
  end loop;
end $$;

-- Called only by the admob-ssv Edge Function after it has checked Google's signature.
create or replace function public.svc_ad_verified(p_player_id uuid, p_custom text, p_network text, p_transaction_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_parts text[] := string_to_array(coalesce(p_custom, ''), '|');
  v_reward text := v_parts[1]; v_ref text := nullif(v_parts[2], ''); v_nonce text := nullif(v_parts[3], '');
  cfg jsonb := private.ads_cfg(); rc jsonb; v_id bigint; v_res jsonb; c public.inkborn%rowtype; g public.inkborn_games%rowtype;
  j jsonb := coalesce(private.cfg('explorer') -> 'joystick', '{}'::jsonb); v_now jsonb; v_paid int;
begin
  if not private.flag('rewarded_ads') then raise exception 'ads_disabled' using errcode = 'P0001'; end if;
  if coalesce(p_network, '') = '' or coalesce(p_transaction_id, '') = '' then raise exception 'invalid_receipt' using errcode = 'P0001'; end if;
  -- the same callback twice is one reward
  if exists (select 1 from private.ad_rewards where network = left(p_network, 40) and transaction_id = left(p_transaction_id, 200)) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  rc := cfg -> 'rewards' -> v_reward;
  if rc is null or not coalesce((rc ->> 'enabled')::boolean, true) then raise exception 'unknown_reward' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.players where id = p_player_id and status = 'active') then raise exception 'invalid_player' using errcode = 'P0001'; end if;
  if private.ads_today(p_player_id) >= coalesce((cfg ->> 'daily_cap')::int, 20) then raise exception 'daily_ad_cap' using errcode = 'P0001'; end if;

  case v_reward
    when 'joystick_refill' then
      update public.explorers set joy_seconds = greatest(joy_seconds, coalesce((j ->> 'tank_seconds')::real, 600)), updated_at = now() where player_id = p_player_id;
      v_res := jsonb_build_object('refilled', true);
    when 'inkborn_energy' then
      select * into c from public.inkborn where id = v_ref::uuid and owner_id = p_player_id for update;
      if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
      v_now := private.inkborn_now(c);
      update public.inkborn set energy = least(100, (v_now ->> 'energy')::int + coalesce((rc ->> 'energy')::int, 40)), happiness = (v_now ->> 'happiness')::int,
             stats_at = now(), updated_at = now() where id = c.id returning * into c;
      v_res := jsonb_build_object('energy', c.energy);
    when 'job_rush' then
      update public.inkborn set job_until = now() where id = v_ref::uuid and owner_id = p_player_id and job is not null and job_until > now();
      if not found then raise exception 'reward_already_used' using errcode = 'P0001'; end if;
      v_res := jsonb_build_object('ready', true);
    when 'game_double' then
      select * into g from public.inkborn_games where id = v_ref::uuid and owner_id = p_player_id for update;
      if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
      if g.finished_at is null or g.doubled or coalesce(g.ink, 0) <= 0 then raise exception 'reward_already_used' using errcode = 'P0001'; end if;
      update public.inkborn_games set doubled = true where id = g.id;
      perform private.grant(p_player_id, jsonb_build_object('ink', g.ink), 'ad_reward', 'inkborn_game', g.id::text, 'addouble:' || g.id);
      v_res := jsonb_build_object('ink', g.ink);
    when 'spring_boost' then
      update public.habitats set spring_at = spring_at - make_interval(hours => coalesce((rc ->> 'hours')::int, 2))
       where id = v_ref::uuid and owner_id = p_player_id;
      if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
      v_res := jsonb_build_object('boosted_hours', coalesce((rc ->> 'hours')::int, 2));
    else raise exception 'unknown_reward' using errcode = 'P0001';
  end case;

  insert into private.ad_rewards (player_id, reward, network, transaction_id, ref, nonce, result)
  values (p_player_id, v_reward, left(p_network, 40), left(p_transaction_id, 200), v_ref, v_nonce, v_res)
  on conflict do nothing returning id into v_id;
  return jsonb_build_object('ok', true, 'reward', v_reward) || coalesce(v_res, '{}'::jsonb);
end $$;

-- The app asks "did my ad pay out yet?" (the callback usually lands a second or two after the ad).
create or replace function public.my_ad_reward(p_nonce text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('reward', reward, 'result', result, 'at', created_at)
  from private.ad_rewards where player_id = private.require_active_player() and nonce = p_nonce
$$;

create or replace function public.ad_status() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); cfg jsonb := private.ads_cfg();
begin
  return jsonb_build_object('enabled', private.flag('rewarded_ads'), 'used_today', private.ads_today(v_uid),
    'daily_cap', coalesce((cfg ->> 'daily_cap')::int, 20), 'rewards', coalesce(cfg -> 'rewards', '{}'::jsonb));
end $$;

-- ===== deleting your account ============================================================
-- Removes the player's personal data and sign-in. Plots go back to the world; published art
-- comes off the map. Ledger rows are kept without personal details for fraud and tax records.
create or replace function public.delete_my_account(p_confirm text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'confirm_delete' using errcode = 'P0001'; end if;
  -- money records must be settled by support first
  if exists (select 1 from public.cashout_requests where player_id = v_uid) or exists (select 1 from private.purchase_orders where player_id = v_uid) then
    raise exception 'account_has_payments' using errcode = 'P0001';
  end if;
  select username into v_name from public.profiles where id = v_uid;
  perform private.audit('account.delete', 'player', v_uid::text, jsonb_build_object('username', v_name));
  -- their plots go back to the world (unclaimed plots have no row), then the sign-in;
  -- everything else the player owns cascades from players / auth.users
  delete from public.world_plots where owner_id = v_uid;
  delete from auth.users where id = v_uid;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.my_ad_reward(text)', 'public.ad_status()', 'public.delete_my_account(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.svc_ad_verified(uuid, text, text, text) from public, anon, authenticated';
  execute 'grant execute on function public.svc_ad_verified(uuid, text, text, text) to service_role';
end $$;
