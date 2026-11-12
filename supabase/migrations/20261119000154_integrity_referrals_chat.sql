-- Integrity, part 2: deeper invites, wins propped up by alts, heavier self-referral weights, and ban announcements in
-- the live chat.
--
-- Every invited account is profiled: its email (throwaway domain, +tag or dot alias, a variation of the inviter's email, a
-- family of numbered look-alikes, random-looking or number-stuffed names, the inviter's own private domain), how it's
-- linked to the inviter (device, fingerprint, address, network), what it actually does (plays, wins, Ink earned and spent,
-- plots, active days, whether it stopped after the bonus, how soon after the previous invite it joined) and everything it
-- did for the inviter (Sketch of the Day votes, challenge votes, inspires, stamps, room visits, playdates, arcade plays,
-- duets). Each gets its own suspicion score with reasons, and the whole tree is weighed together — one level deeper too.
-- Prize-winning sketches and challenge entries whose votes came mostly from the winner's own invited or linked accounts
-- are flagged. Self-referral signals now weigh much more.
--
-- When an admin suspends or bans, they can post a short summary (they write it) to the live chat; it shows red-bordered
-- to everyone. Undoing the action takes the announcement down.

alter table public.chat_messages add column if not exists kind text not null default 'chat';
alter table public.chat_messages drop constraint if exists chat_messages_kind_check;
alter table public.chat_messages add constraint chat_messages_kind_check check (kind in ('chat', 'moderation'));
alter table public.chat_messages add column if not exists data jsonb;
alter table public.integrity_actions add column if not exists chat_id bigint;

create or replace function private.chat_json(m public.chat_messages) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'created_at', m.created_at, 'player', private.profile_json(m.player_id))
         || case when m.kind <> 'chat' then jsonb_build_object('kind', m.kind, 'data', m.data) else '{}'::jsonb end
$$;

-- moderation announcements show to everyone (even if they blocked the player)
create or replace function public.chat_recent(p_after_id bigint default null, p_limit int default 60) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_mod boolean := private.has_role(v_uid, array['moderator']);
begin
  return jsonb_build_object(
    'messages', coalesce((
      select jsonb_agg(private.chat_json(m) || case when v_mod and m.deleted_at is not null then jsonb_build_object('deleted', true) else '{}'::jsonb end
                       order by m.id)
      from (select c.* from public.chat_messages c
            where c.room = 'global' and (p_after_id is null or c.id > p_after_id)
              and (c.deleted_at is null or v_mod)
              and (c.kind = 'moderation' or private.visible_to(c.player_id, v_uid))
            order by c.id desc limit least(greatest(coalesce(p_limit, 60), 1), 200)) m), '[]'::jsonb),
    'muted_until', (select case when chat_muted_until > now() then chat_muted_until end from public.players where id = v_uid),
    'enabled', private.flag('global_chat'));
end $$;

