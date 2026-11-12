-- Integrity: a cheat and abuse scanner.
--
-- 1. Signals. Each app session reports a device id (random, per install), a browser/device fingerprint hash, platform,
--    timezone and emulator/automation checks; the server adds the network: the IP address is never stored, only a salted
--    hash of it and of its /24 network, plus its country, provider (ASN) and whether it's a VPN, proxy, Tor or datacenter.
-- 2. The scanner looks for patterns across everything players do and scores each player 0–100 with the evidence:
--    accounts sharing devices, fingerprints or networks (multi-accounting) — and whether those accounts feed each other
--    Ink; self-referrals (shared devices/networks, look-alike or throwaway emails, referred accounts that only play to
--    qualify, sign-up bursts, plots claimed right next to the referrer's); impossible speed (wins far faster than
--    everyone else, flagged runs, bot-steady timing, 18+ hour days); Ink rings (votes, visits, inspires, stamps, playdates,
--    arcade/realm plays concentrated among a few linked or throwaway accounts); VPN/proxy/Tor/datacenter use, country
--    hopping, impossible travel, and plots claimed in countries their network never is; emulators and automation.
-- 3. Nothing happens automatically. An admin reviews and acts: suspend or ban with a preset or custom reason and proof,
--    remove the Ink gained by abuse and the plots bought with it. Every action is recorded and can be undone (the Ink,
--    including what removed plots cost, goes back). A restricted player sees why, the proof, and where to appeal.

-- ---- secrets and settings ---------------------------------------------------------------------------------------------
create table if not exists private.integrity_secret (id int primary key default 1 check (id = 1), salt text not null);
insert into private.integrity_secret (id, salt) values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) on conflict do nothing;

insert into public.game_config (key, value, description) values ('integrity', jsonb_build_object(
  'appeal_email', 'dev@landvas.app',
  'presets', jsonb_build_array(
    jsonb_build_object('id', 'self_referral', 'label', 'Self-referral', 'text', 'You invited accounts you control to collect invite bonuses.'),
    jsonb_build_object('id', 'multi_account', 'label', 'Multiple accounts', 'text', 'You used several accounts to gain Ink, plots or rewards.'),
    jsonb_build_object('id', 'ink_ring', 'label', 'Ink farming between accounts', 'text', 'Accounts were used to send each other Ink through votes, visits, inspires, stamps or plays.'),
    jsonb_build_object('id', 'bot', 'label', 'Bots or automation', 'text', 'Your play shows automated or scripted activity.'),
    jsonb_build_object('id', 'speed', 'label', 'Impossible results', 'text', 'Your minigame results were faster or more perfect than humanly possible.'),
    jsonb_build_object('id', 'gps', 'label', 'Location spoofing', 'text', 'You faked your location to claim plots.'),
    jsonb_build_object('id', 'emulator', 'label', 'Emulators or modified apps', 'text', 'You played through an emulator or a modified app to gain an advantage.'),
    jsonb_build_object('id', 'other', 'label', 'Other', 'text', '')),
  'ip_lookup', true),
  'Integrity: appeal email, ban/suspension reason presets, and whether network (VPN/datacenter) lookups run.')
on conflict (key) do nothing;

-- ---- signals ----------------------------------------------------------------------------------------------------------
create table if not exists private.ip_intel (
  ip_hash text primary key, net_hash text, country text, asn int, as_org text,
  is_vpn boolean, is_proxy boolean, is_tor boolean, is_datacenter boolean, is_mobile boolean,
  source text, checked_at timestamptz not null default now());

create table if not exists private.sightings (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  day date not null default current_date,
  device_id text, fp_hash text, ip_hash text, net_hash text,
  platform text, tz text, lang text, ua text, gpu text,
  emulator boolean not null default false, automation boolean not null default false, reasons text[] not null default '{}',
  first_at timestamptz not null default now(), last_at timestamptz not null default now(), hits int not null default 1);
create unique index if not exists sightings_key on private.sightings (player_id, day, coalesce(device_id, ''), coalesce(fp_hash, ''), coalesce(ip_hash, ''));
create index if not exists sightings_device on private.sightings (device_id) where device_id is not null;
create index if not exists sightings_fp on private.sightings (fp_hash) where fp_hash is not null;
create index if not exists sightings_ip on private.sightings (ip_hash) where ip_hash is not null;
create index if not exists sightings_net on private.sightings (net_hash) where net_hash is not null;
create index if not exists sightings_player on private.sightings (player_id, last_at desc);

create table if not exists private.integrity_scores (
  player_id uuid primary key references public.players (id) on delete cascade,
  score int not null, level text not null, signals jsonb not null default '[]'::jsonb, linked jsonb not null default '[]'::jsonb,
  scanned_at timestamptz not null default now());
create index if not exists integrity_scores_rank on private.integrity_scores (score desc);

create table if not exists private.integrity_baseline (id int primary key default 1 check (id = 1), data jsonb not null, at timestamptz not null default now());

create table if not exists public.integrity_actions (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  admin_id uuid references public.players (id) on delete set null,
  kind text not null check (kind in ('suspend', 'ban', 'warn', 'lift')),
  until timestamptz, preset text, reason text, proof jsonb not null default '[]'::jsonb,
  ink_removed bigint not null default 0, plots_removed jsonb not null default '[]'::jsonb, plots_ink bigint not null default 0,
  group_id uuid, created_at timestamptz not null default now(), undone_at timestamptz, undone_by uuid);
create index if not exists integrity_actions_player on public.integrity_actions (player_id, created_at desc);
create index if not exists integrity_actions_admin on public.integrity_actions (admin_id) where admin_id is not null;
alter table public.integrity_actions enable row level security;
revoke all on public.integrity_actions from anon, authenticated;

-- ---- hashing ----------------------------------------------------------------------------------------------------------
create or replace function private.ihash(p text) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when p is null or p = '' then null else left(encode(sha256(convert_to((select salt from private.integrity_secret where id = 1) || ':' || p, 'UTF8')), 'hex'), 32) end
$$;
/** the network an address belongs to: /24 for IPv4, /48 for IPv6 */
create or replace function private.inet_net(p_ip text) returns text language sql immutable as $$
  select case when p_ip is null then null
              when p_ip ~ '^\d+\.\d+\.\d+\.\d+$' then regexp_replace(p_ip, '\.\d+$', '.0/24')
              when position(':' in p_ip) > 0 then array_to_string((string_to_array(p_ip, ':'))[1:3], ':') || '::/48'
              else p_ip end
$$;
/** the caller's address, from the request (PostgREST forwards the headers) */
create or replace function private.request_ip() returns text language plpgsql stable as $$
declare h jsonb; v text;
begin
  begin h := current_setting('request.headers', true)::jsonb; exception when others then h := null; end;
  if h is null then return null; end if;
  v := coalesce(h ->> 'cf-connecting-ip', split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1), h ->> 'x-real-ip');
  v := nullif(trim(v), '');
  return case when v ~ '^[0-9a-fA-F:.]{3,45}$' then v end;
end $$;

