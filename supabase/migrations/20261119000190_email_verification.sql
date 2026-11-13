-- Every LANDVAS player confirms their email (Nov 2026).
--
-- Supabase marks an account "confirmed" in two ways: the player tapped the link in their sign-up email, or the
-- project had confirmation switched off when they joined (then it is set at sign-up and nobody ever proved the
-- address). LANDVAS counts only the first, plus any other email link the player has opened (a sign-in link, a
-- password reset, an email change): each one proves they can read that inbox.
--
--   * private.email_verified(uid)      — has this account proven its email?
--   * public.my_email_status()         — for the app's "Confirm your email" screen; also records a link the
--                                        current sign-in came from (the JWT's amr says how the session began)
--   * private.require_active_player()  — every game action now needs a confirmed email
--                                        (game_config.email_verification.required, on by default)
--   * referrals: an invite only pays out once the invited friend has confirmed their email; confirming later
--     pays anything they had already reached.

-- ---- who has proven their email ------------------------------------------------------------------------------------------
create table if not exists private.email_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now(),
  via text not null
);

insert into public.game_config (key, value, description) values ('email_verification', jsonb_build_object('required', true),
  'Players must confirm their email (tap a link from a LANDVAS email) before they can play. Turning this off lets unconfirmed accounts play again.')
on conflict (key) do nothing;

create or replace function private.email_check_required() returns boolean
language sql stable as $$ select coalesce((private.cfg('email_verification') ->> 'required')::boolean, true) $$;

create or replace function private.email_verified(p_uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_uid is not null and (
    exists (select 1 from private.email_verifications where user_id = p_uid)
    -- tapped the sign-up confirmation link: Supabase sent one and the account was confirmed after it
    or exists (select 1 from auth.users u where u.id = p_uid and u.email_confirmed_at is not null
                 and u.confirmation_sent_at is not null and u.email_confirmed_at >= u.confirmation_sent_at))
$$;

/** the email link this request's sign-in came from, if any (Supabase signs the JWT; the amr claim can't be forged) */
create or replace function private.jwt_email_link() returns text
language sql stable as $$
  select a ->> 'method'
    from jsonb_array_elements(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'amr', '[]'::jsonb)) a
   where jsonb_typeof(a) = 'object' and a ->> 'method' in ('otp', 'magiclink', 'email/signup', 'invite', 'recovery', 'email_change')
   limit 1
$$;

/** referral milestones the player had already reached, paid now that their email is confirmed */
create or replace function private.referral_requalify(p_uid uuid) returns void
language plpgsql as $$
begin
  if not exists (select 1 from public.referrals where referee_id = p_uid and status = 'pending') then return; end if;
  perform private.referral_qualify(p_uid, 'signup');
  if (select starter_plot_claimed from public.players where id = p_uid) then perform private.referral_qualify(p_uid, 'starter_plot'); end if;
  if exists (select 1 from public.minigame_rewards where player_id = p_uid and ink > 0 and not held) then
    perform private.referral_qualify(p_uid, 'first_win');
  end if;
end $$;