-- ---- emails ----------------------------------------------------------------------------------------------------------
create or replace function private.email_flags(p_email text, p_inviter text default null) returns text[] language sql immutable as $$
  with e as (select lower(split_part(coalesce(p_email, ''), '@', 1)) loc, lower(split_part(coalesce(p_email, ''), '@', 2)) dom,
                    lower(split_part(coalesce(p_inviter, ''), '@', 2)) idom)
  select array_remove(array[
    case when private.email_disposable(p_email) then 'throwaway email domain' end,
    case when position('+' in loc) > 0 then '+tag alias (same inbox as ' || split_part(loc, '+', 1) || '@' || dom || ')' end,
    case when dom in ('gmail.com', 'googlemail.com') and position('.' in split_part(loc, '+', 1)) > 0 and p_inviter is not null
              and private.email_norm(p_email) = private.email_norm(p_inviter) then 'Gmail dot alias of the inviter''s email' end,
    case when p_inviter is not null and private.email_norm(p_email) <> private.email_norm(p_inviter) and private.email_stem(p_email) is not null
              and length(private.email_stem(p_email)) >= 4 and private.email_stem(p_email) = private.email_stem(p_inviter) then 'same name as the inviter''s email, different numbers' end,
    case when loc ~ '\d{3,}' or length(regexp_replace(loc, '[^0-9]', '', 'g'))::numeric / greatest(length(loc), 1) > 0.4 then 'number-stuffed name' end,
    case when loc ~ '[bcdfghjklmnpqrstvwxz]{5,}' or (length(loc) >= 10 and loc !~ '[aeiou]') then 'random-looking name' end,
    case when idom <> '' and dom = idom and dom not in ('gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'live.com', 'aol.com', 'proton.me', 'protonmail.com', 'msn.com', 'me.com', 'mail.com', 'gmx.com', 'yandex.com')
         then 'same private email domain as the inviter (' || dom || ')' end
  ], null)
  from e
$$;

-- ---- what one player's accounts did for another ------------------------------------------------------------------------
create or replace function private.integrity_help_counts(p_target uuid, p_givers uuid[]) returns table (giver uuid, kind text, n int) language sql stable security definer set search_path = public, pg_temp as $$
  select v.voter_id, 'sketch votes', count(*)::int from public.sketch_votes v join public.sketches k on k.id = v.sketch_id where k.player_id = p_target and v.voter_id = any (p_givers) group by 1
  union all select v.voter_id, 'challenge votes', count(*)::int from public.challenge_votes v join public.artwork_publications a on a.id = v.publication_id where a.owner_id = p_target and v.voter_id = any (p_givers) group by 1
  union all select giver_id, 'inspires', count(*)::int from public.inspire_rewards where artist_id = p_target and giver_id = any (p_givers) group by 1
  union all select s.collector_id, 'stamps', count(*)::int from public.stamps s join public.artwork_publications a on a.id = s.publication_id where a.owner_id = p_target and s.collector_id = any (p_givers) group by 1
  union all select visitor_id, 'room visits', count(*)::int from public.room_checkins where host_id = p_target and visitor_id = any (p_givers) group by 1
  union all select guest_id, 'playdates', count(*)::int from public.inkborn_playdates where host_id = p_target and guest_id = any (p_givers) group by 1
  union all select p.player_id, 'arcade plays', count(*)::int from public.arcade_plays p join public.arcades a on a.id = p.arcade_id where a.owner_id = p_target and p.player_id = any (p_givers) group by 1
  union all select case when top_id = p_target then bottom_id else top_id end, 'duets', count(*)::int from public.duets
            where status = 'done' and ((top_id = p_target and bottom_id = any (p_givers)) or (bottom_id = p_target and top_id = any (p_givers))) group by 1
$$;

-- ---- every invited account, in detail, with its own suspicion score ---------------------------------------------------
create or replace function private.integrity_referees(p_uid uuid, p_strong uuid[], p_email text) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_links jsonb; v_out jsonb := '[]'::jsonb; r record; v_help jsonb; v_boosts int; v_flags text[]; v_reasons text[]; v_sus int; v_via text; v_prev timestamptz;
  v_plays int; v_wins int; v_earned bigint; v_spent bigint; v_plots int; v_days int; v_last_earn timestamptz; v_dormant boolean; v_look boolean; v_score int;
begin
  select coalesce(jsonb_object_agg(other, vias), '{}'::jsonb) into v_links
    from (select other, to_jsonb(array_agg(distinct via)) vias from private.integrity_links(p_uid) group by other) l;
  for r in select x.referee_id id, x.status, x.created_at, x.qualified_at, x.reward_ink, u.email, pr.username, pl.status pstatus, pl.last_active_at,
                  lag(x.created_at) over (order by x.created_at) prev_at
           from public.referrals x join auth.users u on u.id = x.referee_id join public.profiles pr on pr.id = x.referee_id join public.players pl on pl.id = x.referee_id
           where x.referrer_id = p_uid order by x.created_at limit 300 loop
    v_reasons := '{}'; v_sus := 0;
    v_flags := private.email_flags(r.email, p_email);
    v_look := private.email_norm(r.email) = private.email_norm(p_email)
              or (private.email_stem(r.email) is not null and length(private.email_stem(r.email)) >= 4 and private.email_stem(r.email) = private.email_stem(p_email));
    v_via := (select string_agg(v, '+') from jsonb_array_elements_text(coalesce(v_links -> r.id::text, '[]'::jsonb)) v where v in ('device', 'fingerprint', 'ip'));
    select count(*), count(*) filter (where passed) into v_plays, v_wins from public.minigame_sessions where player_id = r.id;
    select coalesce(sum(delta) filter (where delta > 0 and private.guide_play_reason(reason)), 0), coalesce(-sum(delta) filter (where delta < 0), 0),
           count(distinct date_trunc('day', created_at)), max(created_at) filter (where delta > 0)
      into v_earned, v_spent, v_days, v_last_earn from public.resource_ledger where player_id = r.id and resource = 'ink';
    select count(*) into v_plots from public.world_plots where owner_id = r.id;
    select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb), coalesce(sum(n), 0) into v_help, v_boosts from private.integrity_help_counts(p_uid, array[r.id]);
    v_dormant := r.status in ('rewarded', 'capped') and r.created_at < now() - interval '3 days' and (v_last_earn is null or v_last_earn < coalesce(r.qualified_at, r.created_at) + interval '2 days');
    select score into v_score from private.integrity_scores where player_id = r.id;
    -- its suspicion: how much it looks like the inviter's own alt
    if v_via like '%device%' then v_sus := v_sus + 45; v_reasons := v_reasons || 'same device as the inviter'::text;
    elsif v_via like '%fingerprint%' then v_sus := v_sus + 35; v_reasons := v_reasons || 'same browser/device fingerprint as the inviter'::text;
    elsif v_via like '%ip%' then v_sus := v_sus + 20; v_reasons := v_reasons || 'same internet address as the inviter'::text; end if;
    if v_look then v_sus := v_sus + 30; v_reasons := v_reasons || 'email is a variation of the inviter''s'::text; end if;
    if private.email_disposable(r.email) then v_sus := v_sus + 20; end if;
    if array_length(v_flags, 1) > 0 then v_sus := v_sus + least(10 * array_length(v_flags, 1), 25); v_reasons := v_reasons || v_flags; end if;
    if v_boosts > 0 then v_sus := v_sus + least(20 + 3 * v_boosts, 40); v_reasons := v_reasons || format('helped the inviter %s times (%s)', v_boosts, (select string_agg(k || ' ' || v, ', ') from jsonb_each_text(v_help) t(k, v))); end if;
    if v_dormant then v_sus := v_sus + 15; v_reasons := v_reasons || 'stopped earning right after the invite bonus'::text; end if;
    if v_plays < 5 then v_sus := v_sus + 10; v_reasons := v_reasons || format('barely played (%s minigames)', v_plays); end if;
    if r.prev_at is not null and r.created_at - r.prev_at < interval '1 hour' then v_sus := v_sus + 10;
      v_reasons := v_reasons || format('joined %s min after the previous invited account', greatest(1, round(extract(epoch from r.created_at - r.prev_at) / 60))); end if;
    v_out := v_out || jsonb_build_object('id', r.id, 'username', r.username, 'email', r.email, 'email_flags', to_jsonb(v_flags), 'email_stem', private.email_stem(r.email),
      'lookalike', v_look, 'disposable', private.email_disposable(r.email), 'linked_via', v_via,
      'status', r.status, 'account', r.pstatus, 'rewarded', r.status in ('rewarded', 'capped'), 'reward_ink', r.reward_ink, 'joined', r.created_at,
      'minutes_after_previous', case when r.prev_at is not null then round(extract(epoch from r.created_at - r.prev_at) / 60) end,
      'plays', v_plays, 'wins', v_wins, 'ink_earned', v_earned, 'ink_spent', v_spent, 'plots', v_plots, 'active_days', v_days, 'last_active', r.last_active_at,
      'dormant', v_dormant, 'help', v_help, 'boosts', v_boosts, 'own_score', v_score,
      'suspicion', least(100, greatest(v_sus, coalesce(v_score, 0))), 'reasons', to_jsonb(v_reasons));
  end loop;
  return (select coalesce(jsonb_agg(x order by (x ->> 'suspicion')::int desc, x ->> 'joined'), '[]'::jsonb) from jsonb_array_elements(v_out) x);