-- ---- recording a session ----------------------------------------------------------------------------------------------
create or replace function private.integrity_record(p_uid uuid, p_ip text, p_signals jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s jsonb := coalesce(p_signals, '{}'::jsonb); v_ip text := private.ihash(p_ip); v_net text := private.ihash(private.inet_net(p_ip));
  v_dev text := left(nullif(s ->> 'device_id', ''), 64); v_fp text := left(nullif(s ->> 'fp', ''), 64);
  v_reasons text[] := coalesce((select array_agg(left(x, 60)) from (select jsonb_array_elements_text(coalesce(s -> 'reasons', '[]'::jsonb)) x limit 12) r), '{}');
  v_known boolean; v_last timestamptz;
begin
  if p_uid is null then return '{}'::jsonb; end if;
  insert into private.sightings (player_id, device_id, fp_hash, ip_hash, net_hash, platform, tz, lang, ua, gpu, emulator, automation, reasons)
  values (p_uid, v_dev, v_fp, v_ip, v_net, left(s ->> 'platform', 20), left(s ->> 'tz', 60), left(s ->> 'lang', 20), left(s ->> 'ua', 300), left(s ->> 'gpu', 120),
          coalesce((s ->> 'emulator')::boolean, false), coalesce((s ->> 'automation')::boolean, false), v_reasons)
  on conflict (player_id, day, coalesce(device_id, ''), coalesce(fp_hash, ''), coalesce(ip_hash, ''))
  do update set last_at = now(), hits = private.sightings.hits + 1,
                emulator = private.sightings.emulator or excluded.emulator, automation = private.sightings.automation or excluded.automation,
                reasons = (select array(select distinct unnest(private.sightings.reasons || excluded.reasons) limit 12));
  select exists (select 1 from private.ip_intel where ip_hash = v_ip and checked_at > now() - interval '7 days') into v_known;
  -- rescan this player now and then (at most hourly) so the admin list stays fresh
  select scanned_at into v_last from private.integrity_scores where player_id = p_uid;
  if v_last is null or v_last < now() - interval '1 hour' then perform private.integrity_scan_save(p_uid); end if;
  return jsonb_build_object('lookup', v_ip is not null and not v_known and coalesce((private.cfg('integrity') ->> 'ip_lookup')::boolean, true));
end $$;

/** the app reports a session (direct call; the network comes from the request headers) */
create or replace function public.integrity_ping(p_signals jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid();
begin
  if v_uid is null or not exists (select 1 from public.players where id = v_uid) then return '{}'::jsonb; end if;
  perform private.rate_limit('integrity_ping', 120, 3600);
  return private.integrity_record(v_uid, private.request_ip(), p_signals);
end $$;
/** the integrity Edge Function reports a session with the caller's real address (service role only) */
create or replace function public.svc_integrity_ping(p_player uuid, p_ip text, p_signals jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.players where id = p_player) then return '{}'::jsonb; end if;
  return private.integrity_record(p_player, p_ip, p_signals);
end $$;
/** …and what it learned about the address (VPN, proxy, Tor, datacenter, country, provider) */
create or replace function public.svc_integrity_intel(p_ip text, p_intel jsonb) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare i jsonb := coalesce(p_intel, '{}'::jsonb);
begin
  if p_ip is null then return; end if;
  insert into private.ip_intel (ip_hash, net_hash, country, asn, as_org, is_vpn, is_proxy, is_tor, is_datacenter, is_mobile, source, checked_at)
  values (private.ihash(p_ip), private.ihash(private.inet_net(p_ip)), upper(left(i ->> 'country', 2)), nullif(i ->> 'asn', '')::int, left(i ->> 'as_org', 120),
          (i ->> 'vpn')::boolean, (i ->> 'proxy')::boolean, (i ->> 'tor')::boolean, (i ->> 'datacenter')::boolean, (i ->> 'mobile')::boolean, left(i ->> 'source', 30), now())
  on conflict (ip_hash) do update set net_hash = excluded.net_hash, country = excluded.country, asn = excluded.asn, as_org = excluded.as_org,
    is_vpn = excluded.is_vpn, is_proxy = excluded.is_proxy, is_tor = excluded.is_tor, is_datacenter = excluded.is_datacenter,
    is_mobile = excluded.is_mobile, source = excluded.source, checked_at = now();
end $$;

-- ---- emails ----------------------------------------------------------------------------------------------------------
/** one mailbox, however it's written: gmail ignores dots and +tags, most providers ignore +tags */
create or replace function private.email_norm(p text) returns text language sql immutable as $$
  select case when p is null or position('@' in p) = 0 then lower(p) else
    (case when lower(split_part(p, '@', 2)) in ('gmail.com', 'googlemail.com') then replace(split_part(lower(split_part(p, '@', 1)), '+', 1), '.', '')
          else split_part(lower(split_part(p, '@', 1)), '+', 1) end)
    || '@' || case lower(split_part(p, '@', 2)) when 'googlemail.com' then 'gmail.com' else lower(split_part(p, '@', 2)) end end
$$;
/** the name part without digits and separators: "john.smith42" and "johnsmith7" share "johnsmith" */
create or replace function private.email_stem(p text) returns text language sql immutable as $$
  select nullif(regexp_replace(split_part(private.email_norm(p), '@', 1), '[^a-z]', '', 'g'), '')
$$;
create or replace function private.email_disposable(p text) returns boolean language sql immutable as $$
  select lower(split_part(coalesce(p, ''), '@', 2)) = any (array['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', 'temp-mail.org',
    'tempmail.com', 'tempmail.net', 'throwawaymail.com', 'yopmail.com', 'yopmail.net', 'getnada.com', 'nada.email', 'trashmail.com', 'maildrop.cc', 'dispostable.com',
    'fakeinbox.com', 'mailnesia.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'tempail.com', 'tmpmail.org', 'tmpmail.net', 'burnermail.io', 'spamgourmet.com',
    'mail.tm', 'tempr.email', 'discard.email', 'mailpoof.com', 'inboxkitten.com', 'emailfake.com', 'moakt.com', 'temp-mail.io', 'dropmail.me', 'grr.la', 'spam4.me',
    'byom.de', 'trbvm.com', 'cuvox.de', 'armyspy.com', 'dayrep.com', 'einrot.com', 'fleckens.hu', 'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com', 'teleworm.us'])
$$;

-- ---- who's linked to whom ---------------------------------------------------------------------------------------------
/** accounts that share a device, fingerprint, address or network with a player, and how */
create or replace function private.integrity_links(p_uid uuid) returns table (other uuid, via text, n int, last_at timestamptz) language sql stable security definer set search_path = public, pg_temp as $$
  with mine as (select device_id, fp_hash, ip_hash, net_hash, day from private.sightings where player_id = p_uid and last_at > now() - interval '90 days')
  select o.player_id, 'device', count(*)::int, max(o.last_at) from private.sightings o join (select distinct device_id from mine where device_id is not null) m on m.device_id = o.device_id
    where o.player_id <> p_uid group by 1
  union all
  select o.player_id, 'fingerprint', count(*)::int, max(o.last_at) from private.sightings o join (select distinct fp_hash from mine where fp_hash is not null) m on m.fp_hash = o.fp_hash
    where o.player_id <> p_uid group by 1
  union all
  select o.player_id, 'ip', count(*)::int, max(o.last_at) from private.sightings o join (select distinct ip_hash, day from mine where ip_hash is not null) m on m.ip_hash = o.ip_hash and abs(o.day - m.day) <= 3
    where o.player_id <> p_uid group by 1
  union all
  select o.player_id, 'network', count(*)::int, max(o.last_at) from private.sightings o join (select distinct net_hash, day from mine where net_hash is not null) m on m.net_hash = o.net_hash and o.day = m.day
    where o.player_id <> p_uid group by 1
$$;

/** Ink that one player's actions paid another (who helped whom), over 90 days: votes, visits, inspires, stamps, playdates,
 * arcade and realm plays, duets and invites */
create or replace function private.integrity_inflows(p_uid uuid) returns table (giver uuid, kind text, times int, ink bigint) language sql stable security definer set search_path = public, pg_temp as $$
  select giver_id, 'inspire', count(*)::int, coalesce(sum(artist_ink), 0) from public.inspire_rewards where artist_id = p_uid and created_at > now() - interval '90 days' group by 1
  union all select visitor_id, 'room visit', count(*)::int, coalesce(sum(host_ink), 0) from public.room_checkins where host_id = p_uid and created_at > now() - interval '90 days' group by 1
  union all select s.collector_id, 'stamp', count(*)::int, coalesce(sum(s.artist_ink), 0) from public.stamps s join public.artwork_publications a on a.id = s.publication_id
            where a.owner_id = p_uid and s.created_at > now() - interval '90 days' group by 1
  union all select v.voter_id, 'sketch vote', count(*)::int, 0 from public.sketch_votes v join public.sketches k on k.id = v.sketch_id
            where k.player_id = p_uid and v.created_at > now() - interval '90 days' group by 1
  union all select v.voter_id, 'challenge vote', count(*)::int, 0 from public.challenge_votes v join public.artwork_publications a on a.id = v.publication_id
            where a.owner_id = p_uid and v.created_at > now() - interval '90 days' group by 1
  union all select guest_id, 'playdate', count(*)::int, 0 from public.inkborn_playdates where host_id = p_uid and started_at > now() - interval '90 days' group by 1
  union all select p.player_id, 'arcade play', count(*)::int, coalesce(sum(p.ink), 0) / 10 from public.arcade_plays p join public.arcades a on a.id = p.arcade_id
            where a.owner_id = p_uid and p.player_id <> p_uid and p.started_at > now() - interval '90 days' group by 1
  union all select coalesce(bottom_id, top_id), 'duet', count(*)::int, 0 from public.duets where (top_id = p_uid or bottom_id = p_uid) and status = 'done' and created_at > now() - interval '90 days'
            and coalesce(bottom_id, top_id) <> p_uid group by 1
  union all select referee_id, 'invite', 1, reward_ink::bigint from public.referrals where referrer_id = p_uid and status in ('rewarded', 'capped')
$$;

-- ---- population baseline (refreshed hourly at most) -------------------------------------------------------------------
create or replace function private.integrity_baseline_get() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare b jsonb; v_at timestamptz;
begin
  select data, at into b, v_at from private.integrity_baseline where id = 1;
  if b is not null and v_at > now() - interval '1 hour' then return b; end if;
  with e as (select player_id, date_trunc('day', created_at) d, sum(delta) ink from public.resource_ledger
             where resource = 'ink' and delta > 0 and created_at > now() - interval '30 days' and private.guide_play_reason(reason) group by 1, 2)
  select jsonb_build_object(
    'day_p99', (select percentile_cont(0.99) within group (order by ink) from e),
    'day_p995', (select percentile_cont(0.995) within group (order by ink) from e),
    -- a typical player's time to win, per game and level band: the median of each player's median, so one player (or
    -- one cheater) can't move it; only bands with at least 3 players count
    'typical', (select coalesce(jsonb_object_agg(k, med), '{}'::jsonb) from (
              select k, percentile_cont(0.5) within group (order by pm) med from (
                select player_id, game || ':' || least(level / 10, 6) k, percentile_cont(0.5) within group (order by play_ms) pm
                from public.minigame_sessions where passed and play_ms between 1000 and 1800000 and started_at > now() - interval '30 days' group by 1, 2 having count(*) >= 3) pp
              group by k having count(*) >= 3) x)) into b;
  insert into private.integrity_baseline (id, data, at) values (1, b, now()) on conflict (id) do update set data = excluded.data, at = now();
  return b;
end $$;


-- ---- the scan ---------------------------------------------------------------------------------------------------------
create or replace function private.isig(p_key text, p_points numeric, p_severity text, p_label text, p_evidence jsonb default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('key', p_key, 'points', round(p_points), 'severity', p_severity, 'label', p_label, 'evidence', coalesce(p_evidence, '[]'::jsonb))
$$;

create or replace function private.integrity_scan(p_uid uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig jsonb := '[]'::jsonb; b jsonb := private.integrity_baseline_get();
  v_email text; v_created timestamptz; v_linked jsonb; v_strong uuid[]; v_n int; v_m int; v_k int; v_x numeric; v_y numeric; v_list jsonb; v_t text;
  rf_total int; rf_rew int; rf_linked int; rf_look int; rf_disp int; rf_dormant int; rf_burst int; rf_list jsonb; rf_near int; rf_plotted int;
  v_score numeric; v_level text;
begin
  select email, created_at into v_email, v_created from auth.users where id = p_uid;

  -- who shares a device, fingerprint, address or network with them
  select coalesce(jsonb_agg(jsonb_build_object('id', l.other, 'username', pr.username, 'via', to_jsonb(l.vias), 'n', l.n, 'status', pl.status) order by l.strength desc, l.n desc), '[]'::jsonb)
    into v_linked
  from (select other, array_agg(distinct via) vias, sum(n)::int n, max(case via when 'device' then 4 when 'fingerprint' then 3 when 'ip' then 2 else 1 end) strength
        from private.integrity_links(p_uid) group by other) l
  join public.profiles pr on pr.id = l.other join public.players pl on pl.id = l.other;
  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_strong from jsonb_array_elements(v_linked) x where x -> 'via' ?| array['device', 'fingerprint', 'ip'];

  -- 1. multi-accounting
  select count(*), coalesce(jsonb_agg(x ->> 'username'), '[]'::jsonb) into v_n, v_list from jsonb_array_elements(v_linked) x where x -> 'via' ? 'device';
  if v_n > 0 then sig := sig || private.isig('shared_device', least(20 + 12 * v_n, 50), case when v_n >= 2 then 'severe' else 'high' end,
      format('Plays on the same device as %s other account%s', v_n, case when v_n = 1 then '' else 's' end), v_list); end if;
  select count(*), coalesce(jsonb_agg(x ->> 'username'), '[]'::jsonb) into v_n, v_list from jsonb_array_elements(v_linked) x where x -> 'via' ? 'fingerprint' and not x -> 'via' ? 'device';
  if v_n > 0 then sig := sig || private.isig('shared_fingerprint', least(8 * v_n, 24), case when v_n >= 3 then 'high' else 'watch' end,
      format('Same browser/device fingerprint as %s other account%s', v_n, case when v_n = 1 then '' else 's' end), v_list); end if;
  select count(*), coalesce(jsonb_agg(x ->> 'username'), '[]'::jsonb) into v_n, v_list from jsonb_array_elements(v_linked) x where x -> 'via' ? 'ip' and not x -> 'via' ?| array['device', 'fingerprint'];
  if v_n >= 2 then sig := sig || private.isig('shared_ip', least(4 * v_n, 20), case when v_n >= 5 then 'high' else 'watch' end,
      format('Same internet address (within a few days) as %s other accounts', v_n), v_list); end if;

  -- 2. linked accounts feeding them Ink
  select count(*), coalesce(jsonb_agg(jsonb_build_object('username', pr.username, 'kinds', to_jsonb(f.kinds), 'times', f.times, 'ink', f.ink) order by f.ink desc), '[]'::jsonb)
    into v_n, v_list
  from (select giver, array_agg(distinct kind) kinds, sum(times)::int times, sum(ink) ink from private.integrity_inflows(p_uid) group by giver) f
  join public.profiles pr on pr.id = f.giver where f.giver = any (v_strong);
  if v_n > 0 then sig := sig || private.isig('linked_inflows', least(25 + 10 * v_n, 45), 'severe',
      format('%s account%s on their device or address helped them earn (votes, visits, inspires, stamps, plays, invites)', v_n, case when v_n = 1 then '' else 's' end), v_list); end if;
  -- …and the other way round: they were invited by, or feed, a linked account
  if exists (select 1 from public.referrals where referee_id = p_uid and referrer_id = any (v_strong)) then
    sig := sig || private.isig('invited_by_linked', 25, 'high', 'Was invited by an account on their own device or address',
      (select jsonb_agg(pr.username) from public.referrals r join public.profiles pr on pr.id = r.referrer_id where r.referee_id = p_uid));
  end if;

  -- 3. invites
  with refs as (
    select r.referee_id id, r.status, r.created_at, r.qualified_at, r.reward_ink, u.email, pr.username, pl.last_active_at, pl.status pstatus,
           private.email_norm(u.email) en, private.email_stem(u.email) es, private.email_disposable(u.email) disp,
           (select count(*) from public.minigame_sessions s where s.player_id = r.referee_id) plays,
           (select max(l.created_at) from public.resource_ledger l where l.player_id = r.referee_id and l.resource = 'ink' and l.delta > 0) last_earn
    from public.referrals r join auth.users u on u.id = r.referee_id join public.profiles pr on pr.id = r.referee_id join public.players pl on pl.id = r.referee_id
    where r.referrer_id = p_uid)
  select count(*), count(*) filter (where status in ('rewarded', 'capped')),
         count(*) filter (where id = any (v_strong)),
         count(*) filter (where en = private.email_norm(v_email) or (es is not null and length(es) >= 4 and es = private.email_stem(v_email))),
         count(*) filter (where disp),
         count(*) filter (where status in ('rewarded', 'capped') and created_at < now() - interval '3 days'
                          and (last_earn is null or last_earn < coalesce(qualified_at, created_at) + interval '2 days')),
         coalesce((select max(c) from (select count(*) c from refs group by date_trunc('hour', created_at)) z), 0),
         coalesce(jsonb_agg(jsonb_build_object('username', username, 'email', email, 'status', status, 'account', pstatus, 'joined', created_at, 'plays', plays,
                   'last_active', last_active_at, 'reward_ink', reward_ink, 'disposable', disp, 'linked', id = any (v_strong),
                   'lookalike', en = private.email_norm(v_email) or (es is not null and length(es) >= 4 and es = private.email_stem(v_email))) order by created_at desc), '[]'::jsonb)
    into rf_total, rf_rew, rf_linked, rf_look, rf_disp, rf_dormant, rf_burst, rf_list
  from refs;
  -- invited accounts with the same email under another name, among themselves
  if rf_total >= 2 then
    select coalesce(sum(c) filter (where c > 1), 0) into v_k from (
      select count(*) c from public.referrals r join auth.users u on u.id = r.referee_id
      where r.referrer_id = p_uid and private.email_stem(u.email) is not null and length(private.email_stem(u.email)) >= 4 group by private.email_stem(u.email)) z;
  else v_k := 0; end if;
  if rf_linked > 0 then sig := sig || private.isig('self_referral_device', least(20 + 10 * rf_linked, 45), 'severe',
      format('%s invited account%s use%s their own device or address', rf_linked, case when rf_linked = 1 then '' else 's' end, case when rf_linked = 1 then 's' else '' end),
      (select jsonb_agg(x) from jsonb_array_elements(rf_list) x where (x ->> 'linked')::boolean)); end if;
  if rf_look > 0 or v_k >= 2 then sig := sig || private.isig('self_referral_email', least(15 + 8 * (rf_look + v_k), 35), 'high',
      format('Look-alike emails: %s invited account%s match their own email, %s match each other', rf_look, case when rf_look = 1 then '' else 's' end, v_k),
      (select jsonb_agg(x) from jsonb_array_elements(rf_list) x where (x ->> 'lookalike')::boolean)); end if;
  if rf_disp > 0 then sig := sig || private.isig('disposable_referrals', least(6 * rf_disp, 20), case when rf_disp >= 3 then 'high' else 'watch' end,
      format('%s invited account%s signed up with throwaway email addresses', rf_disp, case when rf_disp = 1 then '' else 's' end),
      (select jsonb_agg(x) from jsonb_array_elements(rf_list) x where (x ->> 'disposable')::boolean)); end if;
  if rf_rew >= 3 and rf_dormant::numeric / rf_rew >= 0.6 then sig := sig || private.isig('dormant_referrals', 20, 'high',
      format('%s of %s invited accounts stopped earning within 2 days of unlocking the invite bonus', rf_dormant, rf_rew), rf_list); end if;
  if rf_burst >= 3 then sig := sig || private.isig('referral_burst', least(10 + 3 * (rf_burst - 3), 25), case when rf_burst >= 5 then 'high' else 'watch' end,
      format('%s accounts joined with their invite code within one hour', rf_burst)); end if;
  -- invited accounts claiming plots right next to theirs (about 300 m)
  if rf_total >= 2 then
    select count(*) filter (where near), count(*) into rf_near, rf_plotted from (
      select r.referee_id, exists (select 1 from public.world_plots a, public.world_plots p
                                   where a.owner_id = r.referee_id and p.owner_id = p_uid and abs(a.gx - p.gx) <= 30 and abs(a.gy - p.gy) <= 30) near
      from public.referrals r where r.referrer_id = p_uid and exists (select 1 from public.world_plots w where w.owner_id = r.referee_id)) z;
    if rf_near >= 2 and rf_near::numeric / greatest(rf_plotted, 1) >= 0.6 then sig := sig || private.isig('referral_plots_near', 15, 'watch',
        format('%s of %s invited accounts with land claimed it right next to theirs', rf_near, rf_plotted)); end if;
  end if;
  if private.email_disposable(v_email) then sig := sig || private.isig('disposable_email', 8, 'watch', 'Signed up with a throwaway email address', jsonb_build_array(split_part(v_email, '@', 2))); end if;

  -- 4. impossible speed and flagged runs (last 30 days)
  select count(*) filter (where b -> 'typical' ? (s.game || ':' || least(s.level / 10, 6))),
         count(*) filter (where s.play_ms < 0.3 * (b -> 'typical' ->> (s.game || ':' || least(s.level / 10, 6)))::numeric)
    into v_n, v_m
  from public.minigame_sessions s where s.player_id = p_uid and s.passed and s.started_at > now() - interval '30 days' and s.play_ms > 0;
  if v_n >= 10 and v_m::numeric / v_n >= 0.3 then
    sig := sig || private.isig('impossible_speed', least(15 + 30 * v_m::numeric / v_n, 40), case when v_m::numeric / v_n >= 0.6 then 'severe' else 'high' end,
      format('%s of %s wins took under a third of a typical player''s time', v_m, v_n),
      (select jsonb_agg(jsonb_build_object('game', game, 'level', level, 'seconds', round(play_ms / 1000.0, 1),
                 'typical_seconds', round((b -> 'typical' ->> (game || ':' || least(level / 10, 6)))::numeric / 1000.0, 1))) from (
         select * from public.minigame_sessions s where s.player_id = p_uid and s.passed and s.started_at > now() - interval '30 days'
           and s.play_ms < 0.3 * (b -> 'typical' ->> (s.game || ':' || least(s.level / 10, 6)))::numeric order by s.play_ms limit 8) e));
  end if;
  select count(*) into v_n from public.minigame_sessions s where s.player_id = p_uid and s.started_at > now() - interval '30 days'
    and (coalesce(array_length(s.flags, 1), 0) > 0 or s.review_status in ('flagged', 'voided'));
  if v_n >= 3 then sig := sig || private.isig('flagged_runs', least(5 * v_n, 25), case when v_n >= 6 then 'high' else 'watch' end,
      format('%s minigame runs were flagged by the server checks in 30 days', v_n),
      (select jsonb_agg(jsonb_build_object('game', game, 'level', level, 'flags', flags, 'review', review_status)) from (
         select * from public.minigame_sessions s where s.player_id = p_uid and s.started_at > now() - interval '30 days'
           and (coalesce(array_length(s.flags, 1), 0) > 0 or s.review_status in ('flagged', 'voided')) order by s.started_at desc limit 8) e)); end if;

  -- 5. bot-like play: 18+ hours in a day, or machine-steady timing between plays
  select max(h) into v_n from (select count(distinct date_trunc('hour', created_at)) h from public.resource_ledger
    where player_id = p_uid and resource = 'ink' and delta > 0 and created_at > now() - interval '30 days' group by date_trunc('day', created_at)) z;
  if coalesce(v_n, 0) >= 18 then sig := sig || private.isig('no_sleep', 25, 'high', format('Earned Ink in %s different hours of a single day', v_n)); end if;
  with t as (select started_at from public.minigame_sessions where player_id = p_uid and started_at > now() - interval '14 days'
             union all select started_at from public.arcade_plays where player_id = p_uid and started_at > now() - interval '14 days'),
       g as (select extract(epoch from started_at - lag(started_at) over (order by started_at)) gap from t)
  select count(*), stddev_samp(gap) / nullif(avg(gap), 0) into v_n, v_x from g where gap between 2 and 600;
  if v_n >= 40 and v_x < 0.12 then sig := sig || private.isig('steady_timing', 25, 'high',
      format('%s plays started at almost exactly the same interval (variation %s%%) — like a script', v_n, round(v_x * 100, 1))); end if;
  select count(*) into v_n from (select date_trunc('day', created_at) d, sum(delta) ink from public.resource_ledger
    where player_id = p_uid and resource = 'ink' and delta > 0 and created_at > now() - interval '30 days' and private.guide_play_reason(reason) group by 1) z
    where ink > coalesce((b ->> 'day_p995')::numeric, 1e12);
  if v_n >= 2 then sig := sig || private.isig('extreme_days', least(5 * v_n, 15), 'watch', format('Earned more Ink than 99.5%% of all player-days on %s days', v_n)); end if;

  -- 6. help concentrated in a few accounts, or from throwaway accounts (rings not caught by device/address)
  with f as (select giver, sum(times) times, sum(ink) ink from private.integrity_inflows(p_uid) where kind <> 'invite' group by giver),
       tot as (select sum(times) t from f)
  select (select t from tot), (select coalesce(sum(times), 0) from (select times from f order by times desc limit 2) z),
         (select count(*) from f join public.players pl on pl.id = f.giver
           where f.times >= 3 and (pl.created_at > now() - interval '14 days' or (select count(*) from public.minigame_sessions s where s.player_id = f.giver) < 5))
    into v_x, v_y, v_n;
  if coalesce(v_x, 0) >= 15 and v_y / v_x >= 0.7 then sig := sig || private.isig('concentrated_help', 12, 'watch',
      format('%s%% of the help they got (votes, visits, inspires, stamps, plays) came from just 2 accounts', round(100 * v_y / v_x)),
      (select jsonb_agg(jsonb_build_object('username', pr.username, 'times', f.times)) from (select giver, sum(times) times from private.integrity_inflows(p_uid) where kind <> 'invite' group by giver order by 2 desc limit 2) f join public.profiles pr on pr.id = f.giver)); end if;
  if v_n >= 3 then sig := sig || private.isig('throwaway_helpers', least(8 + 4 * v_n, 25), case when v_n >= 5 then 'high' else 'watch' end,
      format('%s brand-new or barely-played accounts repeatedly helped them earn', v_n)); end if;
  -- voters who vote almost only for them
  select count(*), coalesce(jsonb_agg(pr.username), '[]'::jsonb) into v_n, v_list from (
    select v.voter_id, count(*) filter (where k.player_id = p_uid) mine, count(*) total
    from public.sketch_votes v join public.sketches k on k.id = v.sketch_id where v.created_at > now() - interval '90 days'
      and v.voter_id in (select v2.voter_id from public.sketch_votes v2 join public.sketches k2 on k2.id = v2.sketch_id where k2.player_id = p_uid)
    group by 1) z join public.profiles pr on pr.id = z.voter_id
    where z.mine >= 3 and z.mine::numeric / z.total >= 0.8;
  if v_n >= 3 then sig := sig || private.isig('loyal_voters', least(10 + 4 * v_n, 25), 'high', format('%s accounts vote almost only for their sketches', v_n), v_list); end if;

  -- 7. networks: VPN / proxy / Tor / datacenter, country hopping, impossible travel, plots far from their connection
  select count(*), count(*) filter (where i.is_vpn or i.is_proxy or i.is_datacenter), count(*) filter (where i.is_tor)
    into v_n, v_m, v_k
  from private.sightings s join private.ip_intel i on i.ip_hash = s.ip_hash where s.player_id = p_uid and s.last_at > now() - interval '30 days';
  if v_n >= 3 and v_m::numeric / v_n >= 0.5 then sig := sig || private.isig('vpn', 10, 'watch',
      format('%s of %s sessions came through a VPN, proxy or datacenter', v_m, v_n),
      (select jsonb_agg(distinct i.as_org) from private.sightings s join private.ip_intel i on i.ip_hash = s.ip_hash
        where s.player_id = p_uid and (i.is_vpn or i.is_proxy or i.is_datacenter) and i.as_org is not null)); end if;
  if v_k > 0 then sig := sig || private.isig('tor', 15, 'high', format('%s sessions came through Tor', v_k)); end if;
  select count(distinct i.country) into v_n from private.sightings s join private.ip_intel i on i.ip_hash = s.ip_hash
    where s.player_id = p_uid and s.last_at > now() - interval '7 days' and i.country is not null and not coalesce(i.is_vpn or i.is_proxy or i.is_datacenter or i.is_tor, false);
  if v_n >= 3 then sig := sig || private.isig('country_hopping', 10, 'watch', format('Connected from %s countries in a week', v_n)); end if;
  select count(*) into v_n from private.sightings a join private.ip_intel ia on ia.ip_hash = a.ip_hash
    join private.sightings c on c.player_id = a.player_id and c.id <> a.id join private.ip_intel ic on ic.ip_hash = c.ip_hash
    where a.player_id = p_uid and a.last_at > now() - interval '30 days' and ia.country <> ic.country
      and abs(extract(epoch from c.first_at - a.last_at)) < 3600
      and not coalesce(ia.is_vpn or ia.is_proxy or ia.is_datacenter or ia.is_tor or ic.is_vpn or ic.is_proxy or ic.is_datacenter or ic.is_tor, false);
  if v_n > 0 then sig := sig || private.isig('impossible_travel', 15, 'high', 'Connected from two different countries less than an hour apart'); end if;
  with net as (select distinct i.country from private.sightings s join private.ip_intel i on i.ip_hash = s.ip_hash
               where s.player_id = p_uid and i.country is not null and not coalesce(i.is_vpn or i.is_proxy or i.is_datacenter or i.is_tor, false)),
       pl as (select k.country, count(*) n from public.plot_ownership o join public.world_plots w on w.gx = o.gx and w.gy = o.gy
              join public.world_cities k on k.id = w.city_id
              where o.player_id = p_uid and o.released_at is null and o.acquired_at > now() - interval '60 days' group by 1)
  select (select count(*) from net), coalesce((select sum(n) from pl where country not in (select country from net)), 0),
         (select jsonb_agg(jsonb_build_object('country', country, 'plots', n)) from pl where country not in (select country from net))
    into v_m, v_n, v_list;
  if v_m >= 1 and v_n >= 5 then sig := sig || private.isig('plots_far_from_network', least(10 + v_n, 25), 'high',
      format('Claimed %s plots in countries their own connection never comes from (GPS spoofing?)', v_n), v_list); end if;

  -- 8. emulators and automation
  select count(*) filter (where automation), count(*) filter (where emulator),
         (select jsonb_agg(distinct r) from private.sightings s2, unnest(s2.reasons) r where s2.player_id = p_uid)
    into v_n, v_m, v_list from private.sightings where player_id = p_uid and last_at > now() - interval '60 days';
  if v_n > 0 then sig := sig || private.isig('automation', 30, 'severe', 'Played through browser automation (a bot-controlled browser)', v_list); end if;
  if v_m > 0 then sig := sig || private.isig('emulator', 20, 'high', 'Played on an emulator or virtual device', v_list); end if;

  select least(100, coalesce(sum((x ->> 'points')::numeric), 0)) into v_score from jsonb_array_elements(sig) x;
  v_level := case when v_score >= 70 or exists (select 1 from jsonb_array_elements(sig) x where x ->> 'severity' = 'severe') and v_score >= 45 then 'severe'
                  when v_score >= 45 then 'high' when v_score >= 20 then 'watch' else 'low' end;
  return jsonb_build_object('score', round(v_score), 'level', v_level,
    'signals', (select coalesce(jsonb_agg(x order by (x ->> 'points')::numeric desc), '[]'::jsonb) from jsonb_array_elements(sig) x),
    'linked', v_linked, 'referrals', rf_list);
end $$;

create or replace function private.integrity_scan_save(p_uid uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb := private.integrity_scan(p_uid);
begin
  insert into private.integrity_scores (player_id, score, level, signals, linked, scanned_at)
  values (p_uid, (r ->> 'score')::int, r ->> 'level', r -> 'signals', r -> 'linked', now())
  on conflict (player_id) do update set score = excluded.score, level = excluded.level, signals = excluded.signals, linked = excluded.linked, scanned_at = now();
  return r;
end $$;

-- ---- admin: list, scan, player deep-dive ---------------------------------------------------------------------------------
/** rescan a page of players (the app calls it page by page): active in the last 60 days, most recent first */
create or replace function public.admin_integrity_scan(p_offset int default 0, p_limit int default 100) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); r record; v_n int := 0; v_total int;
begin
  select count(*) into v_total from public.players where last_active_at > now() - interval '60 days';
  for r in select id from public.players where last_active_at > now() - interval '60 days' order by last_active_at desc, id offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200) loop
    perform private.integrity_scan_save(r.id); v_n := v_n + 1;
  end loop;
  return jsonb_build_object('scanned', v_n, 'total', v_total, 'next', case when p_offset + v_n < v_total then p_offset + v_n end);
end $$;

create or replace function public.admin_integrity_list(p_level text default null, p_q text default null, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); v_q text := lower(trim(coalesce(p_q, '')));
begin
  return jsonb_build_object(
    'counts', (select jsonb_object_agg(level, n) from (select level, count(*) n from private.integrity_scores group by 1) c),
    'rows', coalesce((select jsonb_agg(x order by (x ->> 'score')::int desc) from (
      select jsonb_build_object('player', private.profile_json(s.player_id), 'email', u.email, 'status', pl.status, 'score', s.score, 'level', s.level,
               'top', (select coalesce(jsonb_agg(jsonb_build_object('key', e ->> 'key', 'label', e ->> 'label', 'severity', e ->> 'severity', 'points', (e ->> 'points')::int)), '[]'::jsonb)
                       from (select e from jsonb_array_elements(s.signals) e limit 3) z),
               'linked', jsonb_array_length(s.linked), 'scanned_at', s.scanned_at, 'joined', pl.created_at, 'last_active', pl.last_active_at) x
      from private.integrity_scores s join public.players pl on pl.id = s.player_id join public.profiles pr on pr.id = s.player_id left join auth.users u on u.id = s.player_id
      where (p_level is null or s.level = p_level or (p_level = 'flagged' and s.level in ('watch', 'high', 'severe')))
        and (v_q = '' or lower(pr.username) like '%' || v_q || '%' or lower(coalesce(u.email, '')) like '%' || v_q || '%')
      order by s.score desc limit least(greatest(p_limit, 1), 300)) t), '[]'::jsonb));
end $$;

create or replace function public.admin_integrity_player(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); r jsonb;
begin
  if not exists (select 1 from public.players where id = p_player) then raise exception 'not_found' using errcode = 'P0001'; end if;
  r := private.integrity_scan_save(p_player);
  return r || jsonb_build_object(
    'player', private.profile_json(p_player),
    'email', (select email from auth.users where id = p_player),
    'account', (select jsonb_build_object('status', status, 'until', suspended_until, 'reason', suspension_reason, 'strikes', strikes, 'joined', created_at, 'last_active', last_active_at)
                from public.players where id = p_player),
    'balances', private.balances(p_player),
    'plots', (select count(*) from public.world_plots where owner_id = p_player),
    -- linked accounts with their own risk
    'linked', (select coalesce(jsonb_agg(x || jsonb_build_object('score', s.score, 'level', s.level, 'email', u.email)), '[]'::jsonb)
               from jsonb_array_elements(r -> 'linked') x left join private.integrity_scores s on s.player_id = (x ->> 'id')::uuid
               left join auth.users u on u.id = (x ->> 'id')::uuid),
    'inflows', (select coalesce(jsonb_agg(jsonb_build_object('username', pr.username, 'id', f.giver, 'kinds', to_jsonb(f.kinds), 'times', f.times, 'ink', f.ink,
                    'linked', f.giver in (select (x ->> 'id')::uuid from jsonb_array_elements(r -> 'linked') x)) order by f.times desc), '[]'::jsonb)
                from (select giver, array_agg(distinct kind) kinds, sum(times)::int times, sum(ink) ink from private.integrity_inflows(p_player) group by giver order by 3 desc limit 40) f
                join public.profiles pr on pr.id = f.giver),
    'devices', (select coalesce(jsonb_agg(d order by d ->> 'last' desc), '[]'::jsonb) from (
                 select jsonb_build_object('device', left(coalesce(device_id, '—'), 8), 'fingerprint', left(coalesce(fp_hash, '—'), 8), 'platform', max(platform), 'ua', max(ua), 'gpu', max(gpu),
                          'tz', max(tz), 'emulator', bool_or(emulator), 'automation', bool_or(automation),
                          'reasons', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from private.sightings s2, unnest(s2.reasons) x where s2.player_id = p_player and s2.device_id is not distinct from s.device_id),
                          'first', min(first_at), 'last', max(last_at), 'hits', sum(hits),
                          'shared_with', (select count(distinct o.player_id) from private.sightings o where o.device_id = s.device_id and o.player_id <> p_player)) d
                 from private.sightings s where player_id = p_player group by device_id, fp_hash limit 30) z),
    'networks', (select coalesce(jsonb_agg(n order by n ->> 'last' desc), '[]'::jsonb) from (
                 select jsonb_build_object('ip', left(s.ip_hash, 8), 'country', i.country, 'provider', i.as_org, 'asn', i.asn,
                          'vpn', i.is_vpn, 'proxy', i.is_proxy, 'tor', i.is_tor, 'datacenter', i.is_datacenter, 'mobile', i.is_mobile,
                          'first', min(s.first_at), 'last', max(s.last_at), 'hits', sum(s.hits),
                          'shared_with', (select count(distinct o.player_id) from private.sightings o where o.ip_hash = s.ip_hash and o.player_id <> p_player)) n
                 from private.sightings s left join private.ip_intel i on i.ip_hash = s.ip_hash where s.player_id = p_player and s.ip_hash is not null
                 group by s.ip_hash, i.country, i.as_org, i.asn, i.is_vpn, i.is_proxy, i.is_tor, i.is_datacenter, i.is_mobile limit 40) z),
    'plot_countries', (select coalesce(jsonb_agg(jsonb_build_object('country', coalesce(k.country_name, k.country), 'plots', n) order by n desc), '[]'::jsonb) from (
                 select w.city_id, count(*) n from public.world_plots w where w.owner_id = p_player and w.city_id is not null group by 1) z join public.world_cities k on k.id = z.city_id),
    'ink_sources', (select coalesce(jsonb_object_agg(reason, ink), '{}'::jsonb) from (select reason, sum(delta) ink from public.resource_ledger
                 where player_id = p_player and resource = 'ink' and delta > 0 and created_at > now() - interval '30 days' group by 1 order by 2 desc limit 20) z),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'until', a.until, 'preset', a.preset, 'reason', a.reason, 'proof', a.proof,
                   'ink_removed', a.ink_removed, 'plots_removed', jsonb_array_length(a.plots_removed), 'plots_ink', a.plots_ink, 'at', a.created_at,
                   'by', (select username from public.profiles where id = a.admin_id), 'undone_at', a.undone_at) order by a.created_at desc), '[]'::jsonb)
                from public.integrity_actions a where a.player_id = p_player));
