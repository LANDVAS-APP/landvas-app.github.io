-- Account help (admin.landvas.app → a player → Account): staff fix a player's email and sign-in.
-- ---------------------------------------------------------------------------------------------------------------
-- The Edge Function `account-help` does the Supabase Auth part (sending the LANDVAS emails, changing the address,
-- one-time links) and these functions do the rest:
--
--   * public.admin_account(player)            — the Account tab: email, confirmation, sign-ins, devices, history
--   * public.admin_account_check(...)         — called by the function *as the staff member*: their role (and
--                                               two-step sign-in when required), limits, and the new address
--   * public.svc_account_done(...)            — service role only: what the action changes here, and the audit line
--
-- Who can do what:
--   send a password reset / sign-in link, sign out everywhere   moderators, support, admins, owner
--   change the email, mark it confirmed, ask to confirm again   admins and owner (a staff account's: owner only)
--   make a one-time link to copy                               owner only
--
-- "Ask them to confirm" (after an email change, or on its own): their game shows "Confirm your email" until they open
-- a LANDVAS email link sent from now on. Older proof doesn't count any more (private.email_rechecks).
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists private.email_rechecks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  since timestamptz not null default now(),
  by uuid,
  email text
);
revoke all on table private.email_rechecks from public, anon, authenticated;

-- ---- confirmation: proof from before a recheck doesn't count -----------------------------------------------------
create or replace function private.email_verified(p_uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_uid is not null and (
    exists (select 1 from private.email_verifications v where v.user_id = p_uid
             and not exists (select 1 from private.email_rechecks r where r.user_id = p_uid and r.since > v.verified_at))
    -- tapped the sign-up confirmation link: Supabase sent one and the account was confirmed after it
    or exists (select 1 from auth.users u where u.id = p_uid and u.email_confirmed_at is not null
                 and u.confirmation_sent_at is not null and u.email_confirmed_at >= u.confirmation_sent_at
                 and not exists (select 1 from private.email_rechecks r where r.user_id = p_uid and r.since > u.confirmation_sent_at)))
$$;

/** the email link this request's sign-in came from, if it was opened at or after p_since (null: any time) */
create or replace function private.jwt_email_link_since(p_since timestamptz) returns text
language sql stable as $$
  select a ->> 'method'
    from jsonb_array_elements(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'amr', '[]'::jsonb)) a
   where jsonb_typeof(a) = 'object' and a ->> 'method' in ('otp', 'magiclink', 'email/signup', 'invite', 'recovery', 'email_change')
     and (p_since is null or coalesce(nullif(a ->> 'timestamp', '')::numeric, 0) >= floor(extract(epoch from p_since)))
   limit 1
$$;