end $$;

-- ---- prize wins propped up by their own accounts ---------------------------------------------------------------------
create or replace function private.integrity_propped_wins(p_uid uuid, p_helpers uuid[]) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]'::jsonb) from (
    select jsonb_build_object('kind', 'Sketch of the Day', 'what', s.word, 'place', s.place, 'prize', s.prize, 'at', s.day, 'votes', t.total, 'from_own', t.own, 'voters', t.voters) x
    from public.sketches s
    cross join lateral (select count(*) total, count(*) filter (where v.voter_id = any (p_helpers)) own,
                               (select jsonb_agg(pr.username) from public.sketch_votes v2 join public.profiles pr on pr.id = v2.voter_id where v2.sketch_id = s.id and v2.voter_id = any (p_helpers)) voters
                        from public.sketch_votes v where v.sketch_id = s.id) t
    where s.player_id = p_uid and s.prize > 0 and s.day > now() - interval '120 days' and t.own >= 2 and t.own::numeric / greatest(t.total, 1) >= 0.4
    union all
    select jsonb_build_object('kind', 'Weekly challenge', 'what', c.title, 'place', e.place, 'prize', e.prize, 'at', e.created_at, 'votes', t.total, 'from_own', t.own, 'voters', t.voters)
    from public.challenge_entries e join public.challenges c on c.id = e.challenge_id
    cross join lateral (select count(*) total, count(*) filter (where v.voter_id = any (p_helpers)) own,
                               (select jsonb_agg(pr.username) from public.challenge_votes v2 join public.profiles pr on pr.id = v2.voter_id
                                 where v2.challenge_id = e.challenge_id and v2.publication_id = e.publication_id and v2.voter_id = any (p_helpers)) voters
                        from public.challenge_votes v where v.challenge_id = e.challenge_id and v.publication_id = e.publication_id) t
    where e.owner_id = p_uid and e.prize > 0 and e.created_at > now() - interval '120 days' and t.own >= 2 and t.own::numeric / greatest(t.total, 1) >= 0.4) z
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
    sig := sig || private.isig('invited_by_linked', 40, 'severe', 'Self-referral alt: was invited by an account on their own device or address',
      (select jsonb_agg(pr.username) from public.referrals r join public.profiles pr on pr.id = r.referrer_id where r.referee_id = p_uid));
  end if;

  -- 3. invites: every invited account, how it signed up, what it does, and whether it props them up
  v_list := private.integrity_referees(p_uid, v_strong, v_email);
  select count(*), count(*) filter (where (x ->> 'linked_via') is not null), count(*) filter (where (x ->> 'lookalike')::boolean),
         count(*) filter (where (x ->> 'disposable')::boolean), count(*) filter (where (x ->> 'boosts')::int > 0),
         count(*) filter (where (x ->> 'suspicion')::int >= 50), count(*) filter (where (x ->> 'dormant')::boolean), count(*) filter (where (x ->> 'rewarded')::boolean)
    into rf_total, rf_linked, rf_look, rf_disp, rf_near, rf_plotted, rf_dormant, rf_rew
  from jsonb_array_elements(v_list) x;
  rf_list := v_list;
  if rf_linked > 0 then sig := sig || private.isig('self_referral_device', least(35 + 15 * rf_linked, 70), 'severe',
      format('Self-referral: %s invited account%s use%s their own device or internet address', rf_linked, case when rf_linked = 1 then '' else 's' end, case when rf_linked = 1 then 's' else '' end),
      (select jsonb_agg(x) from jsonb_array_elements(v_list) x where (x ->> 'linked_via') is not null)); end if;
  if rf_look > 0 then sig := sig || private.isig('self_referral_email', least(25 + 10 * rf_look, 50), case when rf_look >= 2 then 'severe' else 'high' end,
      format('Self-referral: %s invited account%s use%s a variation of their own email', rf_look, case when rf_look = 1 then '' else 's' end, case when rf_look = 1 then 's' else '' end),
      (select jsonb_agg(x) from jsonb_array_elements(v_list) x where (x ->> 'lookalike')::boolean)); end if;
  select count(*) into v_k from (select x ->> 'email_stem' st from jsonb_array_elements(v_list) x where length(coalesce(x ->> 'email_stem', '')) >= 4 group by 1 having count(*) > 1) z;
  if v_k > 0 then sig := sig || private.isig('referral_email_family', least(15 + 8 * v_k, 35), 'high',
      format('%s group%s of invited accounts share the same email name with different numbers or dots', v_k, case when v_k = 1 then '' else 's' end)); end if;
  if rf_disp > 0 then sig := sig || private.isig('disposable_referrals', least(10 + 6 * rf_disp, 30), case when rf_disp >= 3 then 'severe' else 'high' end,
      format('%s invited account%s signed up with throwaway email addresses', rf_disp, case when rf_disp = 1 then '' else 's' end),
      (select jsonb_agg(x) from jsonb_array_elements(v_list) x where (x ->> 'disposable')::boolean)); end if;
  if rf_near > 0 then sig := sig || private.isig('referrals_boost_referrer', least(25 + 12 * rf_near, 60), case when rf_near >= 2 then 'severe' else 'high' end,
      format('%s invited account%s voted for, inspired, stamped or visited them — feeding their own inviter', rf_near, case when rf_near = 1 then '' else 's' end),
      (select jsonb_agg(jsonb_build_object('username', x ->> 'username', 'email', x ->> 'email', 'help', x -> 'help')) from jsonb_array_elements(v_list) x where (x ->> 'boosts')::int > 0)); end if;
  if rf_rew >= 2 and rf_dormant::numeric / rf_rew >= 0.5 then sig := sig || private.isig('dormant_referrals', 20 + least(5 * rf_dormant, 15), 'high',
      format('%s of %s invited accounts stopped earning within 2 days of unlocking the invite bonus', rf_dormant, rf_rew)); end if;
  select coalesce((select max(c) from (select count(*) c from public.referrals r where r.referrer_id = p_uid group by date_trunc('hour', r.created_at)) z), 0) into rf_burst;
  if rf_burst >= 3 then sig := sig || private.isig('referral_burst', least(10 + 4 * (rf_burst - 3), 30), case when rf_burst >= 5 then 'high' else 'watch' end,
      format('%s accounts joined with their invite code within one hour', rf_burst)); end if;
  -- the whole tree: how suspicious their invited accounts are, all together
  if rf_plotted > 0 then sig := sig || private.isig('suspicious_referral_tree', least(10 + 8 * rf_plotted, 50),
      case when rf_plotted >= 3 or rf_plotted::numeric / greatest(rf_total, 1) >= 0.5 then 'severe' else 'high' end,
      format('%s of their %s invited accounts look like their own alts (suspicion 50+)', rf_plotted, rf_total),
      (select jsonb_agg(jsonb_build_object('username', x ->> 'username', 'email', x ->> 'email', 'suspicion', x -> 'suspicion', 'reasons', x -> 'reasons'))
         from jsonb_array_elements(v_list) x where (x ->> 'suspicion')::int >= 50)); end if;
  -- …and one level further: accounts their invited accounts invited
  select count(*), count(*) filter (where r2.referee_id = any (v_strong)) into v_n, v_m
    from public.referrals r1 join public.referrals r2 on r2.referrer_id = r1.referee_id where r1.referrer_id = p_uid;
  if v_m > 0 then sig := sig || private.isig('referral_chain', least(15 + 8 * v_m, 35), 'high',
      format('%s of the %s accounts their invited accounts invited are on their own device or address (a referral chain)', v_m, v_n)); end if;
  -- invited accounts claiming land right next to theirs (about 300 m)
  if rf_total >= 2 then
    select count(*) filter (where near), count(*) into rf_near, rf_dormant from (
      select r.referee_id, exists (select 1 from public.world_plots a, public.world_plots p
                                   where a.owner_id = r.referee_id and p.owner_id = p_uid and abs(a.gx - p.gx) <= 30 and abs(a.gy - p.gy) <= 30) near
      from public.referrals r where r.referrer_id = p_uid and exists (select 1 from public.world_plots w where w.owner_id = r.referee_id)) z;
    if rf_near >= 2 and rf_near::numeric / greatest(rf_dormant, 1) >= 0.6 then sig := sig || private.isig('referral_plots_near', 15, 'watch',
        format('%s of %s invited accounts with land claimed it right next to theirs', rf_near, rf_dormant)); end if;
  end if;
  if private.email_disposable(v_email) then sig := sig || private.isig('disposable_email', 8, 'watch', 'Signed up with a throwaway email address', jsonb_build_array(split_part(v_email, '@', 2))); end if;
  -- as an invited account: do they feed whoever invited them?
  select coalesce(sum(n), 0) into v_n from private.integrity_help_counts((select referrer_id from public.referrals where referee_id = p_uid), array[p_uid]) h;
  if v_n >= 3 then sig := sig || private.isig('helps_inviter', least(15 + 2 * v_n, 35), 'high',
      format('Spent %s actions voting for, inspiring, stamping or visiting the account that invited them', v_n),
      (select jsonb_agg(pr.username) from public.referrals r join public.profiles pr on pr.id = r.referrer_id where r.referee_id = p_uid)); end if;

  -- 3b. wins propped up by their own invited or linked accounts (Sketch of the Day, weekly challenges)
  v_list := private.integrity_propped_wins(p_uid, coalesce(v_strong, '{}') || coalesce((select array_agg(referee_id) from public.referrals where referrer_id = p_uid), '{}'));
  if jsonb_array_length(v_list) > 0 then sig := sig || private.isig('propped_wins', least(25 + 10 * jsonb_array_length(v_list), 55), 'severe',
      format('%s prize-winning sketch%s or challenge entr%s got most of their votes from their own invited or linked accounts', jsonb_array_length(v_list),
             case when jsonb_array_length(v_list) = 1 then '' else 'es' end, case when jsonb_array_length(v_list) = 1 then 'y' else 'ies' end), v_list); end if;

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


