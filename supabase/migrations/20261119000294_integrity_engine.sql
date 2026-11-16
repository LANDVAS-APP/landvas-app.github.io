-- The integrity engine, v2: find the players really abusing the game — and stop flagging the ones who aren't.
--
-- WHY v1 FLAGGED HONEST PLAYERS
--   · A shared internet address counted as "the same person": mobile carriers and public Wi-Fi put thousands of
--     players behind one address, and family members share home Wi-Fi. Inviting your sister at home was "severe
--     self-referral", and anyone on the same carrier "feeding" you Ink was an Ink ring.
--   · Identical phones (same model, same OS, same browser) have the same browser fingerprint.
--   · "Earned Ink in 18 hours of one day" counted enchantments, rent conversions and other things that pay while you
--     sleep. "Plays at the same interval" counted fixed-length arcade rounds replayed back to back.
--   · iCloud Private Relay / Cloudflare WARP looked like VPNs; travelling (trains, planes, Rifts) looked like GPS spoofing.
--   · Signals just added up points, so a pile of weak hints made "severe" with no real evidence.
--
-- HOW v2 DECIDES
--   Every signal has a strength (0–1, like a probability that it means abuse) and a family:
--     multi_account · referral · ink_ring · automation · speed · exploit · location
--   A family's strength combines its signals (1 − Π(1 − w)); weak families are capped (location never above 0.3,
--   so a VPN alone can never make anyone "high"). The risk score combines the families the same way.
--   · severe = score ≥ 85 AND (proof-grade evidence — e.g. the egg loop, a duplicated payout, a balance changed outside
--     the ledger, a scripted browser, an invited account on the inviter's own device that collected the bonus — OR at
--     least two independent families each ≥ 0.5). Otherwise ≥ 85 is "high".
--   · high ≥ 65 · watch ≥ 35 · low below.
--   Links between accounts: a device id (one app install) is strong; a fingerprint only counts when the two accounts
--   also share a network the same day; an internet address only counts when it's a quiet one (≤ 6 players in 30
--   days, not a mobile carrier, VPN or datacenter) and they used it within a day of each other.
--
-- WHAT v2 LOOKS FOR (besides everything v1 did, recalibrated)
--   Referral fraud, per invited account: email verified? ever really played? played only to qualify, then quit? plays
--   abnormally (wins far faster than anyone, or always in the gaps between the inviter's own sessions on the same
--   network — one person switching accounts)? temporary/throwaway email (bigger list + patterns), keyboard-mash or
--   random-letter emails, emails or usernames that are near-copies of the inviter's or of each other (edit distance,
--   same letters with different numbers, same pattern), a private email domain only these accounts use, sign-up
--   bursts, the same device/quiet network as the inviter, feeding the inviter. Each invited account gets its own
--   suspicion; the inviter's referral score weighs how many are fake and what they paid out.
--   Unknown exploits ("exploit radar"):
--     · a source paying a player far more than anyone else (per source, per day, against everyone's 99.9th percentile)
--     · the same payout paid twice (a bug being farmed)  · an Ink balance changed outside the ledger
--     · payout bursts (many payouts in seconds)  · two games played at once  · machine-steady reaction times
--     · luck far beyond the odds (ultras per claim)  · the same plot claimed over and over
--     · any game action repeated far more than anyone else (every fair-play log kind)
--     · arcade scores sent above what's humanly possible
--   And a global radar for staff: which sources jumped today, who's taking most of each, payouts paid twice, balances
--   out of step with the ledger — each with the Earning switch that would stop it.
-- Nothing happens automatically: staff review and act (admin_integrity_act), exactly as before.

-- ---- 0. settings and storage ------------------------------------------------------------------------------------
update public.game_config set value = value || jsonb_build_object('engine', coalesce(value -> 'engine', jsonb_build_object(
    'busy_ip_players', 6, 'severe_score', 85, 'high_score', 65, 'watch_score', 35,
    'family_cap', jsonb_build_object('location', 0.3, 'ink_ring', 0.75, 'multi_account', 0.85, 'speed', 0.8, 'automation', 0.95, 'referral', 0.97, 'exploit', 0.97),
    'auto_scan', true)))
where key = 'integrity';

alter table private.integrity_scores add column if not exists families jsonb not null default '{}'::jsonb;
alter table private.integrity_scores add column if not exists referrals jsonb not null default '[]'::jsonb;
alter table private.integrity_scores add column if not exists impact bigint not null default 0;
alter table private.integrity_scores add column if not exists proof boolean not null default false;
alter table private.integrity_scores add column if not exists version int not null default 1;

create or replace function private.icfg() returns jsonb language sql stable as $$
  select coalesce(private.cfg('integrity') -> 'engine', '{}'::jsonb)
$$;

-- ---- 1. text helpers: emails and names --------------------------------------------------------------------------
/** edit distance, stopping early past p_max (short strings: emails, usernames) */
create or replace function private.lev(a text, b text, p_max int default 3) returns int language plpgsql immutable as $$
declare la int := length(coalesce(a, '')); lb int := length(coalesce(b, '')); prev int[]; cur int[]; i int; j int; c int; best int;
begin
  if a is null or b is null then return p_max + 1; end if;
  if abs(la - lb) > p_max then return p_max + 1; end if;
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  if la > 64 or lb > 64 then return case when a = b then 0 else p_max + 1 end; end if;
  prev := array(select generate_series(0, lb));
  for i in 1 .. la loop
    cur := array[i] || array_fill(0, array[lb]);
    best := cur[1];
    for j in 1 .. lb loop
      c := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      cur[j + 1] := least(prev[j + 1] + 1, cur[j] + 1, prev[j] + c);
      if cur[j + 1] < best then best := cur[j + 1]; end if;
    end loop;
    if best > p_max then return p_max + 1; end if;
    prev := cur;
  end loop;
  return prev[lb + 1];
end $$;

/** a throwaway / temporary inbox: the known list, many more, and their naming patterns */
create or replace function private.email_temp(p text) returns boolean language sql immutable as $$
  with d as (select lower(split_part(coalesce(p, ''), '@', 2)) dom)
  select private.email_disposable(p)
      or dom = any (array['1secmail.com', '1secmail.org', '1secmail.net', 'tempmailo.com', 'emailtemp.org', 'mail7.io', 'harakirimail.com', 'anonbox.net',
           'mytemp.email', 'tempinbox.com', 'mailcatch.com', '33mail.com', 'inboxbear.com', 'tmail.ws', 'mailnull.com', 'spambox.us', 'fakemailgenerator.com',
           'emlhub.com', 'emltmp.com', 'email-temp.com', 'mail-temp.com', 'tempm.com', 'zetmail.com', 'vomoto.com', 'wuuvo.com', 'pokemail.net', 'mailsac.com',
           'mailinator.net', 'mailinator2.com', 'yopmail.fr', 'cool.fr.nf', 'jetable.org', 'mvrht.net', 'klzlk.com', 'tmpeml.com', 'tmpbox.net', 'cs.email',
           'vusra.com', 'luxusmail.org', 'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de', 'guerrillamailblock.com', 'pokemail.net', 'spam4.me',
           'tempmail.dev', 'tempmail.plus', 'temp-mail.net', 'tempmailaddress.com', 'temporary-mail.net', 'minuteinbox.com', '10minutemail.net', '10minmail.com',
           '20minutemail.com', 'mailforspam.com', 'mailtemp.info', 'fake-mail.net', 'getairmail.com', 'airmail.cc', 'tempmails.net', 'emailnax.com', 'inboxalias.com',
           'mail.gw', 'mail.td', 'rover.info', 'chacuo.net', 'linshiyouxiang.net', 'bccto.me', 'disposablemail.com', 'throwam.com', 'tutamail.ws'])
      or dom ~ '(temp-?mail|tmp-?mail|10-?minute|minute-?mail|minuteinbox|throwaway|trash-?mail|guerrilla|mailinator|yopmail|disposable|fake-?mail|fakeinbox|spambox|spamgourmet|burner|getnada|maildrop|mailcatch|mohmal|emailondeck|tempinbox|dropmail|sharklasers|mailpoof|tempr\.|1secmail|harakiri|anonbox|incognitomail|mytemp|tempemail|temporary-?mail|mailnesia|mintemail|discard\.email|jetable)'
  from d
$$;

/** how much an email's name looks like a keyboard mash or random letters (0 = a real name, 1 = gibberish) */
create or replace function private.email_gibberish(p_email text) returns numeric language plpgsql immutable as $$
declare loc text := split_part(lower(split_part(coalesce(p_email, ''), '@', 1)), '+', 1); s text; n int; v int; run int := 0; maxrun int := 0; ch text; i int;
  score numeric := 0; rare int := 0; pairs int := 0; digits text; switches int := 0; prev_d boolean; d boolean;
begin
  s := regexp_replace(loc, '[^a-z]', '', 'g');
  n := length(s);
  digits := regexp_replace(loc, '[^0-9]', '', 'g');
  -- letters and digits flipping back and forth (x7k2m9)
  for i in 1 .. length(loc) loop
    ch := substr(loc, i, 1);
    continue when ch !~ '[a-z0-9]';
    d := ch ~ '[0-9]';
    if prev_d is not null and d <> prev_d then switches := switches + 1; end if;
    prev_d := d;
  end loop;
  if switches >= 4 then score := score + 0.45; end if;
  if n >= 5 then
    v := length(regexp_replace(s, '[^aeiouy]', '', 'g'));
    if v::numeric / n < 0.2 then score := score + 0.4; elsif v::numeric / n < 0.28 and n >= 9 then score := score + 0.15; end if;
    for i in 1 .. n loop
      ch := substr(s, i, 1);
      if ch ~ '[bcdfghjklmnpqrstvwxz]' then run := run + 1; if run > maxrun then maxrun := run; end if; else run := 0; end if;
      if i > 1 then
        pairs := pairs + 1;
        if substr(s, i - 1, 2) ~ '^(q[^u]|[jqxz][bcdfgjkmnpqvwxz]|[bcdfgkmpvw][qxzj]|vv|ww|hh|kx|xk|fq|zx|xz|jq|vq|wq|gq|bq|cj|vj|fz|pz|kq)$' then rare := rare + 1; end if;
      end if;
    end loop;
    if maxrun >= 5 then score := score + 0.3; end if;
    if pairs > 0 and rare::numeric / pairs >= 0.15 then score := score + 0.35; elsif rare >= 2 then score := score + 0.15; end if;
    if s ~ '(qwert|wert|asdf|sdfg|zxcv|xcvb|qazw|wsxe|yuio|hjkl|vbnm|poiu|lkjh|mnbv|qwas)' then score := score + 0.5; end if;
    if s ~ '(.)\1\1\1' then score := score + 0.3; end if;
  end if;
  -- long digit runs that aren't a year
  if length(digits) >= 5 and digits !~ '^(19|20)\d\d$' then score := score + 0.15; end if;
  return least(1, score);
end $$;

/** the shape of a name: letters kept, every run of digits one '#' (john1, john22 → john#) */
create or replace function private.name_shape(p text) returns text language sql immutable as $$
  select regexp_replace(regexp_replace(split_part(lower(split_part(coalesce(p, ''), '@', 1)), '+', 1), '[._-]', '', 'g'), '[0-9]+', '#', 'g')
$$;

/** why two emails look like the same person's (null if they don't) */
create or replace function private.email_lookalike(a text, b text) returns text language plpgsql immutable as $$
declare na text := private.email_norm(a); nb text := private.email_norm(b); la text; lb text;
begin
  if a is null or b is null or position('@' in a) = 0 or position('@' in b) = 0 then return null; end if;
  if na = nb then return 'the same inbox (dots / +tags)'; end if;
  la := split_part(na, '@', 1); lb := split_part(nb, '@', 1);
  if length(private.email_stem(a)) >= 4 and private.email_stem(a) = private.email_stem(b) then return 'the same name, different numbers'; end if;
  if length(la) >= 6 and private.name_shape(a) = private.name_shape(b) and private.name_shape(a) ~ '#' then return 'the same pattern'; end if;
  if length(la) >= 6 and length(lb) >= 6 and private.lev(la, lb, 2) <= (case when least(length(la), length(lb)) >= 10 then 2 else 1 end) then return 'one or two letters apart'; end if;
  if length(la) >= 7 and length(lb) >= 7 and left(la, 6) = left(lb, 6) and abs(length(la) - length(lb)) <= 3 then return 'the same start'; end if;
  return null;
end $$;

/** a common free mail provider (a domain shared by strangers) */
create or replace function private.email_common_domain(p text) returns boolean language sql immutable as $$
  select lower(split_part(coalesce(p, ''), '@', 2)) = any (array['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'outlook.com', 'hotmail.com',
    'hotmail.co.uk', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'mail.com', 'gmx.com', 'gmx.net',
    'gmx.de', 'web.de', 'yandex.com', 'yandex.ru', 'mail.ru', 'qq.com', '163.com', 'naver.com', 'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net', 'cox.net',
    'charter.net', 'bellsouth.net', 'rocketmail.com', 'zoho.com', 'tutanota.com', 'fastmail.com', 'example.test'])
$$;

-- what counts as playing (the hours someone is "at the keyboard"): not rent, invites, enchantment ticks or refunds
create or replace function private.integrity_active_reason(p text) returns boolean language sql immutable as $$
  select p in ('minigame', 'arcade', 'space', 'farm', 'business', 'realm', 'inkborn', 'group_game', 'pvp', 'doodle', 'duet', 'sketch', 'finds', 'leviathan', 'duel_win', 'travel')
$$;

-- ---- 2. links between accounts, without the false ones ----------------------------------------------------------
/** how many different players use an internet address (30 days): busy addresses (carriers, cafés) link nobody */
create or replace function private.ip_players(p_ip text) returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(distinct player_id)::int from private.sightings where ip_hash = p_ip and last_at > now() - interval '30 days'
$$;

create or replace function private.integrity_links(p_uid uuid) returns table (other uuid, via text, n integer, last_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with mine as (select device_id, fp_hash, ip_hash, net_hash, day from private.sightings where player_id = p_uid and last_at > now() - interval '90 days'),
  busy as (select ip_hash from (select distinct ip_hash from mine where ip_hash is not null) m
            where private.ip_players(m.ip_hash) > coalesce((private.icfg() ->> 'busy_ip_players')::int, 6)
               or exists (select 1 from private.ip_intel i where i.ip_hash = m.ip_hash and coalesce(i.is_mobile or i.is_vpn or i.is_proxy or i.is_datacenter or i.is_tor, false)))
  -- one app install: strong
  select o.player_id, 'device', count(*)::int, max(o.last_at) from private.sightings o join (select distinct device_id from mine where device_id is not null) m on m.device_id = o.device_id
   where o.player_id <> p_uid group by 1
  union all
  -- the same fingerprint only counts with the same network on the same day (identical phones share fingerprints)
  select o.player_id, 'fingerprint', count(*)::int, max(o.last_at) from private.sightings o
    join (select distinct fp_hash, net_hash, day from mine where fp_hash is not null and net_hash is not null) m on m.fp_hash = o.fp_hash and m.net_hash = o.net_hash and m.day = o.day
   where o.player_id <> p_uid group by 1
  union all
  -- a quiet internet address used within a day by both
  select o.player_id, 'ip', count(*)::int, max(o.last_at) from private.sightings o
    join (select distinct ip_hash, day from mine where ip_hash is not null and ip_hash not in (select ip_hash from busy)) m on m.ip_hash = o.ip_hash and abs(o.day - m.day) <= 1
   where o.player_id <> p_uid group by 1
  union all
  select o.player_id, 'network', count(*)::int, max(o.last_at) from private.sightings o join (select distinct net_hash, day from mine where net_hash is not null) m on m.net_hash = o.net_hash and o.day = m.day
   where o.player_id <> p_uid group by 1
$$;

-- ---- 3. everyone's normal, to compare against (refreshed hourly) ------------------------------------------------
create or replace function private.integrity_baseline_get() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare b jsonb; v_at timestamptz;
begin
  select data, at into b, v_at from private.integrity_baseline where id = 1;
  -- (kept 3 hours; the hourly scan refreshes it, so a staff click never waits for it)
  if b is not null and v_at > now() - interval '3 hours' and b ? 'reason_day' then return b; end if;
  with rd as (select reason, player_id, date_trunc('day', created_at) d, sum(delta) ink from public.resource_ledger
         where resource = 'ink' and delta > 0 and created_at > now() - interval '14 days' group by 1, 2, 3),
  bursts as (select player_id, floor(extract(epoch from created_at) / 10) b, count(*) n from public.resource_ledger
             where resource = 'ink' and delta > 0 and created_at > now() - interval '3 days' and private.integrity_active_reason(reason) group by 1, 2),
  fk as (select kind, player_id, date_trunc('day', at) d, count(*) n from private.fairplay_log where at > now() - interval '14 days' group by 1, 2, 3)
  select jsonb_build_object(
    'typical', (select coalesce(jsonb_object_agg(k, med), '{}'::jsonb) from (
              select k, percentile_cont(0.5) within group (order by pm) med from (
                select player_id, game || ':' || least(level / 10, 6) k, percentile_cont(0.5) within group (order by play_ms) pm
                from public.minigame_sessions where passed and play_ms between 1000 and 1800000 and started_at > now() - interval '30 days' group by 1, 2 having count(*) >= 3) pp
              group by k having count(*) >= 3) x),
    -- per source: a player-day's Ink (only sources with enough players to compare)
    -- (the abusers themselves are left out of "normal": days over 50× the median player-day don't count towards the top percentiles)
    'reason_day', (select coalesce(jsonb_object_agg(reason, jsonb_build_object('p50', p50, 'p99', p99, 'p999', p999, 'n', n)), '{}'::jsonb) from (
              select rd.reason, max(m.p50) p50, percentile_cont(0.99) within group (order by ink) p99,
                     percentile_cont(0.999) within group (order by ink) p999, count(*) n, count(distinct player_id) players
              from rd join (select reason, percentile_cont(0.5) within group (order by ink) p50 from rd group by reason) m on m.reason = rd.reason
              where rd.ink <= 50 * greatest(m.p50, 1) group by rd.reason) z where players >= 5),
    'burst_p999', (select percentile_cont(0.999) within group (order by n) from bursts),
    'kind_day', (select coalesce(jsonb_object_agg(kind, jsonb_build_object('p50', p50, 'p99', p99, 'p999', p999)), '{}'::jsonb) from (
              select fk.kind, max(m.p50) p50, percentile_cont(0.99) within group (order by n) p99, percentile_cont(0.999) within group (order by n) p999, count(distinct player_id) players
              from fk join (select kind, percentile_cont(0.5) within group (order by n) p50 from fk group by kind) m on m.kind = fk.kind
              where fk.n <= 50 * greatest(m.p50, 1) group by fk.kind) z where players >= 5),
    'ultra_ppm', (select coalesce(sum(ppm), 0) + coalesce(sum(ppb), 0) / 1000.0 from public.plot_rarities where tier in ('ultra', 'primordial') or ppm > 0)) into b;
  insert into private.integrity_baseline (id, data, at) values (1, b, now()) on conflict (id) do update set data = excluded.data, at = now();
  return b;
end $$;

-- ---- 4. one signal ----------------------------------------------------------------------------------------------
/** a signal: its family, how strongly it means abuse (0–1), whether it's proof on its own, what it cost the game */
create or replace function private.isig2(p_key text, p_family text, p_w numeric, p_label text, p_evidence jsonb default null, p_proof boolean default false, p_impact bigint default 0)
returns jsonb language sql immutable as $$
  select jsonb_build_object('key', p_key, 'family', p_family, 'w', round(least(greatest(p_w, 0), 0.99), 3), 'points', round(least(greatest(p_w, 0), 0.99) * 100),
    'severity', case when p_w >= 0.6 then 'severe' when p_w >= 0.35 then 'high' else 'watch' end,
    'label', p_label, 'evidence', p_evidence, 'proof', coalesce(p_proof, false), 'impact', coalesce(p_impact, 0))
$$;

-- ---- 5. invited accounts, one by one ----------------------------------------------------------------------------
create or replace function private.integrity_referees(p_uid uuid, p_strong uuid[], p_email text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_links jsonb; v_out jsonb := '[]'::jsonb; r record; v_help jsonb; v_boosts int; v_flags text[]; v_reasons jsonb; v_w numeric; v_via text;
  v_plays int; v_wins int; v_arcade int; v_earned bigint; v_spent bigint; v_plots int; v_days int; v_last_earn timestamptz; v_first_play timestamptz;
  v_dormant boolean; v_look text; v_score int; v_verified boolean; v_temp boolean; v_gib numeric; v_fast int; v_typed int; v_close int; v_overlap int; v_nsess int;
  v_uname text; v_inv_uname text := (select username from public.profiles where id = p_uid); v_name_look text; b jsonb := private.integrity_baseline_get();
  v_doms jsonb; v_shapes jsonb; v_stems jsonb; v_burst int; v_share bigint;
  w_each numeric;
begin
  select coalesce(jsonb_object_agg(other, vias), '{}'::jsonb) into v_links
    from (select other, to_jsonb(array_agg(distinct via)) vias from private.integrity_links(p_uid) group by other) l;
  -- across all of them: private domains, name patterns and name stems shared by several
  select coalesce(jsonb_object_agg(dom, n), '{}'::jsonb) into v_doms from (
    select lower(split_part(u.email, '@', 2)) dom, count(*) n from public.referrals x join auth.users u on u.id = x.referee_id
     where x.referrer_id = p_uid and not private.email_common_domain(u.email) and not private.email_temp(u.email) group by 1 having count(*) >= 2) z;
  select coalesce(jsonb_object_agg(sh, n), '{}'::jsonb) into v_shapes from (
    select private.name_shape(u.email) sh, count(*) n from public.referrals x join auth.users u on u.id = x.referee_id
     where x.referrer_id = p_uid and length(private.name_shape(u.email)) >= 5 and private.name_shape(u.email) ~ '#' group by 1 having count(*) >= 2) z;
  select coalesce(jsonb_object_agg(st, n), '{}'::jsonb) into v_stems from (
    select private.email_stem(u.email) st, count(*) n from public.referrals x join auth.users u on u.id = x.referee_id
     where x.referrer_id = p_uid and length(coalesce(private.email_stem(u.email), '')) >= 4 group by 1 having count(*) >= 2) z;
  for r in select x.referee_id id, x.status, x.created_at, x.qualified_at, x.reward_ink, x.share_ink, u.email, pr.username, pl.status pstatus, pl.last_active_at, pl.created_at joined_at
           from public.referrals x join auth.users u on u.id = x.referee_id join public.profiles pr on pr.id = x.referee_id join public.players pl on pl.id = x.referee_id
           where x.referrer_id = p_uid order by x.created_at limit 300 loop
    v_reasons := '[]'::jsonb; v_w := 0;
    v_flags := private.email_flags(r.email, p_email);
    v_look := private.email_lookalike(r.email, p_email);
    v_via := (select string_agg(v, '+') from jsonb_array_elements_text(coalesce(v_links -> r.id::text, '[]'::jsonb)) v where v in ('device', 'fingerprint', 'ip'));
    v_verified := private.email_verified(r.id);
    v_temp := private.email_temp(r.email);
    v_gib := private.email_gibberish(r.email);
    select count(*), count(*) filter (where passed), min(started_at),
           count(*) filter (where passed and play_ms > 0 and play_ms < 0.3 * (b -> 'typical' ->> (game || ':' || least(level / 10, 6)))::numeric),
           count(*) filter (where passed and b -> 'typical' ? (game || ':' || least(level / 10, 6)))
      into v_plays, v_wins, v_first_play, v_fast, v_typed from public.minigame_sessions where player_id = r.id;
    select count(*) into v_arcade from public.arcade_plays where player_id = r.id and finished_at is not null;
    select coalesce(sum(delta) filter (where delta > 0 and private.guide_play_reason(reason)), 0), coalesce(-sum(delta) filter (where delta < 0), 0),
           count(distinct date_trunc('day', created_at)), max(created_at) filter (where delta > 0 and private.guide_play_reason(reason))
      into v_earned, v_spent, v_days, v_last_earn from public.resource_ledger where player_id = r.id and resource = 'ink';
    select count(*) into v_plots from public.world_plots where owner_id = r.id;
    select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb), coalesce(sum(n), 0) into v_help, v_boosts from private.integrity_help_counts(p_uid, array[r.id]);
    v_dormant := r.status in ('rewarded', 'capped') and r.created_at < now() - interval '3 days' and (v_last_earn is null or v_last_earn < coalesce(r.qualified_at, r.created_at) + interval '2 days');
    select score into v_score from private.integrity_scores where player_id = r.id;
    -- one person switching accounts: the invited account's games sit in the gaps of the inviter's, never at the same time
    select count(*), count(*) filter (where exists (select 1 from public.minigame_sessions m where m.player_id = p_uid and m.started_at between s.started_at - interval '15 minutes' and s.started_at + interval '15 minutes')),
           count(*) filter (where exists (select 1 from public.minigame_sessions m where m.player_id = p_uid and m.started_at < coalesce(s.finished_at, s.started_at + interval '2 minutes') and coalesce(m.finished_at, m.started_at + interval '2 minutes') > s.started_at))
      into v_nsess, v_close, v_overlap
      from (select started_at, finished_at from public.minigame_sessions where player_id = r.id order by started_at desc limit 60) s;
    v_uname := r.username;
    v_name_look := case when v_inv_uname is not null and length(v_uname) >= 5 and (private.name_shape(v_uname) = private.name_shape(v_inv_uname) and private.name_shape(v_uname) ~ '#'
                          or private.lev(lower(v_uname), lower(v_inv_uname), 2) <= 1 or (length(regexp_replace(lower(v_uname), '[^a-z]', '', 'g')) >= 4 and regexp_replace(lower(v_uname), '[^a-z]', '', 'g') = regexp_replace(lower(v_inv_uname), '[^a-z]', '', 'g')))
                        then v_inv_uname end;
    select count(*) into v_burst from public.referrals y where y.referrer_id = p_uid and y.referee_id <> r.id and abs(extract(epoch from y.created_at - r.created_at)) < 1800;
    v_share := coalesce(r.reward_ink, 0) + coalesce(r.share_ink, 0);
    -- the evidence, each with its weight
    if v_via like '%device%' then v_reasons := v_reasons || jsonb_build_object('w', 0.75, 'why', 'on the inviter''s own device (the same app install)');
    elsif v_via like '%fingerprint%' then v_reasons := v_reasons || jsonb_build_object('w', 0.45, 'why', 'the same device fingerprint and network as the inviter');
    elsif v_via like '%ip%' then v_reasons := v_reasons || jsonb_build_object('w', 0.15, 'why', 'the inviter''s own quiet internet address (family or housemates?)'); end if;
    if v_look is not null then v_reasons := v_reasons || jsonb_build_object('w', 0.55, 'why', 'email is a near-copy of the inviter''s: ' || v_look); end if;
    if v_name_look is not null then v_reasons := v_reasons || jsonb_build_object('w', 0.35, 'why', 'username is a near-copy of the inviter''s (@' || v_name_look || ')'); end if;
    if v_temp then v_reasons := v_reasons || jsonb_build_object('w', 0.4, 'why', 'temporary / throwaway email'); end if;
    if v_gib >= 0.5 then v_reasons := v_reasons || jsonb_build_object('w', round(0.15 + 0.25 * v_gib, 2), 'why', 'random-letter or keyboard-mash email name'); end if;
    if v_doms ? lower(split_part(r.email, '@', 2)) then v_reasons := v_reasons || jsonb_build_object('w', 0.4, 'why', format('a private email domain (%s) only %s of these accounts use', lower(split_part(r.email, '@', 2)), v_doms ->> lower(split_part(r.email, '@', 2)))); end if;
    if v_shapes ? private.name_shape(r.email) then v_reasons := v_reasons || jsonb_build_object('w', 0.35, 'why', format('one of %s invited emails with the same pattern (%s)', v_shapes ->> private.name_shape(r.email), private.name_shape(r.email))); end if;
    if v_stems ? private.email_stem(r.email) and not (v_shapes ? private.name_shape(r.email)) then v_reasons := v_reasons || jsonb_build_object('w', 0.3, 'why', format('one of %s invited emails with the same name, different numbers', v_stems ->> private.email_stem(r.email))); end if;
    if not v_verified and r.joined_at < now() - interval '1 day' then v_reasons := v_reasons || jsonb_build_object('w', 0.2, 'why', 'never confirmed its email'); end if;
    if v_plays + v_arcade = 0 and r.joined_at < now() - interval '1 day' then v_reasons := v_reasons || jsonb_build_object('w', 0.3, 'why', 'never played a game');
    elsif v_plays + v_arcade < 5 then v_reasons := v_reasons || jsonb_build_object('w', 0.12, 'why', format('barely played (%s games)', v_plays + v_arcade)); end if;
    if v_dormant then v_reasons := v_reasons || jsonb_build_object('w', 0.3, 'why', 'stopped earning right after the invite bonus'); end if;
    if v_typed >= 5 and v_fast::numeric / v_typed >= 0.5 then v_reasons := v_reasons || jsonb_build_object('w', 0.3, 'why', format('%s of %s wins far faster than anyone', v_fast, v_typed)); end if;
    if v_nsess >= 5 and v_close::numeric / v_nsess >= 0.8 and v_overlap = 0 then v_reasons := v_reasons || jsonb_build_object('w', 0.55, 'why', format('%s of its %s games sat between the inviter''s own, never at the same time (one person switching accounts)', v_close, v_nsess)); end if;
    if v_boosts > 0 then v_reasons := v_reasons || jsonb_build_object('w', least(0.2 + 0.03 * v_boosts, 0.45), 'why', format('helped the inviter %s times (%s)', v_boosts, (select string_agg(k || ' ' || v, ', ') from jsonb_each_text(v_help) t(k, v)))); end if;
    if exists (select 1 from public.world_plots a join public.world_plots p on p.owner_id = p_uid and abs(a.gx - p.gx) <= 30 and abs(a.gy - p.gy) <= 30 where a.owner_id = r.id)
      then v_reasons := v_reasons || jsonb_build_object('w', 0.08, 'why', 'claimed land right next to the inviter''s'); end if;
    if v_burst >= 2 then v_reasons := v_reasons || jsonb_build_object('w', least(0.1 + 0.05 * v_burst, 0.3), 'why', format('joined within 30 minutes of %s other invited accounts', v_burst)); end if;
    -- combined: 1 − Π(1 − w)
    select 1 - coalesce(exp(sum(ln(1 - least((x ->> 'w')::numeric, 0.99)))), 1) into v_w from jsonb_array_elements(v_reasons) x;
    v_out := v_out || jsonb_build_object('id', r.id, 'username', r.username, 'email', r.email, 'email_flags', to_jsonb(v_flags), 'email_stem', private.email_stem(r.email),
      'lookalike', v_look is not null, 'disposable', v_temp, 'gibberish', round(v_gib, 2), 'verified', v_verified, 'linked_via', v_via,
      'status', r.status, 'account', r.pstatus, 'rewarded', r.status in ('rewarded', 'capped'), 'reward_ink', r.reward_ink, 'share_ink', r.share_ink, 'paid_inviter', v_share,
      'joined', r.created_at, 'plays', v_plays, 'arcade', v_arcade, 'wins', v_wins, 'ink_earned', v_earned, 'ink_spent', v_spent, 'plots', v_plots,
      'active_days', v_days, 'last_active', r.last_active_at, 'dormant', v_dormant, 'help', v_help, 'boosts', v_boosts, 'own_score', v_score,
      'switching', v_nsess >= 5 and v_close::numeric / greatest(v_nsess, 1) >= 0.8 and v_overlap = 0,
      'suspicion', round(100 * coalesce(v_w, 0)), 'reasons', (select coalesce(jsonb_agg(x ->> 'why' order by (x ->> 'w')::numeric desc), '[]'::jsonb) from jsonb_array_elements(v_reasons) x),
      'weights', v_reasons);
  end loop;
  return (select coalesce(jsonb_agg(x order by (x ->> 'suspicion')::int desc, x ->> 'joined'), '[]'::jsonb) from jsonb_array_elements(v_out) x);
end $$;

-- ---- 6. the scan ------------------------------------------------------------------------------------------------
create or replace function private.integrity_scan(p_uid uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sig jsonb := '[]'::jsonb; b jsonb := private.integrity_baseline_get(); c jsonb := private.icfg();
  v_email text; v_created timestamptz; v_linked jsonb; v_strong uuid[]; v_n int; v_m int; v_k int; v_x numeric; v_y numeric; v_list jsonb;
  v_refs jsonb; rf_total int; rf_sus int; rf_bad int; rf_ink bigint; rf_dev int; rf_devp int; rf_dev_ink bigint; rf_junk int; rf_rew int; v_fam jsonb; v_score numeric; v_level text; v_proof boolean; v_two int; v_impact bigint;
begin
  select email, created_at into v_email, v_created from auth.users where id = p_uid;

  -- ===== multi-accounting ======================================================================================
  select coalesce(jsonb_agg(jsonb_build_object('id', l.other, 'username', pr.username, 'via', to_jsonb(l.vias), 'n', l.n, 'status', pl.status) order by l.strength desc, l.n desc), '[]'::jsonb)
    into v_linked
  from (select other, array_agg(distinct via) vias, sum(n)::int n, max(case via when 'device' then 4 when 'fingerprint' then 3 when 'ip' then 2 else 1 end) strength
        from private.integrity_links(p_uid) group by other) l
  join public.profiles pr on pr.id = l.other join public.players pl on pl.id = l.other;
  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_strong from jsonb_array_elements(v_linked) x where x -> 'via' ?| array['device', 'fingerprint', 'ip'];
  select count(*), coalesce(jsonb_agg(x ->> 'username'), '[]'::jsonb) into v_n, v_list from jsonb_array_elements(v_linked) x where x -> 'via' ? 'device';
  if v_n > 0 then sig := sig || private.isig2('shared_device', 'multi_account', least(0.35 + 0.12 * v_n, 0.75),
      format('Plays in the same app install as %s other account%s', v_n, case when v_n = 1 then '' else 's' end), v_list); end if;
  select count(*), coalesce(jsonb_agg(x ->> 'username'), '[]'::jsonb) into v_n, v_list from jsonb_array_elements(v_linked) x where x -> 'via' ? 'fingerprint' and not x -> 'via' ? 'device';
  if v_n > 0 then sig := sig || private.isig2('shared_fingerprint', 'multi_account', least(0.15 + 0.08 * v_n, 0.4),
      format('Same device fingerprint AND network on the same day as %s other account%s', v_n, case when v_n = 1 then '' else 's' end), v_list); end if;
  select count(*), coalesce(jsonb_agg(x ->> 'username'), '[]'::jsonb) into v_n, v_list from jsonb_array_elements(v_linked) x where x -> 'via' ? 'ip' and not x -> 'via' ?| array['device', 'fingerprint'];
  if v_n >= 2 then sig := sig || private.isig2('shared_ip', 'multi_account', least(0.06 * v_n, 0.25),
      format('Same quiet internet address (not a carrier or café) within a day as %s other accounts', v_n), v_list); end if;

  -- ===== Ink rings ===============================================================================================
  -- how strongly an account is tied to them: the same app install 1, the same fingerprint and network 0.6, a quiet shared address 0.35
  -- (a family at home shares an address: alone it's barely a hint)
  select count(*), coalesce(sum(f.ink), 0), coalesce(jsonb_agg(jsonb_build_object('username', pr.username, 'kinds', to_jsonb(f.kinds), 'times', f.times, 'ink', f.ink,
           'via', (select x -> 'via' from jsonb_array_elements(v_linked) x where (x ->> 'id')::uuid = f.giver limit 1)) order by f.ink desc), '[]'::jsonb),
         max((select case when x -> 'via' ? 'device' then 1 when x -> 'via' ? 'fingerprint' then 0.6 else 0.35 end from jsonb_array_elements(v_linked) x where (x ->> 'id')::uuid = f.giver limit 1))
    into v_n, v_impact, v_list, v_x
  -- (invite bonuses are weighed under referral fraud, not counted twice here)
  from (select giver, array_agg(distinct kind) kinds, sum(times)::int times, sum(ink) ink from private.integrity_inflows(p_uid) where kind <> 'invite' group by giver) f
  join public.profiles pr on pr.id = f.giver where f.giver = any (v_strong);
  if v_n > 0 then sig := sig || private.isig2('linked_inflows', 'ink_ring', least(0.15 + 0.5 * v_x + 0.08 * (v_n - 1), 0.75),
      format('%s account%s %s helped them earn', v_n, case when v_n = 1 then '' else 's' end,
             case when v_x >= 1 then 'on their own app install' when v_x >= 0.6 then 'on the same kind of device and network' else 'on their quiet internet address' end),
      v_list, false, v_impact); end if;
  select max(case when x -> 'via' ? 'device' then 1 when x -> 'via' ? 'fingerprint' then 0.6 else 0.35 end) into v_y
    from public.referrals r join jsonb_array_elements(v_linked) x on (x ->> 'id')::uuid = r.referrer_id
   where r.referee_id = p_uid and r.referrer_id = any (v_strong);
  if v_y is not null then
    sig := sig || private.isig2('invited_by_linked', 'referral', 0.6 * v_y,
      case when v_y >= 1 then 'Self-referral alt: invited by an account on their own app install'
           when v_y >= 0.6 then 'Invited by an account on the same kind of device and network'
           else 'Invited by an account on the same quiet internet address (family or housemates?)' end,
      (select jsonb_agg(pr.username) from public.referrals r join public.profiles pr on pr.id = r.referrer_id where r.referee_id = p_uid));
  end if;
  with f as (select giver, sum(times) times from private.integrity_inflows(p_uid) where kind <> 'invite' group by giver), tot as (select sum(times) t from f)
  select (select t from tot), (select coalesce(sum(times), 0) from (select times from f order by times desc limit 2) z),
         (select count(*) from f join public.players pl on pl.id = f.giver
           where f.times >= 3 and (pl.created_at > now() - interval '14 days' or (select count(*) from public.minigame_sessions s where s.player_id = f.giver) < 5))
    into v_x, v_y, v_n;
  if coalesce(v_x, 0) >= 20 and v_y / v_x >= 0.8 then sig := sig || private.isig2('concentrated_help', 'ink_ring', 0.12,
      format('%s%% of the help they got came from just 2 accounts', round(100 * v_y / v_x))); end if;
  if v_n >= 3 then sig := sig || private.isig2('throwaway_helpers', 'ink_ring', least(0.1 + 0.05 * v_n, 0.4), format('%s brand-new or barely-played accounts repeatedly helped them earn', v_n)); end if;
  select count(*), coalesce(jsonb_agg(pr.username), '[]'::jsonb) into v_n, v_list from (
    select v.voter_id, count(*) filter (where k.player_id = p_uid) mine, count(*) total
    from public.sketch_votes v join public.sketches k on k.id = v.sketch_id where v.created_at > now() - interval '90 days'
      and v.voter_id in (select v2.voter_id from public.sketch_votes v2 join public.sketches k2 on k2.id = v2.sketch_id where k2.player_id = p_uid)
    group by 1) z join public.profiles pr on pr.id = z.voter_id
    where z.mine >= 3 and z.mine::numeric / z.total >= 0.8;
  if v_n >= 3 then sig := sig || private.isig2('loyal_voters', 'ink_ring', least(0.1 + 0.05 * v_n, 0.35), format('%s accounts vote almost only for their sketches', v_n), v_list); end if;
  v_list := private.integrity_propped_wins(p_uid, coalesce(v_strong, '{}') || coalesce((select array_agg(referee_id) from public.referrals where referrer_id = p_uid), '{}'));
  if jsonb_array_length(v_list) > 0 then sig := sig || private.isig2('propped_wins', 'ink_ring', least(0.4 + 0.1 * jsonb_array_length(v_list), 0.7),
      format('%s prize-winning entr%s got most of their votes from their own invited or linked accounts', jsonb_array_length(v_list), case when jsonb_array_length(v_list) = 1 then 'y' else 'ies' end), v_list); end if;

  -- ===== referral fraud ==========================================================================================
  v_refs := private.integrity_referees(p_uid, v_strong, v_email);
  select count(*), count(*) filter (where (x ->> 'suspicion')::int >= 60), count(*) filter (where (x ->> 'suspicion')::int >= 80),
         coalesce(sum((x ->> 'paid_inviter')::bigint) filter (where (x ->> 'suspicion')::int >= 60), 0),
         count(*) filter (where (x ->> 'linked_via') like '%device%' and (x ->> 'rewarded')::boolean),
         count(*) filter (where (x ->> 'linked_via') like '%device%' and (x ->> 'rewarded')::boolean and (x ->> 'suspicion')::int >= 85),
         coalesce(sum((x ->> 'paid_inviter')::bigint) filter (where (x ->> 'linked_via') like '%device%' and (x ->> 'rewarded')::boolean), 0),
         count(*) filter (where not (x ->> 'verified')::boolean and (x ->> 'plays')::int + (x ->> 'arcade')::int = 0),
         count(*) filter (where (x ->> 'rewarded')::boolean)
    into rf_total, rf_sus, rf_bad, rf_ink, rf_dev, rf_devp, rf_dev_ink, rf_junk, rf_rew
  from jsonb_array_elements(v_refs) x;
  if rf_dev > 0 then sig := sig || private.isig2('self_referral_device', 'referral', least(0.7 + 0.08 * rf_dev, 0.95),
      format('Self-referral: %s invited account%s on their own app install collected the invite bonus', rf_dev, case when rf_dev = 1 then '' else 's' end),
      (select jsonb_agg(jsonb_build_object('username', x ->> 'username', 'email', x ->> 'email', 'reasons', x -> 'reasons')) from jsonb_array_elements(v_refs) x where (x ->> 'linked_via') like '%device%'),
      -- proof when the account on their own app install is plainly not a real second player too (a family sharing a tablet isn't proof)
      rf_devp > 0, rf_dev_ink); end if;
  if rf_sus >= 1 then
    v_x := rf_sus::numeric / greatest(rf_total, 1);
    sig := sig || private.isig2('fake_referrals', 'referral',
      case when rf_sus >= 3 and v_x >= 0.5 then least(0.6 + 0.05 * rf_bad, 0.92) when rf_sus >= 2 then 0.45 + 0.05 * rf_bad else 0.25 + 0.1 * rf_bad end,
      format('%s of their %s invited accounts look fake (suspicion 60+)%s', rf_sus, rf_total, case when rf_ink > 0 then format(' — %s Ink paid to them for these', rf_ink) else '' end),
      (select jsonb_agg(jsonb_build_object('username', x ->> 'username', 'email', x ->> 'email', 'suspicion', x -> 'suspicion', 'reasons', x -> 'reasons'))
         from (select x from jsonb_array_elements(v_refs) x where (x ->> 'suspicion')::int >= 60 order by (x ->> 'suspicion')::int desc limit 12) z), false, rf_ink);
  end if;
  if rf_junk >= 3 then sig := sig || private.isig2('junk_signups', 'referral', least(0.15 + 0.05 * rf_junk, 0.45),
      format('%s invited accounts never confirmed their email and never played', rf_junk)); end if;
  select count(*), count(*) filter (where r2.referee_id = any (v_strong)) into v_n, v_m
    from public.referrals r1 join public.referrals r2 on r2.referrer_id = r1.referee_id where r1.referrer_id = p_uid;
  if v_m > 0 then sig := sig || private.isig2('referral_chain', 'referral', least(0.3 + 0.1 * v_m, 0.6),
      format('%s of the %s accounts their invited accounts invited are on their own device or quiet address (a chain)', v_m, v_n)); end if;
  -- as an invited account themselves
  if private.email_temp(v_email) then sig := sig || private.isig2('disposable_email', 'referral', case when exists (select 1 from public.referrals where referee_id = p_uid) then 0.15 else 0.05 end,
      'Signed up with a throwaway email address', jsonb_build_array(split_part(v_email, '@', 2))); end if;
  select coalesce(sum(n), 0) into v_n from private.integrity_help_counts((select referrer_id from public.referrals where referee_id = p_uid), array[p_uid]) h;
  if v_n >= 5 then sig := sig || private.isig2('helps_inviter', 'ink_ring', least(0.08 + 0.01 * v_n, 0.25),
      format('Spent %s actions voting for, inspiring, stamping or visiting the account that invited them', v_n)); end if;

  -- ===== speed ===================================================================================================
  select count(*) filter (where b -> 'typical' ? (s.game || ':' || least(s.level / 10, 6))),
         count(*) filter (where s.play_ms < 0.3 * (b -> 'typical' ->> (s.game || ':' || least(s.level / 10, 6)))::numeric)
    into v_n, v_m
  from public.minigame_sessions s where s.player_id = p_uid and s.passed and s.started_at > now() - interval '30 days' and s.play_ms > 0;
  if v_n >= 15 and v_m::numeric / v_n >= 0.4 then
    sig := sig || private.isig2('impossible_speed', 'speed', least(0.2 + 0.5 * v_m::numeric / v_n, 0.7),
      format('%s of %s wins took under a third of a typical player''s time', v_m, v_n),
      (select jsonb_agg(jsonb_build_object('game', game, 'level', level, 'seconds', round(play_ms / 1000.0, 1),
                 'typical_seconds', round((b -> 'typical' ->> (game || ':' || least(level / 10, 6)))::numeric / 1000.0, 1))) from (
         select * from public.minigame_sessions s where s.player_id = p_uid and s.passed and s.started_at > now() - interval '30 days'
           and s.play_ms < 0.3 * (b -> 'typical' ->> (s.game || ':' || least(s.level / 10, 6)))::numeric order by s.play_ms limit 8) e));
  end if;
  select count(*) into v_n from public.minigame_sessions s where s.player_id = p_uid and s.started_at > now() - interval '30 days'
    and (coalesce(array_length(s.flags, 1), 0) > 0 or s.review_status in ('flagged', 'voided'));
  if v_n >= 3 then sig := sig || private.isig2('flagged_runs', 'speed', least(0.08 * v_n, 0.4),
      format('%s minigame runs were flagged by the server checks in 30 days', v_n),
      (select jsonb_agg(jsonb_build_object('game', game, 'level', level, 'flags', flags, 'review', review_status)) from (
         select * from public.minigame_sessions s where s.player_id = p_uid and s.started_at > now() - interval '30 days'
           and (coalesce(array_length(s.flags, 1), 0) > 0 or s.review_status in ('flagged', 'voided')) order by s.started_at desc limit 8) e)); end if;

  -- ===== automation ==============================================================================================
  select count(*) filter (where automation), count(*) filter (where emulator),
         (select jsonb_agg(distinct r2) from private.sightings s2, unnest(s2.reasons) r2 where s2.player_id = p_uid)
    into v_n, v_m, v_list from private.sightings where player_id = p_uid and last_at > now() - interval '60 days';
  if v_n > 0 then sig := sig || private.isig2('automation', 'automation', 0.85, 'Played through browser automation (a bot-controlled browser)', v_list, true); end if;
  if v_m > 0 then sig := sig || private.isig2('emulator', 'automation', 0.25, 'Played on an emulator or virtual device', v_list); end if;
  -- awake at the keyboard 20+ hours a day, on several days (only games and play, never things that pay while you sleep)
  select count(*) into v_n from (select date_trunc('day', created_at) d, count(distinct date_trunc('hour', created_at)) h from public.resource_ledger
    where player_id = p_uid and resource = 'ink' and delta > 0 and created_at > now() - interval '30 days' and private.integrity_active_reason(reason) group by 1) z where h >= 20;
  if v_n >= 2 then sig := sig || private.isig2('no_sleep', 'automation', least(0.25 + 0.08 * v_n, 0.6), format('Played games in 20+ different hours of the day on %s days', v_n)); end if;
  -- machine-steady reaction: the gap between finishing one game and starting the next
  with t as (select started_at, finished_at from public.minigame_sessions where player_id = p_uid and started_at > now() - interval '14 days' and finished_at is not null
             union all select started_at, finished_at from public.arcade_plays where player_id = p_uid and started_at > now() - interval '14 days' and finished_at is not null),
       g as (select extract(epoch from started_at - lag(finished_at) over (order by started_at)) gap from t)
  select count(*), stddev_samp(gap) / nullif(avg(gap), 0) into v_n, v_x from g where gap between 0.3 and 120;
  if v_n >= 60 and v_x < 0.1 then sig := sig || private.isig2('steady_timing', 'automation', case when v_x < 0.05 then 0.6 else 0.42 end,
      format('%s games started a machine-steady time after the last one ended (variation %s%%) — like a script', v_n, round(v_x * 100, 1))); end if;
  -- two games at once
  with t as (select started_at s, finished_at f from public.minigame_sessions where player_id = p_uid and started_at > now() - interval '14 days' and finished_at is not null
             union all select started_at, finished_at from public.arcade_plays where player_id = p_uid and started_at > now() - interval '14 days' and finished_at is not null)
  select count(*) into v_n from (select s, f, lag(f) over (order by s) pf from t) z where pf is not null and s < pf - interval '3 seconds';
  if v_n >= 10 then sig := sig || private.isig2('parallel_games', 'automation', least(0.2 + 0.02 * v_n, 0.55), format('%s games started while another was still being played', v_n)); end if;
  -- payout bursts
  select max(n) into v_n from (select floor(extract(epoch from created_at) / 10) bk, count(*) n from public.resource_ledger
    where player_id = p_uid and resource = 'ink' and delta > 0 and created_at > now() - interval '14 days' and private.integrity_active_reason(reason) group by 1) z;
  if coalesce(v_n, 0) > greatest(coalesce((b ->> 'burst_p999')::numeric, 0) * 2, 15) then sig := sig || private.isig2('payout_burst', 'automation', 0.4,
      format('%s game payouts within 10 seconds (most players: at most %s)', v_n, round(coalesce((b ->> 'burst_p999')::numeric, 0)))); end if;
  -- arcade scores sent above what's humanly possible
  select count(*) into v_n from (
    select 1 from public.arcade_plays where player_id = p_uid and claimed_score > score and started_at > now() - interval '30 days'
    union all select 1 from public.arcade_mirror_plays where player_id = p_uid and claimed_score > score and started_at > now() - interval '30 days'
    union all select 1 from public.arcade_secret_plays where player_id = p_uid and claimed_score > score and started_at > now() - interval '30 days') z;
  if v_n >= 1 then sig := sig || private.isig2('arcade_tamper', 'automation', case when v_n >= 3 then 0.6 when v_n = 2 then 0.45 else 0.2 end,
      format('%s arcade score%s sent above what''s humanly possible in the time played (a modified client?)', v_n, case when v_n = 1 then '' else 's' end), null, v_n >= 3); end if;

  -- ===== exploits (including ones nobody has found yet) =========================================================
  -- a source paying them far beyond anyone else
  select coalesce(jsonb_agg(jsonb_build_object('source', reason, 'day', d::date, 'ink', ink, 'p99', round(p99), 'times', round(ink / greatest(p999, 1), 1)) order by ink / greatest(p999, 1) desc), '[]'::jsonb),
         max(ink / greatest(p999, 1)), coalesce(sum(greatest(ink - p99, 0)), 0)::bigint
    into v_list, v_x, v_impact
  from (select l.reason, date_trunc('day', l.created_at) d, sum(l.delta) ink, (b -> 'reason_day' -> l.reason ->> 'p999')::numeric p999, (b -> 'reason_day' -> l.reason ->> 'p99')::numeric p99,
               (b -> 'reason_day' -> l.reason ->> 'p50')::numeric p50
          from public.resource_ledger l where l.player_id = p_uid and l.resource = 'ink' and l.delta > 0 and l.created_at > now() - interval '14 days'
           and b -> 'reason_day' ? l.reason group by 1, 2) z
  where ink > greatest(3 * p999, 10 * coalesce(p50, 0), 200);
  if jsonb_array_length(v_list) > 0 then sig := sig || private.isig2('source_outlier', 'exploit', least(0.3 + 0.05 * v_x, 0.75),
      format('Earned far more from %s than anyone (up to %s× everyone''s 99.9th percentile day)', (select string_agg(distinct x ->> 'source', ', ') from jsonb_array_elements(v_list) x), round(v_x, 1)),
      v_list, false, v_impact); end if;
  -- the same payout twice (a bug being farmed)
  select count(*), coalesce(sum(extra), 0)::bigint, coalesce(jsonb_agg(jsonb_build_object('source', reason, 'ref', ref_type || ':' || ref_id, 'times', n) order by n desc), '[]'::jsonb)
    into v_n, v_impact, v_list
  from (select reason, ref_type, ref_id, count(*) n, sum(delta) - max(delta) extra from public.resource_ledger
         where player_id = p_uid and resource = 'ink' and delta > 0 and created_at > now() - interval '30 days' and ref_id is not null
           and (ref_type in ('minigame_session', 'pvp_match', 'home_game', 'find', 'travel_stop', 'inkborn_game', 'planet_game', 'space_game')
                or (ref_type in ('arcade', 'arcade_mirror', 'arcade_secret') and ref_id ~ '^(arcade|arcade-match|arcade_mirror|arcade_secret):'))
         group by 1, 2, 3 having count(*) > 1) z;
  if v_n >= 1 then sig := sig || private.isig2('double_paid', 'exploit', case when v_n >= 10 then 0.9 when v_n >= 3 then 0.8 else 0.3 end,
      format('%s payout%s paid more than once (%s extra Ink) — a bug being repeated?', v_n, case when v_n = 1 then '' else 's' end, v_impact), v_list, v_n >= 3, v_impact); end if;
  -- an Ink balance changed outside the ledger
  select (select amount from public.resource_balances where player_id = p_uid and resource = 'ink'), (select balance_after from (select id, balance_after from public.resource_ledger where player_id = p_uid and resource = 'ink' order by created_at desc limit 20) z order by id desc limit 1)
    into v_x, v_y;
  if v_y is not null and v_x is not null and abs(v_x - v_y) > 10 then sig := sig || private.isig2('balance_mismatch', 'exploit', 0.85,
      format('Their Ink balance (%s) doesn''t match the ledger (%s): changed outside the game''s own payouts', v_x::bigint, v_y::bigint), null, true, greatest(v_x - v_y, 0)::bigint); end if;
  -- luck far beyond the odds
  select count(*), count(*) filter (where exists (select 1 from public.plot_rarities rr where rr.id = w.rarity and (rr.tier in ('ultra', 'primordial') or rr.ppm > 0)))
    into v_n, v_m
  from public.plot_ownership o join public.world_plots w on w.gx = o.gx and w.gy = o.gy and w.owner_id = o.player_id
  where o.player_id = p_uid and o.released_at is null and o.method in ('starter', 'acquire') and o.acquired_at > now() - interval '90 days';
  v_k := coalesce((select count(*) from public.luck_choices where player_id = p_uid), 0);
  -- ultras a ticket guaranteed (and plots changed later — Crucible, Rebirth — are why this stays a hint, never proof)
  v_m := v_m - coalesce((select count(*) from public.roll_tickets t join public.plot_rarities rr on rr.id = t.min_rarity
                          where t.player_id = p_uid and t.used_at > now() - interval '90 days' and (rr.tier in ('ultra', 'primordial') or rr.ppm > 0)), 0);
  v_x := (v_n + 2 * v_k) * coalesce((b ->> 'ultra_ppm')::numeric, 3000) / 1000000.0 * 5; -- (generous: every claim in a Hot Zone, every Luck pick 3 rolls)
  if v_m >= 4 and v_m > 10 * v_x + 3 then sig := sig || private.isig2('impossible_luck', 'exploit', least(0.2 + 0.03 * v_m, 0.45),
      format('%s ultras from %s claims and %s Luck picks — expected about %s even with every bonus', v_m, v_n, v_k, round(v_x, 1))); end if;
  -- the same plot claimed over and over
  select count(*) into v_n from (select gx, gy from public.plot_ownership where player_id = p_uid and acquired_at > now() - interval '30 days' group by 1, 2 having count(*) >= 3) z;
  if v_n >= 2 then sig := sig || private.isig2('plot_cycling', 'exploit', least(0.2 + 0.05 * v_n, 0.5), format('%s plots claimed, let go and claimed again 3+ times in a month (rerolling?)', v_n)); end if;
  -- any game action repeated far more than anyone does
  select coalesce(jsonb_agg(jsonb_build_object('action', kind, 'day', d::date, 'times', n, 'p999', round(p999)) order by n / greatest(p999, 1) desc), '[]'::jsonb), max(n / greatest(p999, 1))
    into v_list, v_x
  from (select f.kind, date_trunc('day', f.at) d, count(*) n, (b -> 'kind_day' -> f.kind ->> 'p999')::numeric p999 from private.fairplay_log f
         where f.player_id = p_uid and f.at > now() - interval '14 days' and b -> 'kind_day' ? f.kind group by 1, 2) z
  where n > greatest(3 * p999, 30);
  if jsonb_array_length(v_list) > 0 then sig := sig || private.isig2('repeated_mechanic', 'exploit', least(0.25 + 0.04 * v_x, 0.55),
      format('Repeated %s far more than anyone (up to %s× the busiest players)', (select string_agg(distinct x ->> 'action', ', ') from jsonb_array_elements(v_list) x), round(v_x, 1)), v_list); end if;
  -- the egg loop
  v_list := private.egg_loop_stats(p_uid);
  v_n := coalesce((v_list ->> 'excess')::int, 0);
  if v_n >= 2 then sig := sig || private.isig2('egg_loop', 'exploit', least(0.75 + 0.01 * v_n, 0.95),
      format('Egg loop: sacrificed %s Inkborn they never had for %s Luck', v_n, v_list ->> 'luck_from_inkborn'),
      jsonb_build_array(format('%s Inkborn sacrificed', v_list ->> 'sacrificed'), format('could have had %s', v_list ->> 'could_have'), format('up to %s in a day', v_list ->> 'peak_day')), true); end if;

  -- ===== location / network (context, never enough on its own) ===================================================
  select count(*), count(*) filter (where (i.is_vpn or i.is_proxy or i.is_datacenter) and coalesce(i.as_org, '') !~* '(apple|icloud|cloudflare|akamai|fastly|google)'), count(*) filter (where i.is_tor)
    into v_n, v_m, v_k
  from private.sightings s join private.ip_intel i on i.ip_hash = s.ip_hash where s.player_id = p_uid and s.last_at > now() - interval '30 days';
  if v_n >= 3 and v_m::numeric / v_n >= 0.5 then sig := sig || private.isig2('vpn', 'location', 0.04, format('%s of %s sessions came through a VPN, proxy or datacenter', v_m, v_n)); end if;
  if v_k > 0 then sig := sig || private.isig2('tor', 'location', 0.12, format('%s sessions came through Tor', v_k)); end if;
  select count(*) into v_n from private.sightings a join private.ip_intel ia on ia.ip_hash = a.ip_hash
    join private.sightings c2 on c2.player_id = a.player_id and c2.id <> a.id join private.ip_intel ic on ic.ip_hash = c2.ip_hash
    where a.player_id = p_uid and a.last_at > now() - interval '30 days' and ia.country <> ic.country
      and abs(extract(epoch from c2.first_at - a.last_at)) < 3600
      and not coalesce(ia.is_vpn or ia.is_proxy or ia.is_datacenter or ia.is_tor or ia.is_mobile or ic.is_vpn or ic.is_proxy or ic.is_datacenter or ic.is_tor or ic.is_mobile, false);
  if v_n > 0 then sig := sig || private.isig2('impossible_travel', 'location', 0.15, 'Connected from two different countries less than an hour apart'); end if;
  with net as (select distinct i.country from private.sightings s join private.ip_intel i on i.ip_hash = s.ip_hash
               where s.player_id = p_uid and i.country is not null and not coalesce(i.is_vpn or i.is_proxy or i.is_datacenter or i.is_tor, false)),
       pl as (select k.country, count(*) n from public.plot_ownership o join public.world_plots w on w.gx = o.gx and w.gy = o.gy
              join public.world_cities k on k.id = w.city_id
              where o.player_id = p_uid and o.released_at is null and o.method in ('starter', 'acquire') and o.acquired_at > now() - interval '60 days' group by 1)
  select (select count(*) from net), coalesce((select sum(n) from pl where country not in (select country from net)), 0), coalesce((select sum(n) from pl), 0),
         (select jsonb_agg(jsonb_build_object('country', country, 'plots', n)) from pl where country not in (select country from net))
    into v_m, v_n, v_k, v_list;
  if v_m >= 1 and v_n >= 15 and v_n::numeric / greatest(v_k, 1) >= 0.8 then sig := sig || private.isig2('plots_far_from_network', 'location', 0.2,
      format('%s of %s recent claims in countries their own connection never comes from (GPS spoofing? travel?)', v_n, v_k), v_list); end if;

  -- ===== the verdict =============================================================================================
  select coalesce(jsonb_object_agg(fam, round(least(p, coalesce((c -> 'family_cap' ->> fam)::numeric, 0.95)), 3)), '{}'::jsonb) into v_fam from (
    select x ->> 'family' fam, 1 - exp(sum(ln(1 - least((x ->> 'w')::numeric, 0.99)))) p from jsonb_array_elements(sig) x group by 1) z;
  select 100 * (1 - coalesce(exp(sum(ln(1 - least(value::numeric, 0.99)))), 1)) into v_score from jsonb_each_text(v_fam);
  v_proof := exists (select 1 from jsonb_array_elements(sig) x where (x ->> 'proof')::boolean);
  select count(*) into v_two from jsonb_each_text(v_fam) where value::numeric >= 0.5;
  v_level := case when v_score >= coalesce((c ->> 'severe_score')::numeric, 85) and (v_proof or v_two >= 2) then 'severe'
                  when v_score >= coalesce((c ->> 'high_score')::numeric, 65) then 'high'
                  when v_score >= coalesce((c ->> 'watch_score')::numeric, 35) then 'watch' else 'low' end;
  -- Ink involved: the biggest figure in each kind of evidence (signals of one kind often count the same Ink)
  select coalesce(sum(m), 0) into v_impact from (select max((x ->> 'impact')::bigint) m from jsonb_array_elements(sig) x group by x ->> 'family') z;
  return jsonb_build_object('score', round(coalesce(v_score, 0)), 'level', v_level, 'version', 2, 'families', v_fam, 'proof', v_proof, 'impact', v_impact,
    'signals', (select coalesce(jsonb_agg(x order by (x ->> 'proof')::boolean desc, (x ->> 'w')::numeric desc), '[]'::jsonb) from jsonb_array_elements(sig) x),
    'linked', v_linked, 'referrals', v_refs);
end $$;

create or replace function private.integrity_scan_save(p_uid uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb := private.integrity_scan(p_uid);
begin
  insert into private.integrity_scores (player_id, score, level, signals, linked, scanned_at, families, referrals, impact, proof, version)
  values (p_uid, (r ->> 'score')::int, r ->> 'level', r -> 'signals', r -> 'linked', now(), r -> 'families',
          coalesce((select jsonb_agg(x - 'weights') from jsonb_array_elements(r -> 'referrals') x), '[]'::jsonb), (r ->> 'impact')::bigint, (r ->> 'proof')::boolean, 2)
  on conflict (player_id) do update set score = excluded.score, level = excluded.level, signals = excluded.signals, linked = excluded.linked, scanned_at = now(),
    families = excluded.families, referrals = excluded.referrals, impact = excluded.impact, proof = excluded.proof, version = 2;
  return r;
end $$;

-- the list shows the families and impact too
select private.fn_patch('public.admin_integrity_list(text,text,integer)',
  '''linked'', jsonb_array_length(s.linked), ''scanned_at'', s.scanned_at,',
  '''linked'', jsonb_array_length(s.linked), ''scanned_at'', s.scanned_at, ''families'', s.families, ''impact'', s.impact, ''proof'', s.proof, ''version'', s.version,');

-- ---- 7. scanning on its own -------------------------------------------------------------------------------------
/** the scanner keeps itself fresh: everyone active in the last two days, a batch an hour */
create or replace function private.integrity_auto_scan() returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_n int := 0;
begin
  if not coalesce((private.icfg() ->> 'auto_scan')::boolean, true) then return 0; end if;
  perform set_config('request.jwt.claims', coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}'), true);
  delete from private.integrity_baseline where at < now() - interval '50 minutes';
  perform private.integrity_baseline_get();
  for r in select p.id from public.players p left join private.integrity_scores s on s.player_id = p.id
            where p.last_active_at > now() - interval '2 days' and (s.player_id is null or s.version < 2 or s.scanned_at < now() - interval '6 hours')
            order by s.scanned_at nulls first limit 150 loop
    begin perform private.integrity_scan_save(r.id); v_n := v_n + 1; exception when others then null; end;
  end loop;
  return v_n;
end $$;
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'landvas-integrity';
      perform cron.schedule('landvas-integrity', '41 * * * *', 'select private.integrity_auto_scan()');
    exception when others then raise notice 'pg_cron not available here (%): scans run from the admin page', sqlerrm;
    end;
  end if;
end $$;

-- a player's own session ping rescans them only with a fresh baseline at hand (the hourly scan keeps it fresh), and a scan
-- that fails never fails the ping
select private.fn_patch('private.integrity_record(uuid,text,jsonb)',
  '  if v_last is null or v_last < now() - interval ''1 hour'' then perform private.integrity_scan_save(p_uid); end if;',
  '  if (v_last is null or v_last < now() - interval ''1 hour'') and exists (select 1 from private.integrity_baseline where at > now() - interval ''3 hours'') then
    begin perform private.integrity_scan_save(p_uid); exception when others then null; end;
  end if;');

-- ---- 8. the radar: what's going wrong in the whole game right now ---------------------------------------------
create or replace function public.admin_exploit_radar() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  return jsonb_build_object(
    'at', now(),
    -- every source: today vs its usual day, how many earn it, and how much the top earner takes
    'sources', (select coalesce(jsonb_agg(x order by (x ->> 'spike')::numeric desc nulls last, (x ->> 'today')::bigint desc), '[]'::jsonb) from (
      select jsonb_build_object('source', t.reason, 'key', 'reason:' || t.reason, 'today', t.ink, 'players', t.players,
               'usual', round(coalesce(w.avg_day, 0)), 'spike', case when coalesce(w.avg_day, 0) > 0 then round(t.ink / w.avg_day, 2) end,
               'top', (select jsonb_build_object('player', private.profile_json(z.player_id), 'ink', z.ink, 'share', round(z.ink::numeric / greatest(t.ink, 1), 3))
                       from (select player_id, sum(delta) ink from public.resource_ledger where resource = 'ink' and delta > 0 and reason = t.reason and created_at > now() - interval '24 hours'
                             group by 1 order by 2 desc limit 1) z)) x
      from (select reason, sum(delta) ink, count(distinct player_id) players from public.resource_ledger where resource = 'ink' and delta > 0 and created_at > now() - interval '24 hours' group by 1) t
      left join (select reason, sum(delta) / 7.0 avg_day from public.resource_ledger where resource = 'ink' and delta > 0
                   and created_at between now() - interval '8 days' and now() - interval '24 hours' group by 1) w on w.reason = t.reason) s),
    -- payouts paid twice in a week (by kind)
    'double_paid', (select coalesce(jsonb_agg(jsonb_build_object('ref_type', ref_type, 'groups', g, 'players', p, 'extra_ink', e) order by e desc), '[]'::jsonb) from (
      select ref_type, count(*) g, count(distinct player_id) p, sum(extra) e from (
        select player_id, reason, ref_type, ref_id, sum(delta) - max(delta) extra from public.resource_ledger
         where resource = 'ink' and delta > 0 and created_at > now() - interval '7 days' and ref_id is not null
           and (ref_type in ('minigame_session', 'pvp_match', 'home_game', 'find', 'travel_stop', 'inkborn_game', 'planet_game', 'space_game')
                or (ref_type in ('arcade', 'arcade_mirror', 'arcade_secret') and ref_id ~ '^(arcade|arcade-match|arcade_mirror|arcade_secret):'))
         group by 1, 2, 3, 4 having count(*) > 1) d group by 1) z),
    -- balances out of step with the ledger (players active this week)
    'mismatched', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(b.player_id), 'balance', b.amount, 'ledger', l.balance_after)), '[]'::jsonb)
      from public.resource_balances b join public.players pl on pl.id = b.player_id and pl.last_active_at > now() - interval '7 days'
      join lateral (select balance_after from (select x.id, x.balance_after from public.resource_ledger x where x.player_id = b.player_id and x.resource = 'ink' order by x.created_at desc limit 20) z
                    order by z.id desc limit 1) l on true
      where b.resource = 'ink' and abs(b.amount - l.balance_after) > 10),
    -- game actions far busier today than usual
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('action', t.kind, 'today', t.n, 'usual', round(coalesce(w.avg_day, 0)), 'players', t.p,
                  'spike', case when coalesce(w.avg_day, 0) > 0 then round(t.n / w.avg_day, 2) end) order by t.n / greatest(coalesce(w.avg_day, 1), 1) desc), '[]'::jsonb)
      from (select kind, count(*) n, count(distinct player_id) p from private.fairplay_log where at > now() - interval '24 hours' group by 1) t
      left join (select kind, count(*) / 7.0 avg_day from private.fairplay_log where at between now() - interval '8 days' and now() - interval '24 hours' group by 1) w on w.kind = t.kind),
    -- arcade scores sent above the envelope this week
    'arcade_tamper', (select coalesce(jsonb_agg(jsonb_build_object('game', game, 'plays', n, 'players', p)), '[]'::jsonb) from (
      select game, count(*) n, count(distinct player_id) p from public.arcade_plays where claimed_score > score and started_at > now() - interval '7 days' group by 1) z),
    -- the riskiest players right now
    'top', (select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(s.player_id), 'score', s.score, 'level', s.level, 'families', s.families,
              'impact', s.impact, 'proof', s.proof, 'top', s.signals -> 0 ->> 'label') order by s.score desc), '[]'::jsonb)
      from (select * from private.integrity_scores where level in ('severe', 'high') order by score desc limit 15) s),
    'switches_off', (select coalesce(jsonb_agg(key), '[]'::jsonb) from private.earn_switches));