/** confirmed? If not yet, and this sign-in came from an email link, record it now (and pay waiting referral rewards). */
create or replace function private.email_verified_now(p_uid uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_via text;
begin
  if private.email_verified(p_uid) then return true; end if;
  v_via := private.jwt_email_link();
  if v_via is null or p_uid is distinct from auth.uid() then return false; end if;
  insert into private.email_verifications (user_id, via) values (p_uid, 'link:' || v_via) on conflict (user_id) do nothing;
  if exists (select 1 from public.players where id = p_uid) then perform private.referral_requalify(p_uid); end if;
  return true;
end $$;

-- ---- every game action needs a confirmed email ---------------------------------------------------------------------------
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
  if private.email_check_required() and not private.email_verified_now(v_uid) then
    raise exception 'email_not_verified' using errcode = 'P0001';
  end if;
  update public.players set last_active_at = now() where id = v_uid and last_active_at < now() - interval '5 minutes';
  return v_uid;
end $$;

-- ---- the app's "Confirm your email" screen --------------------------------------------------------------------------------
create or replace function public.my_email_status() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  return jsonb_build_object(
    'verified', private.email_verified_now(v_uid),
    'required', private.email_check_required(),
    'email', (select email from auth.users where id = v_uid));
end $$;

-- ---- referrals pay out only for friends who confirmed their email ---------------------------------------------------------
create or replace function private.referral_qualify(p_referee uuid, p_event text) returns void
language plpgsql as $$
declare
  r public.referrals%rowtype; v_cfg jsonb := coalesce(private.cfg('referrals'), '{}'::jsonb);
  v_reward int := coalesce((v_cfg ->> 'reward_ink')::int, 500); v_welcome int := coalesce((v_cfg ->> 'referee_reward_ink')::int, 0);
  v_today int;
begin
  select * into r from public.referrals where referee_id = p_referee and status = 'pending' for update;
  if not found then return; end if;
  if private.referral_rank(p_event) < private.referral_rank(coalesce(v_cfg ->> 'qualify', 'first_win')) then return; end if;
  -- the friend hasn't confirmed their email yet: stays pending (private.referral_requalify pays it once they do)
  if not private.email_verified(p_referee) then return; end if;
  if exists (select 1 from public.players where id = r.referrer_id and status = 'banned') then
    update public.referrals set status = 'void', qualified_at = now() where referee_id = p_referee;
    return;
  end if;
  select count(*) into v_today from public.referrals
   where referrer_id = r.referrer_id and status = 'rewarded' and qualified_at >= private.day_start(now());
  if v_today >= coalesce((v_cfg ->> 'daily_cap')::int, 25) then
    update public.referrals set status = 'capped', qualified_at = now() where referee_id = p_referee;
    return;
  end if;
  if v_reward > 0 then
    perform private.grant(r.referrer_id, jsonb_build_object('ink', v_reward), 'referral', 'player', p_referee::text, 'referral:' || p_referee::text);
  end if;
  if v_welcome > 0 then
    perform private.grant(p_referee, jsonb_build_object('ink', v_welcome), 'referral_welcome', 'player', r.referrer_id::text, 'referral_welcome');
  end if;
  update public.referrals set status = 'rewarded', reward_ink = v_reward, qualified_at = now() where referee_id = p_referee;
  insert into public.feed_events (kind, player_id, data) values ('referral', r.referrer_id, jsonb_build_object('reward_ink', v_reward));
end $$;

-- the inviter sees which friends still have to confirm their email
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
                'awaiting_email', count(*) filter (where status = 'pending' and not private.email_verified(referee_id)),
                'rewarded', count(*) filter (where status = 'rewarded'),
                'earned_ink', coalesce(sum(reward_ink) filter (where status = 'rewarded'), 0),
                'share_ink', coalesce(sum(share_ink), 0),
                'share_today', (select coalesce(sum(delta), 0) from public.resource_ledger
                                 where player_id = v_uid and resource = 'ink' and reason = 'referral_share' and created_at >= private.day_start(now())))
              from public.referrals where referrer_id = v_uid),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(r.referee_id), 'status', r.status,
                                                             'reward_ink', r.reward_ink, 'share_ink', r.share_ink,
                                                             'email_confirmed', private.email_verified(r.referee_id),
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

-- ---- players who already opened an email link before this existed ------------------------------------------------------
-- (Supabase keeps how each live session began; nothing to do where those tables don't exist, e.g. the local build)
do $$
begin
  insert into private.email_verifications (user_id, verified_at, via)
  select distinct on (s.user_id) s.user_id, c.created_at, 'earlier:' || c.authentication_method
    from auth.mfa_amr_claims c join auth.sessions s on s.id = c.session_id
   where c.authentication_method in ('otp', 'magiclink', 'email/signup', 'invite', 'recovery', 'email_change')
   order by s.user_id, c.created_at
  on conflict (user_id) do nothing;
exception when others then
  raise notice 'email verification: no earlier sign-ins to read (%)', sqlerrm;
end $$;

revoke all on table private.email_verifications from public, anon, authenticated;
revoke all on function public.my_email_status() from public, anon;
grant execute on function public.my_email_status() to authenticated, service_role;
revoke all on function private.email_verified(uuid) from public, anon, authenticated;
revoke all on function private.email_verified_now(uuid) from public, anon, authenticated;
revoke all on function private.referral_requalify(uuid) from public, anon, authenticated;