drop function if exists public.admin_integrity_act(uuid[], text, timestamp with time zone, text, text, jsonb, jsonb);
/** suspend, ban or warn players; optionally take the Ink they gained by abuse and the plots bought with it */
create or replace function public.admin_integrity_act(p_players uuid[], p_kind text, p_until timestamptz, p_preset text, p_reason text, p_proof jsonb, p_scope jsonb, p_announce text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']); p uuid; v_plan jsonb; pl jsonb; v_group uuid := gen_random_uuid(); v_out jsonb := '[]'::jsonb;
  v_id bigint; v_take boolean := p_scope is not null and p_scope <> '{}'::jsonb; v_chat bigint;
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
    -- tell everyone in the live chat (red, pinned-looking), with the summary the admin wrote
    v_chat := null;
    if p_kind in ('suspend', 'ban') and nullif(trim(coalesce(p_announce, '')), '') is not null then
      insert into public.chat_messages (player_id, body, kind, data)
      values (p, left(replace(trim(p_announce), '{name}', '@' || coalesce((select username from public.profiles where id = p), 'a player')), 300), 'moderation', jsonb_build_object('action', p_kind, 'until', case when p_kind = 'suspend' then p_until end))
      returning id into v_chat;
    end if;
    insert into public.integrity_actions (player_id, admin_id, kind, until, preset, reason, proof, ink_removed, plots_removed, plots_ink, group_id, chat_id)
    values (p, v_uid, p_kind, case when p_kind = 'suspend' then p_until end, p_preset, left(p_reason, 1000), coalesce(p_proof, '[]'::jsonb),
            (v_plan ->> 'take')::bigint, v_plan -> 'plots', (v_plan ->> 'plots_ink')::bigint, v_group, v_chat)
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
  -- take the chat announcement down too
  if a.chat_id is not null then update public.chat_messages set deleted_at = now(), deleted_by = v_uid where id = a.chat_id; end if;
  perform private.audit('integrity.undo', 'player', a.player_id::text, jsonb_build_object('action', a.id, 'ink_returned', v_back));
  return jsonb_build_object('ink_returned', v_back);
end $$;


do $$
declare f text;
begin
  foreach f in array array['public.admin_integrity_act(uuid[], text, timestamp with time zone, text, text, jsonb, jsonb, text)', 'public.admin_integrity_undo(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.email_flags(text, text)', 'private.integrity_help_counts(uuid, uuid[])', 'private.integrity_referees(uuid, uuid[], text)',
                           'private.integrity_propped_wins(uuid, uuid[])', 'private.integrity_scan(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