end $$;

/** referral fraud: every inviter, worst first, with each invited account's evidence */
create or replace function public.admin_referral_fraud(p_min int default 0, p_limit int default 100) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  return jsonb_build_object(
    'scanned_at', (select max(scanned_at) from private.integrity_scores),
    'rows', coalesce((select jsonb_agg(x order by (x ->> 'referral')::numeric desc, (x ->> 'fake')::int desc) from (
      select jsonb_build_object('player', private.profile_json(s.player_id), 'email', u.email, 'status', pl.status, 'score', s.score, 'level', s.level,
               'referral', coalesce((s.families ->> 'referral')::numeric, 0),
               'invited', jsonb_array_length(s.referrals),
               'fake', (select count(*) from jsonb_array_elements(s.referrals) r where (r ->> 'suspicion')::int >= 60),
               'unverified', (select count(*) from jsonb_array_elements(s.referrals) r where not coalesce((r ->> 'verified')::boolean, true)),
               'never_played', (select count(*) from jsonb_array_elements(s.referrals) r where coalesce((r ->> 'plays')::int, 0) + coalesce((r ->> 'arcade')::int, 0) = 0),
               'temp', (select count(*) from jsonb_array_elements(s.referrals) r where coalesce((r ->> 'disposable')::boolean, false)),
               'paid', (select coalesce(sum((r ->> 'paid_inviter')::bigint), 0) from jsonb_array_elements(s.referrals) r),
               'paid_fake', (select coalesce(sum((r ->> 'paid_inviter')::bigint), 0) from jsonb_array_elements(s.referrals) r where (r ->> 'suspicion')::int >= 60),
               'referees', s.referrals, 'scanned_at', s.scanned_at) x
      from private.integrity_scores s join public.players pl on pl.id = s.player_id left join auth.users u on u.id = s.player_id
      where jsonb_array_length(s.referrals) > 0
        and (select count(*) from jsonb_array_elements(s.referrals) r where (r ->> 'suspicion')::int >= 60) >= greatest(p_min, 0)
      order by coalesce((s.families ->> 'referral')::numeric, 0) desc limit least(greatest(p_limit, 1), 300)) t), '[]'::jsonb));
end $$;

revoke all on function public.admin_exploit_radar() from public, anon;
revoke all on function public.admin_referral_fraud(int, int) from public, anon;
grant execute on function public.admin_exploit_radar() to authenticated;
grant execute on function public.admin_referral_fraud(int, int) to authenticated;