create or replace function private.email_verified_now(p_uid uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_via text;
begin
  if private.email_verified(p_uid) then return true; end if;
  if p_uid is null or p_uid is distinct from auth.uid() then return false; end if;
  v_via := private.jwt_email_link_since((select since from private.email_rechecks where user_id = p_uid));
  if v_via is null then return false; end if;
  insert into private.email_verifications (user_id, verified_at, via) values (p_uid, now(), 'link:' || v_via)
  on conflict (user_id) do update set verified_at = now(), via = excluded.via;
  delete from private.email_rechecks where user_id = p_uid;
  if exists (select 1 from public.players where id = p_uid) then perform private.referral_requalify(p_uid); end if;
  return true;
end $$;

-- ---- helpers ---------------------------------------------------------------------------------------------------------
create or replace function private.account_is_owner(p_uid uuid) returns boolean
language sql stable as $$ select exists (select 1 from public.admin_roles where player_id = p_uid and role = 'owner') $$;

/** what an action needs: 'staff' (moderators, support), 'admin' (admins, owner), 'owner' */
create or replace function private.account_action_level(p_action text) returns text
language sql immutable as $$
  select case p_action
    when 'send_reset' then 'staff' when 'send_link' then 'staff' when 'signout' then 'staff'
    when 'change_email' then 'admin' when 'confirm' then 'admin' when 'recheck' then 'admin'
    when 'make_link' then 'owner' end
$$;

/** a device someone is signed in on, in words ("iPhone · LANDVAS app", "Windows · Chrome") */
create or replace function private.account_device(p_ua text) returns text
language sql immutable as $$
  select case when p_ua is null or p_ua = '' then 'Unknown device' else
    concat_ws(' · ',
      case when p_ua ~* 'iphone' then 'iPhone' when p_ua ~* 'ipad' then 'iPad' when p_ua ~* 'android' then 'Android'
           when p_ua ~* 'windows' then 'Windows' when p_ua ~* 'mac os|macintosh' then 'Mac' when p_ua ~* 'cros' then 'Chromebook'
           when p_ua ~* 'linux' then 'Linux' else 'Other' end,
      case when p_ua ~* 'capacitor|landvas|; wv\)' then 'LANDVAS app' when p_ua ~* 'edg/' then 'Edge' when p_ua ~* 'opr/|opera' then 'Opera'
           when p_ua ~* 'firefox|fxios' then 'Firefox' when p_ua ~* 'crios|chrome' then 'Chrome' when p_ua ~* 'safari' then 'Safari'
           when p_ua ~* 'supabase|deno|node|okhttp|curl' then 'API' else null end)
  end
$$;

/** where each staff action leaves the player's confirmation */
create or replace function private.account_mark_confirmed(p_uid uuid, p_by uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into private.email_verifications (user_id, verified_at, via) values (p_uid, now(), 'staff')
  on conflict (user_id) do update set verified_at = now(), via = 'staff';
  delete from private.email_rechecks where user_id = p_uid;
  if exists (select 1 from public.players where id = p_uid) then perform private.referral_requalify(p_uid); end if;
end $$;

create or replace function private.account_recheck(p_uid uuid, p_by uuid, p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from private.email_verifications where user_id = p_uid;
  insert into private.email_rechecks (user_id, since, by, email) values (p_uid, now(), p_by, p_email)
  on conflict (user_id) do update set since = now(), by = excluded.by, email = excluded.email;
end $$;

/** end every sign-in this account has (each device is signed out when its sign-in next renews, within the hour) */
create or replace function private.account_sign_out(p_uid uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int := 0;
begin
  if to_regclass('auth.sessions') is null then return 0; end if; -- the local build has no sign-in tables
  execute 'select count(*)::int from auth.sessions where user_id = $1' into v_n using p_uid;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1::text' using p_uid;
  end if;
  execute 'delete from auth.sessions where user_id = $1' using p_uid;
  return v_n;
end $$;

-- ---- the Account tab ---------------------------------------------------------------------------------------------------
create or replace function public.admin_account(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me uuid := private.require_admin(array['moderator', 'support']);
  u jsonb; v_sessions jsonb := '[]'::jsonb; v_admin boolean; v_owner boolean; v_staff_target boolean;
begin
  select to_jsonb(x) into u from auth.users x where x.id = p_player;
  if u is null then raise exception 'player_not_found' using errcode = 'P0001'; end if;
  v_owner := private.account_is_owner(v_me);
  v_admin := v_owner or exists (select 1 from public.admin_roles where player_id = v_me and role = 'admin');
  v_staff_target := exists (select 1 from public.admin_roles where player_id = p_player);
  if to_regclass('auth.sessions') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'device', private.account_device(s ->> 'user_agent'),
               'started_at', s -> 'created_at',
               'active_at', coalesce(s -> 'refreshed_at', s -> 'updated_at', s -> 'created_at'),
               'two_step', s ->> 'aal' = 'aal2',
               'how', (select coalesce(jsonb_agg(distinct c ->> 'authentication_method'), '[]'::jsonb)
                         from (select to_jsonb(m) c from auth.mfa_amr_claims m where m.session_id = (s ->> 'id')::uuid) z))
             order by coalesce(s ->> 'refreshed_at', s ->> 'updated_at', s ->> 'created_at') desc), '[]'::jsonb)
        from (select to_jsonb(x) s from auth.sessions x where x.user_id = $1 order by x.created_at desc limit 25) t
    $q$ into v_sessions using p_player;
  end if;
  return jsonb_build_object(
    'id', p_player,
    'username', (select username from public.profiles where id = p_player),
    'email', u ->> 'email',
    'pending_email', nullif(u ->> 'email_change', ''),
    'has_password', coalesce(u ->> 'encrypted_password', '') <> '',
    'providers', coalesce(u -> 'raw_app_meta_data' -> 'providers', '[]'::jsonb),
    'auth_confirmed', (u ->> 'email_confirmed_at') is not null,
    'required', private.email_check_required(),
    'verified', private.email_verified(p_player),
    'verified_via', (select jsonb_build_object('via', via, 'at', verified_at) from private.email_verifications where user_id = p_player),
    'recheck', (select jsonb_build_object('since', r.since, 'email', r.email, 'by', (select username from public.profiles where id = r.by))
                  from private.email_rechecks r where r.user_id = p_player),
    'sent', jsonb_build_object('confirmation', u -> 'confirmation_sent_at', 'link', u -> 'recovery_sent_at', 'email_change', u -> 'email_change_sent_at'),
    'created_at', u -> 'created_at',
    'last_sign_in_at', u -> 'last_sign_in_at',
    'banned_until', u -> 'banned_until',
    'sessions', v_sessions,
    'staff_target', v_staff_target,
    'history', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'at', a.created_at, 'action', a.action, 'details', a.details,
                                                             'by', (select username from public.profiles where id = a.actor_id)) order by a.created_at desc), '[]'::jsonb)
                  from (select * from public.audit_logs where target_type = 'player' and target_id = p_player::text and action like 'account\_%'
                         order by created_at desc limit 30) a),
    'can', jsonb_build_object(
      'send', true, 'signout', true,
      'change', v_admin and (not v_staff_target or v_owner), 'confirm', v_admin and (not v_staff_target or v_owner),
      'link', v_owner));