end $$;

-- ---- penalties ------------------------------------------------------------------------------------------------------
/** what a penalty would take: Ink gained by abuse (by scope), what's left of it in their balance, and the plots bought
 * with the rest (most recent purchases first) */
create or replace function private.integrity_penalty_plan(p_player uuid, p_scope jsonb) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare sc jsonb := coalesce(p_scope, '{}'::jsonb); v_target bigint := 0; v_bal bigint; v_take bigint; v_short bigint; v_plots jsonb := '[]'::jsonb; v_plots_ink bigint := 0;
  v_since timestamptz := nullif(sc ->> 'since', '')::timestamptz; v_parts jsonb := '{}'::jsonb; v_x bigint; r record; v_linked uuid[];
begin
  select coalesce(amount, 0) into v_bal from public.resource_balances where player_id = p_player and resource = 'ink';
  v_bal := coalesce(v_bal, 0);
  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_linked from private.integrity_scores s, jsonb_array_elements(s.linked) x
    where s.player_id = p_player and x -> 'via' ?| array['device', 'fingerprint', 'ip'];
  if coalesce((sc ->> 'all')::boolean, false) then
    v_target := v_bal + coalesce((select sum(-delta) from public.resource_ledger where player_id = p_player and resource = 'ink' and reason = 'acquire_plot' and delta < 0
                                  and (v_since is null or created_at >= v_since)), 0);
    v_parts := v_parts || jsonb_build_object('all', v_target);
  else
    if coalesce((sc ->> 'referrals')::boolean, false) then
      select coalesce(sum(delta), 0) into v_x from public.resource_ledger where player_id = p_player and resource = 'ink' and delta > 0
        and reason in ('referral', 'referral_share') and (v_since is null or created_at >= v_since);
      v_target := v_target + v_x; v_parts := v_parts || jsonb_build_object('referrals', v_x);
    end if;
    if coalesce((sc ->> 'linked_help')::boolean, false) then
      select coalesce(sum(ink), 0) into v_x from private.integrity_inflows(p_player) where giver = any (v_linked) and kind <> 'invite';
      v_target := v_target + v_x; v_parts := v_parts || jsonb_build_object('linked_help', v_x);
    end if;
    if v_since is not null and coalesce((sc ->> 'earned_since')::boolean, false) then
      select coalesce(sum(delta), 0) into v_x from public.resource_ledger where player_id = p_player and resource = 'ink' and delta > 0 and created_at >= v_since
        and reason not in ('referral', 'referral_share');
      v_target := v_target + v_x; v_parts := v_parts || jsonb_build_object('earned_since', v_x);
    end if;
    if nullif(sc ->> 'extra', '') is not null then
      v_target := v_target + greatest((sc ->> 'extra')::bigint, 0); v_parts := v_parts || jsonb_build_object('extra', (sc ->> 'extra')::bigint);
    end if;
  end if;
  v_take := least(v_bal, v_target); v_short := v_target - v_take;
  -- plots bought with the rest: latest purchases first, until their cost covers it (or every purchase since, if asked)
  if coalesce((sc ->> 'plots')::boolean, true) and (v_short > 0 or coalesce((sc ->> 'all_plots_since')::boolean, false)) then
    for r in select o.gx, o.gy, o.acquired_at, coalesce((o.cost ->> 'ink')::bigint, 0) ink, w.rarity
             from public.plot_ownership o join public.world_plots w on w.gx = o.gx and w.gy = o.gy and w.owner_id = p_player
             where o.player_id = p_player and o.released_at is null and o.method in ('acquire', 'purchase') and (v_since is null or o.acquired_at >= v_since)
             order by o.acquired_at desc loop
      exit when v_plots_ink >= v_short and not coalesce((sc ->> 'all_plots_since')::boolean, false);
      v_plots := v_plots || jsonb_build_object('gx', r.gx, 'gy', r.gy, 'rarity', r.rarity, 'ink', r.ink, 'at', r.acquired_at);
      v_plots_ink := v_plots_ink + r.ink;
    end loop;
  end if;
  return jsonb_build_object('target', v_target, 'parts', v_parts, 'balance', v_bal, 'take', v_take, 'short', v_short, 'plots', v_plots, 'plots_ink', v_plots_ink,
                            'uncovered', greatest(v_short - v_plots_ink, 0));