end $$;

-- ---- the Edge Function's check, as the staff member ----------------------------------------------------------------------
create or replace function public.admin_account_check(p_player uuid, p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_level text := private.account_action_level(p_action);
  v_me uuid; v_email text; v_auth_confirmed boolean; v_new text; v_taken uuid; v_reason text := nullif(btrim(coalesce(p_args ->> 'reason', '')), '');
begin
  if v_level is null then raise exception 'invalid_action' using errcode = 'P0001'; end if;
  v_me := case v_level when 'owner' then private.portal_owner() when 'admin' then private.require_admin('{}') else private.require_admin(array['moderator', 'support']) end;
  select email, email_confirmed_at is not null into v_email, v_auth_confirmed from auth.users where id = p_player;
  if not found then raise exception 'player_not_found' using errcode = 'P0001'; end if;
  -- a staff account's email and confirmation: the owner only
  if v_level = 'admin' and exists (select 1 from public.admin_roles where player_id = p_player) and not private.account_is_owner(v_me) then
    raise exception 'forbidden' using errcode = 'P0001', detail = 'staff_account';
  end if;
  if v_level <> 'staff' and (v_reason is null or char_length(v_reason) < 3) then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then raise exception 'reason_too_long' using errcode = 'P0001'; end if;
  if p_action in ('send_reset', 'send_link', 'make_link', 'recheck') and coalesce(v_email, '') = '' then
    raise exception 'no_email' using errcode = 'P0001';
  end if;
  if p_action = 'change_email' then
    v_new := lower(btrim(coalesce(p_args ->> 'email', '')));
    if v_new !~ '^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$' or char_length(v_new) > 254 then raise exception 'email_invalid' using errcode = 'P0001'; end if;
    if v_new = lower(coalesce(v_email, '')) then raise exception 'email_same' using errcode = 'P0001'; end if;
    select id into v_taken from auth.users where lower(email) = v_new and id <> p_player limit 1;
    if v_taken is not null then
      raise exception 'email_taken' using errcode = 'P0001', detail = coalesce((select username from public.profiles where id = v_taken), v_taken::text);
    end if;
    if coalesce(p_args ->> 'then', 'link') not in ('link', 'confirmed') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
  end if;
  if p_action = 'make_link' and coalesce(p_args ->> 'kind', '') not in ('signin', 'reset') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
  perform private.rate_limit('account_help', 60, 3600);
  return jsonb_build_object('actor', v_me, 'email', v_email, 'auth_confirmed', v_auth_confirmed, 'new_email', v_new, 'reason', v_reason);
end $$;

-- ---- after the Auth part worked: the changes here and the audit line (service role only) -----------------------------------
create or replace function public.svc_account_done(p_actor uuid, p_player uuid, p_action text, p_details jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_out jsonb := '{}'::jsonb; v_n int; v_ink bigint;
begin
  if private.account_action_level(p_action) is null then raise exception 'invalid_action' using errcode = 'P0001'; end if;
  if p_action = 'confirm' then
    perform private.account_mark_confirmed(p_player, p_actor);
  elsif p_action = 'recheck' then
    perform private.account_recheck(p_player, p_actor, (select email from auth.users where id = p_player));
  elsif p_action = 'change_email' then
    if coalesce(p_details ->> 'then', 'link') = 'confirmed' then perform private.account_mark_confirmed(p_player, p_actor);
    else perform private.account_recheck(p_player, p_actor, p_details ->> 'to'); end if;
    -- a Fresh Start credit waiting for the new address is theirs now
    if to_regprocedure('private.temp_credit_claim(uuid)') is not null then
      execute 'select private.temp_credit_claim($1)' into v_ink using p_player;
      if coalesce(v_ink, 0) > 0 then v_out := v_out || jsonb_build_object('fresh_start_ink', v_ink); p_details := p_details || jsonb_build_object('fresh_start_ink', v_ink); end if;
    end if;
  elsif p_action = 'signout' then
    v_n := private.account_sign_out(p_player);
    v_out := v_out || jsonb_build_object('sessions', v_n);
    p_details := p_details || jsonb_build_object('sessions', v_n);
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_actor, 'account_' || p_action, 'player', p_player::text, coalesce(p_details, '{}'::jsonb) - 'link');
  return v_out || jsonb_build_object('verified', private.email_verified(p_player));
end $$;

revoke all on function public.admin_account(uuid) from public, anon;
grant execute on function public.admin_account(uuid) to authenticated;
revoke all on function public.admin_account_check(uuid, text, jsonb) from public, anon;
grant execute on function public.admin_account_check(uuid, text, jsonb) to authenticated;
revoke all on function public.svc_account_done(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.svc_account_done(uuid, uuid, text, jsonb) to service_role;
revoke all on function private.jwt_email_link_since(timestamptz) from public, anon, authenticated;
revoke all on function private.account_mark_confirmed(uuid, uuid) from public, anon, authenticated;
revoke all on function private.account_recheck(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.account_sign_out(uuid) from public, anon, authenticated;