end $$;

create or replace function public.admin_integrity_preview(p_players uuid[], p_scope jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(p), 'plan', private.integrity_penalty_plan(p, p_scope))), '[]'::jsonb) from unnest(p_players) p);
end $$;

/** suspend, ban or warn players; optionally take the Ink they gained by abuse and the plots bought with it */
create or replace function public.admin_integrity_act(p_players uuid[], p_kind text, p_until timestamptz, p_preset text, p_reason text, p_proof jsonb, p_scope jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); p uuid; v_plan jsonb; pl jsonb; v_group uuid := gen_random_uuid(); v_out jsonb := '[]'::jsonb;
  v_id bigint; v_take boolean := p_scope is not null and p_scope <> '{}'::jsonb;
begin
  if p_kind not in ('suspend', 'ban', 'warn') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  if p_reason is null or char_length(trim(p_reason)) < 4 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if p_kind = 'suspend' and (p_until is null or p_until <= now()) then raise exception 'until_required' using errcode = 'P0001'; end if;
  if v_take and not private.has_role(v_uid, array['owner', 'economy']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  foreach p in array p_players loop
    if p = v_uid then raise exception 'cannot_moderate_self' using errcode = 'P0001'; end if;
    if private.has_role(p, array['owner']) then raise exception 'forbidden' using errcode = 'P0001'; end if;
    v_plan := case when v_take then private.integrity_penalty_plan(p, p_scope) else jsonb_build_object('take', 0, 'plots', '[]'::jsonb, 'plots_ink', 0) end;
    if (v_plan ->> 'take')::bigint > 0 then
      perform private.ledger_apply(p, 'ink', -(v_plan ->> 'take')::bigint, 'integrity_penalty', 'integrity', v_group::text, null, v_uid);
    end if;
    for pl in select * from jsonb_array_elements(v_plan -> 'plots') loop
      perform public.admin_release_plot((pl ->> 'gx')::int, (pl ->> 'gy')::int, 'Integrity: ' || left(p_reason, 200));
    end loop;
    if p_kind in ('suspend', 'ban') then
      update public.players set status = case p_kind when 'ban' then 'banned' else 'suspended' end, suspended_until = case when p_kind = 'suspend' then p_until end,
             suspension_reason = left(p_reason, 1000), strikes = strikes + 1 where id = p;
    end if;
    insert into public.integrity_actions (player_id, admin_id, kind, until, preset, reason, proof, ink_removed, plots_removed, plots_ink, group_id)
    values (p, v_uid, p_kind, case when p_kind = 'suspend' then p_until end, p_preset, left(p_reason, 1000), coalesce(p_proof, '[]'::jsonb),
            (v_plan ->> 'take')::bigint, v_plan -> 'plots', (v_plan ->> 'plots_ink')::bigint, v_group)
    returning id into v_id;
    perform private.audit('integrity.' || p_kind, 'player', p::text, jsonb_build_object('action', v_id, 'until', p_until, 'preset', p_preset, 'reason', p_reason,
            'ink_removed', v_plan ->> 'take', 'plots_removed', jsonb_array_length(v_plan -> 'plots')));
    v_out := v_out || jsonb_build_object('player', p, 'action', v_id, 'ink_removed', (v_plan ->> 'take')::bigint, 'plots_removed', jsonb_array_length(v_plan -> 'plots'));
  end loop;
  return jsonb_build_object('group', v_group, 'results', v_out);
end $$;

/** take an action back: lift the restriction and give back the Ink taken, plus what the removed plots cost */
create or replace function public.admin_integrity_undo(p_action bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); a public.integrity_actions; v_back bigint;
begin
  select * into a from public.integrity_actions where id = p_action for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if a.undone_at is not null then raise exception 'already_undone' using errcode = 'P0001'; end if;
  v_back := a.ink_removed + a.plots_ink;
  if v_back > 0 then perform private.ledger_apply(a.player_id, 'ink', v_back, 'integrity_refund', 'integrity', a.id::text, null, v_uid); end if;
  if a.kind in ('suspend', 'ban') and not exists (select 1 from public.integrity_actions x where x.player_id = a.player_id and x.id > a.id and x.undone_at is null and x.kind in ('suspend', 'ban')) then
    update public.players set status = 'active', suspended_until = null, suspension_reason = null where id = a.player_id;
  end if;
  update public.integrity_actions set undone_at = now(), undone_by = v_uid where id = a.id;
  perform private.audit('integrity.undo', 'player', a.player_id::text, jsonb_build_object('action', a.id, 'ink_returned', v_back));
  return jsonb_build_object('ink_returned', v_back);
end $$;

-- ---- what a restricted player sees ------------------------------------------------------------------------------------
create or replace function public.my_restriction() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); pl public.players; a public.integrity_actions; c jsonb := private.cfg('integrity');
begin
  if v_uid is null then return null; end if;
  select * into pl from public.players where id = v_uid;
  if not found then return null; end if;
  select * into a from public.integrity_actions where player_id = v_uid and undone_at is null order by created_at desc limit 1;
  if pl.status = 'active' and (a.id is null or a.kind <> 'warn' or a.created_at < now() - interval '7 days') then return null; end if;
  return jsonb_build_object('status', case when pl.status = 'active' then 'warned' else pl.status end, 'until', pl.suspended_until,
    'reason', coalesce(a.reason, pl.suspension_reason),
    'title', (select p ->> 'label' from jsonb_array_elements(coalesce(c -> 'presets', '[]'::jsonb)) p where p ->> 'id' = a.preset),
    'proof', coalesce(a.proof, '[]'::jsonb), 'at', a.created_at, 'ink_removed', coalesce(a.ink_removed, 0), 'plots_removed', coalesce(jsonb_array_length(a.plots_removed), 0),
    'appeal_email', coalesce(c ->> 'appeal_email', 'dev@landvas.app'));
end $$;

-- ---- grants ---------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.svc_integrity_ping(uuid, text, jsonb)', 'public.svc_integrity_intel(text, jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.integrity_ping(jsonb)', 'public.my_restriction()', 'public.admin_integrity_scan(integer, integer)', 'public.admin_integrity_list(text, text, integer)',
                           'public.admin_integrity_player(uuid)', 'public.admin_integrity_preview(uuid[], jsonb)',
                           'public.admin_integrity_act(uuid[], text, timestamp with time zone, text, text, jsonb, jsonb)', 'public.admin_integrity_undo(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.ihash(text)', 'private.request_ip()', 'private.integrity_record(uuid, text, jsonb)', 'private.integrity_links(uuid)',
                           'private.integrity_inflows(uuid)', 'private.integrity_scan(uuid)', 'private.integrity_scan_save(uuid)', 'private.integrity_penalty_plan(uuid, jsonb)',
                           'private.integrity_baseline_get()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
