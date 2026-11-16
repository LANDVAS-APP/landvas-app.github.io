-- Referral packages: tiers you unlock by inviting real friends, whose bonuses stack.
--
-- Every invite pays the inviter the base reward (500 Ink) when the friend counts — and nothing else. On top of that,
-- a player climbs referral tiers by inviting friends who really play: Tier I at 3 real friends, II at 10, III at 25,
-- and the final tier at 50. A friend is "real" once they've earned Ink by playing on 3 different days.
--   · At Tiers I–III the player picks one bonus of four, each tier's better than the last:
--       🌟 Golden Circle (a bit of everything) · 💰 Ink Tycoon (Ink) · 📈 Royalties (a share of the friend's Ink)
--       · 🍀 Fortune Seeker (Luck, Enchanted Luck, plot rolls)
--   · The final tier is the Grand Package: everything (Ink, a share, a Luck refill, Enchanted Luck and a plot roll),
--     plus one area the player picks to boost (more Ink, a bigger share, more Enchanted Luck, or a Legendary roll).
--   · The picks stack: every real friend pays all the unlocked tiers' picks added together (an unlocked tier with no
--     pick pays Golden Circle). Picks can be planned before a tier unlocks and changed once a month each.
-- The share of a friend's Ink is from Ink they earn by playing, never out of their pocket. Fake sign-ups that never
-- play don't climb tiers or pay a bonus. Every number is a setting (game_config 'referrals' → packages);
-- packages.share_enabled switches every share of friends' Ink off (and on) live; the Earning switches
-- 'reason:referral_bonus' / 'reason:referral_share' too.

-- ---- settings ---------------------------------------------------------------------------------------------------
update public.game_config set value = value
  || jsonb_build_object('reward_ink', 500)
  || jsonb_build_object('share', coalesce(value -> 'share', '{}'::jsonb) || '{"enabled": false}'::jsonb)
  || jsonb_build_object('packages', coalesce(value -> 'packages', $p${
    "enabled": true, "switch_days": 30, "bonus_after_days": 3, "share_enabled": true, "max_share_pct": 40, "default_pick": "golden",
    "tiers": [{"n": 3, "name": "Tier I"}, {"n": 10, "name": "Tier II"}, {"n": 25, "name": "Tier III"}, {"n": 50, "name": "Grand Package"}],
    "options": [
      {"id": "golden", "name": "Golden Circle", "emoji": "🌟", "color": "#FFC94D", "tagline": "A bit of everything", "tiers": [
        {"ink": 300,  "share_pct": 2, "share_days": 30, "share_cap": 600,  "luck_refill": false, "enchanted_luck": 1, "tickets": []},
        {"ink": 700,  "share_pct": 3, "share_days": 60, "share_cap": 1500, "luck_refill": true,  "enchanted_luck": 1, "tickets": []},
        {"ink": 1200, "share_pct": 5, "share_days": 90, "share_cap": 3000, "luck_refill": true,  "enchanted_luck": 2, "tickets": []}]},
      {"id": "tycoon", "name": "Ink Tycoon", "emoji": "💰", "color": "#3DDC97", "tagline": "The most Ink, all at once", "tiers": [
        {"ink": 1000, "share_pct": 0, "share_days": 0, "share_cap": 0, "luck_refill": false, "enchanted_luck": 0, "tickets": []},
        {"ink": 2500, "share_pct": 0, "share_days": 0, "share_cap": 0, "luck_refill": false, "enchanted_luck": 0, "tickets": []},
        {"ink": 5000, "share_pct": 0, "share_days": 0, "share_cap": 0, "luck_refill": false, "enchanted_luck": 0, "tickets": []}]},
      {"id": "royalties", "name": "Royalties", "emoji": "📈", "color": "#9A7BFF", "tagline": "A cut of everything they earn", "tiers": [
        {"ink": 0, "share_pct": 6,  "share_days": 60,  "share_cap": 2500,  "luck_refill": false, "enchanted_luck": 0, "tickets": []},
        {"ink": 0, "share_pct": 10, "share_days": 90,  "share_cap": 6000,  "luck_refill": false, "enchanted_luck": 0, "tickets": []},
        {"ink": 0, "share_pct": 14, "share_days": 120, "share_cap": 12000, "luck_refill": false, "enchanted_luck": 0, "tickets": []}]},
      {"id": "fortune", "name": "Fortune Seeker", "emoji": "🍀", "color": "#FF4FD8", "tagline": "Luck, Enchanted Luck and lucky rolls", "tiers": [
        {"ink": 0, "share_pct": 0, "share_days": 0, "share_cap": 0, "luck_refill": true, "enchanted_luck": 1, "tickets": []},
        {"ink": 0, "share_pct": 0, "share_days": 0, "share_cap": 0, "luck_refill": true, "enchanted_luck": 2, "tickets": [{"min": "rare", "n": 1}]},
        {"ink": 0, "share_pct": 0, "share_days": 0, "share_cap": 0, "luck_refill": true, "enchanted_luck": 3, "tickets": [{"min": "epic", "n": 1}]}]}
    ],
    "grand": {"ink": 3000, "share_pct": 8, "share_days": 120, "share_cap": 10000, "luck_refill": true, "enchanted_luck": 2, "tickets": [{"min": "epic", "n": 1}]},
    "boosts": [
      {"id": "ink",   "name": "More Ink",             "emoji": "💰", "add": {"ink": 7000}},
      {"id": "share", "name": "A bigger share",       "emoji": "📈", "add": {"share_pct": 10, "share_days": 180, "share_cap": 20000}},
      {"id": "luck",  "name": "More Enchanted Luck",  "emoji": "✨", "add": {"enchanted_luck": 4}},
      {"id": "rolls", "name": "A Legendary roll",     "emoji": "🎟️", "add": {"tickets": [{"min": "legendary", "n": 1}]}}
    ]}$p$::jsonb))
where key = 'referrals';

/** a bundle a tier pays (Ink, a share, Luck, Enchanted Luck, plot rolls) that makes sense */
create or replace function private.ref_bundle_ok(b jsonb) returns boolean language plpgsql stable as $$
declare t jsonb;
begin
  if b is null then return true; end if;
  if jsonb_typeof(b) <> 'object' then return false; end if;
  if coalesce((b ->> 'ink')::numeric, 0) not between 0 and 1000000 or coalesce((b ->> 'share_pct')::numeric, 0) not between 0 and 100
     or coalesce((b ->> 'share_days')::numeric, 0) not between 0 and 3650 or coalesce((b ->> 'share_cap')::numeric, 0) not between 0 and 10000000
     or coalesce((b ->> 'enchanted_luck')::numeric, 0) not between 0 and 9
     or jsonb_typeof(coalesce(b -> 'tickets', '[]'::jsonb)) <> 'array' then return false; end if;
  for t in select * from jsonb_array_elements(coalesce(b -> 'tickets', '[]'::jsonb)) loop
    if not exists (select 1 from public.plot_rarities where id = t ->> 'min') or coalesce((t ->> 'n')::numeric, 0) not between 0 and 10 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

/** a packages setting that makes sense (admins can change every number) */
create or replace function private.ref_packages_ok(p jsonb) returns boolean language plpgsql stable as $$
declare x jsonb; tr jsonb; ids text[] := '{}'; v_prev numeric := 0; v_tiers int;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  if coalesce((p ->> 'switch_days')::numeric, 0) not between 0 and 3650 or coalesce((p ->> 'bonus_after_days')::numeric, 0) not between 0 and 60
     or coalesce((p ->> 'max_share_pct')::numeric, 40) not between 0 and 100
     or jsonb_typeof(coalesce(p -> 'tiers', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p -> 'tiers', '[]'::jsonb)) not between 2 and 8
     or jsonb_typeof(coalesce(p -> 'options', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p -> 'options', '[]'::jsonb)) not between 1 and 8
     or jsonb_typeof(coalesce(p -> 'boosts', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p -> 'boosts', '[]'::jsonb)) > 8
     or not private.ref_bundle_ok(p -> 'grand') then return false; end if;
  v_tiers := jsonb_array_length(p -> 'tiers');
  for tr in select * from jsonb_array_elements(p -> 'tiers') loop   -- friends needed, rising
    if coalesce((tr ->> 'n')::numeric, -1) not between 1 and 100000 or (tr ->> 'n')::numeric <= v_prev
       or length(coalesce(tr ->> 'name', 'x')) not between 1 and 40 then return false; end if;
    v_prev := (tr ->> 'n')::numeric;
  end loop;
  for x in select * from jsonb_array_elements(p -> 'options') loop   -- one bundle per tier before the last
    if coalesce(x ->> 'id', '') !~ '^[a-z0-9_]{2,20}$' or (x ->> 'id') = any (ids) or length(coalesce(x ->> 'name', '')) not between 1 and 40
       or jsonb_typeof(coalesce(x -> 'tiers', 'null'::jsonb)) <> 'array' or jsonb_array_length(x -> 'tiers') <> v_tiers - 1 then return false; end if;
    ids := ids || (x ->> 'id');
    for tr in select * from jsonb_array_elements(x -> 'tiers') loop
      if not private.ref_bundle_ok(tr) then return false; end if;
    end loop;
  end loop;
  if not (coalesce(p ->> 'default_pick', 'golden') = any (ids)) then return false; end if;
  ids := '{}';
  for x in select * from jsonb_array_elements(coalesce(p -> 'boosts', '[]'::jsonb)) loop
    if coalesce(x ->> 'id', '') !~ '^[a-z0-9_]{2,20}$' or (x ->> 'id') = any (ids) or length(coalesce(x ->> 'name', '')) not between 1 and 40
       or not private.ref_bundle_ok(x -> 'add') then return false; end if;
    ids := ids || (x ->> 'id');
  end loop;
  return true;
exception when others then return false;
end $$;

select private.fn_patch('public.admin_config_set(text,jsonb)',
  'or coalesce((p_value -> ''share'' ->> ''cap_ink'')::numeric, 1000) not between 0 and 10000000) then',
  'or coalesce((p_value -> ''share'' ->> ''cap_ink'')::numeric, 1000) not between 0 and 10000000
    or not private.ref_packages_ok(p_value -> ''packages'')) then');

-- ---- storage ----------------------------------------------------------------------------------------------------
create table if not exists public.referral_picks (
  player_id uuid not null references public.players (id) on delete cascade,
  tier int not null check (tier between 1 and 8),
  pick text not null,
  chosen_at timestamptz not null default now(),
  primary key (player_id, tier));
alter table public.referral_picks enable row level security;
revoke all on public.referral_picks from anon, authenticated;

alter table public.referrals add column if not exists real_at timestamptz;        -- the friend has really played (counts toward tiers)
alter table public.referrals add column if not exists real_checked date;          -- (looked at most once a day)
alter table public.referrals add column if not exists bonus_status text not null default 'none';
alter table public.referrals add column if not exists bonus jsonb;                -- what the stacked package paid, and at which tier
alter table public.referrals add column if not exists bonus_at timestamptz;
do $$ begin
  alter table public.referrals add constraint referrals_bonus_status_check check (bonus_status in ('none', 'paid', 'void'));
exception when duplicate_object then null; end $$;
create index if not exists referrals_real on public.referrals (referrer_id) where real_at is not null;

-- the bonus is new Ink (a reason Ink may come from), and like invites (and Crown shares) it isn't "playing"
select private.fn_patch('private.grant(uuid,jsonb,text,text,text,text)', '''leviathan'', ''crown'')', '''leviathan'', ''crown'', ''referral_bonus'')');
select private.fn_patch('private.guide_play_reason(text)', '''referral_welcome'', ', '''referral_welcome'', ''referral_bonus'', ''crown'', ');
-- …and it's earned: a player whose Ink earning is off (per-player Ink modes) doesn't get it either
select private.fn_patch('private.ink_earn_reasons()', '''referral_share'', ', '''referral_share'', ''referral_bonus'', ');

-- ---- tiers and the stack ----------------------------------------------------------------------------------------
create or replace function private.ref_pkgs() returns jsonb language sql stable as $$
  select coalesce(private.cfg('referrals') -> 'packages', '{}'::jsonb)
$$;
/** how many of a player's friends are real (have played on enough days) */
create or replace function private.ref_real(p_uid uuid) returns int language sql stable as $$
  select count(*)::int from public.referrals where referrer_id = p_uid and real_at is not null and status = 'rewarded'
$$;
/** the tier (1…) a number of real friends reaches; 0 below the first */
create or replace function private.ref_tier_of(p_n int) returns int language sql stable as $$
  select count(*)::int from jsonb_array_elements(coalesce(private.ref_pkgs() -> 'tiers', '[]'::jsonb)) t where (t ->> 'n')::int <= p_n
$$;
/** two bundles added together: Ink, Enchanted Luck, share and its cap add up; the share lasts the longer; rolls join */
create or replace function private.ref_add(a jsonb, b jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'ink', coalesce((a ->> 'ink')::int, 0) + coalesce((b ->> 'ink')::int, 0),
    'share_pct', coalesce((a ->> 'share_pct')::numeric, 0) + coalesce((b ->> 'share_pct')::numeric, 0),
    'share_days', greatest(coalesce((a ->> 'share_days')::int, 0), coalesce((b ->> 'share_days')::int, 0)),
    'share_cap', coalesce((a ->> 'share_cap')::int, 0) + coalesce((b ->> 'share_cap')::int, 0),
    'luck_refill', coalesce((a ->> 'luck_refill')::boolean, false) or coalesce((b ->> 'luck_refill')::boolean, false),
    'enchanted_luck', coalesce((a ->> 'enchanted_luck')::int, 0) + coalesce((b ->> 'enchanted_luck')::int, 0),
    'tickets', coalesce(a -> 'tickets', '[]'::jsonb) || coalesce(b -> 'tickets', '[]'::jsonb))
$$;
/** what every real friend pays this player now: all their unlocked tiers' picks added together (null below Tier I,
 *  or with packages off). The last tier is the Grand Package plus the boost they picked. */
create or replace function private.ref_stack(p_uid uuid) returns jsonb language plpgsql stable as $$
declare c jsonb := private.ref_pkgs(); v_n int; v_t int; t int; v_pick text; acc jsonb := '{}'::jsonb; parts jsonb := '[]'::jsonb; o jsonb;
begin
  if not coalesce((c ->> 'enabled')::boolean, true) then return null; end if;
  v_n := jsonb_array_length(coalesce(c -> 'tiers', '[]'::jsonb));
  v_t := least(private.ref_tier_of(private.ref_real(p_uid)), v_n);
  if v_t < 1 then return null; end if;
  for t in 1 .. v_t loop
    v_pick := null; o := null;
    select pick into v_pick from public.referral_picks where player_id = p_uid and tier = t;
    if t = v_n then
      acc := private.ref_add(acc, c -> 'grand');
      select x -> 'add' into o from jsonb_array_elements(coalesce(c -> 'boosts', '[]'::jsonb)) x where x ->> 'id' = v_pick;
      if o is not null then acc := private.ref_add(acc, o); else v_pick := null; end if;
      parts := parts || jsonb_build_object('tier', t, 'pick', v_pick, 'grand', true);
    else
      select x -> 'tiers' -> (t - 1) into o from jsonb_array_elements(coalesce(c -> 'options', '[]'::jsonb)) x where x ->> 'id' = v_pick;
      if o is null then   -- (no pick yet: the default, so an unlocked tier never pays nothing)
        v_pick := coalesce(c ->> 'default_pick', 'golden');
        select x -> 'tiers' -> (t - 1) into o from jsonb_array_elements(coalesce(c -> 'options', '[]'::jsonb)) x where x ->> 'id' = v_pick;
      end if;
      acc := private.ref_add(acc, o);
      parts := parts || jsonb_build_object('tier', t, 'pick', v_pick);
    end if;
  end loop;
  return acc || jsonb_build_object('share_pct', least((acc ->> 'share_pct')::numeric, coalesce((c ->> 'max_share_pct')::numeric, 40)), 'tier', v_t, 'parts', parts);
end $$;

/** the share of each friend's Ink this player gets now (their stack's, else the base one) */
create or replace function private.ref_share_json(p_uid uuid) returns jsonb language sql stable as $$
  with pk as (select private.ref_stack(p_uid) k), b as (select coalesce(private.cfg('referrals') -> 'share', '{}'::jsonb) s)
  select case
    when pk.k is not null and coalesce((pk.k ->> 'share_pct')::numeric, 0) > 0
      then jsonb_build_object('enabled', coalesce((private.ref_pkgs() ->> 'share_enabled')::boolean, true), 'pct', (pk.k ->> 'share_pct')::numeric,
                              'cap_ink', coalesce((pk.k ->> 'share_cap')::int, 0), 'days', coalesce((pk.k ->> 'share_days')::int, 0), 'tier', (pk.k ->> 'tier')::int)
    when coalesce((b.s ->> 'enabled')::boolean, false)
      then jsonb_build_object('enabled', true, 'pct', coalesce((b.s ->> 'pct')::numeric, 10), 'cap_ink', coalesce((b.s ->> 'cap_ink')::int, 1000), 'days', 0)
    else jsonb_build_object('enabled', false, 'pct', 0, 'cap_ink', 0, 'days', 0) end
  from pk, b
$$;

create or replace function private.ref_perks_json(p_uid uuid) returns jsonb language sql stable as $$
  with c as (select private.ref_pkgs() c), r as (select private.ref_real(p_uid) n)
  select jsonb_build_object(
    'enabled', coalesce((c.c ->> 'enabled')::boolean, true),
    'switch_days', coalesce((c.c ->> 'switch_days')::int, 30),
    'bonus_after_days', coalesce((c.c ->> 'bonus_after_days')::int, 3),
    'share_enabled', coalesce((c.c ->> 'share_enabled')::boolean, true),
    'max_share_pct', coalesce((c.c ->> 'max_share_pct')::numeric, 40),
    'default_pick', coalesce(c.c ->> 'default_pick', 'golden'),
    'tiers', coalesce(c.c -> 'tiers', '[]'::jsonb),
    'options', coalesce(c.c -> 'options', '[]'::jsonb),
    'grand', coalesce(c.c -> 'grand', '{}'::jsonb),
    'boosts', coalesce(c.c -> 'boosts', '[]'::jsonb),
    'real', r.n,
    'tier', private.ref_tier_of(r.n),
    'picks', (select coalesce(jsonb_agg(jsonb_build_object('tier', tier, 'pick', pick, 'chosen_at', chosen_at,
                'can_change_at', chosen_at + make_interval(days => coalesce((c.c ->> 'switch_days')::int, 30))) order by tier), '[]'::jsonb)
              from public.referral_picks where player_id = p_uid),
    'stack', private.ref_stack(p_uid))
  from c, r
$$;

-- ---- picking ----------------------------------------------------------------------------------------------------
/** a tier's pick (one of the options; on the final tier, the area to boost). Plan ahead freely; a pick can change
 *  once a month. */
create or replace function public.referral_pick(p_tier int, p_pick text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.ref_pkgs(); v_n int; p public.referral_picks;
  v_days int := coalesce((private.ref_pkgs() ->> 'switch_days')::int, 30);
begin
  perform private.rate_limit('referral_pick', 30, 3600);
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'referral_packages_off' using errcode = 'P0001'; end if;
  v_n := jsonb_array_length(coalesce(c -> 'tiers', '[]'::jsonb));
  if p_tier is null or p_tier not between 1 and v_n then raise exception 'unknown_tier' using errcode = 'P0001'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(c -> (case when p_tier = v_n then 'boosts' else 'options' end), '[]'::jsonb)) x where x ->> 'id' = p_pick) then
    raise exception 'unknown_package' using errcode = 'P0001';
  end if;
  select * into p from public.referral_picks where player_id = v_uid and tier = p_tier for update;
  if not found then
    insert into public.referral_picks (player_id, tier, pick) values (v_uid, p_tier, p_pick);
  elsif p.pick <> p_pick then
    if p.chosen_at > now() - make_interval(days => v_days) then
      raise exception 'package_locked' using errcode = 'P0001', detail = to_char(p.chosen_at + make_interval(days => v_days), 'YYYY-MM-DD"T"HH24:MI:SSOF');
    end if;
    update public.referral_picks set pick = p_pick, chosen_at = now() where player_id = v_uid and tier = p_tier;
  else
    return public.my_referrals();
  end if;
  perform private.audit('referral.pick', 'player', v_uid::text, jsonb_build_object('tier', p_tier, 'from', p.pick, 'to', p_pick));
  return public.my_referrals();
end $$;
revoke all on function public.referral_pick(int, text) from public, anon;
grant execute on function public.referral_pick(int, text) to authenticated;

-- ---- a friend becomes real: tiers climb, and the stack pays ------------------------------------------------------
/** once a friend has earned Ink by playing on enough different days (looked at most once a day), they're real: they
 *  count toward their inviter's tier and pay the inviter's stack at that tier (this friend included) */
create or replace function private.ref_real_try(p_referee uuid) returns boolean language plpgsql as $$
declare r public.referrals%rowtype; pk jsonb; v_need int := coalesce((private.ref_pkgs() ->> 'bonus_after_days')::int, 3); v_days int;
  v_ink int; v_ench int; v_refill boolean; t jsonb; i int; v_tickets jsonb := '[]'::jsonb; v_today date := private.game_day(now());
begin
  select * into r from public.referrals where referee_id = p_referee and status = 'rewarded' and real_at is null for update;
  if not found or r.real_checked = v_today then return false; end if;
  select count(distinct private.game_day(created_at)) into v_days from public.resource_ledger
   where player_id = p_referee and resource = 'ink' and delta > 0 and private.guide_play_reason(reason);
  if v_days < v_need then update public.referrals set real_checked = v_today where referee_id = p_referee; return false; end if;
  update public.referrals set real_at = now(), real_checked = v_today where referee_id = p_referee;
  if exists (select 1 from public.players where id = r.referrer_id and status = 'banned') then return true; end if;
  pk := private.ref_stack(r.referrer_id);   -- (the tier counts this friend now)
  if pk is null then return true; end if;
  -- the bonus is switched off: this friend still counts toward the tier, and pays nothing
  if private.earn_any_off() and private.earn_off(array['all', 'reason:referral_bonus', 'reason:referral']) then
    perform private.earn_note('reason:referral_bonus', coalesce((pk ->> 'ink')::int, 0));
    update public.referrals set bonus_status = 'void' where referee_id = p_referee;
    return true;
  end if;
  v_ink := coalesce((pk ->> 'ink')::int, 0); v_ench := coalesce((pk ->> 'enchanted_luck')::int, 0); v_refill := coalesce((pk ->> 'luck_refill')::boolean, false);
  if v_ink > 0 then
    perform private.grant(r.referrer_id, jsonb_build_object('ink', v_ink), 'referral_bonus', 'player', p_referee::text, 'refbonus:' || p_referee);
  end if;
  if v_refill or v_ench > 0 then perform private.ench_give_luck(r.referrer_id, case when v_refill then 1000000 else 0 end, v_ench); end if;
  for t in select * from jsonb_array_elements(coalesce(pk -> 'tickets', '[]'::jsonb)) loop
    for i in 1 .. least(coalesce((t ->> 'n')::int, 0), 10) loop
      perform private.ench_ticket(r.referrer_id, t ->> 'min', 'referral');
      v_tickets := v_tickets || to_jsonb(t ->> 'min');
    end loop;
  end loop;
  update public.referrals set bonus_status = 'paid', bonus_at = now(),
    bonus = jsonb_build_object('tier', (pk ->> 'tier')::int, 'parts', pk -> 'parts', 'ink', v_ink, 'luck_refill', v_refill, 'enchanted_luck', v_ench, 'tickets', v_tickets)
   where referee_id = p_referee;
  insert into public.feed_events (kind, player_id, data) values ('referral', r.referrer_id,
    jsonb_build_object('reward_ink', v_ink, 'bonus', true, 'tier', (pk ->> 'tier')::int, 'friend', p_referee));
  return true;
end $$;

-- the share of a friend's Ink: their inviter's stacked share (switchable as a whole), else the base share (off by
-- default). This runs on every Ink the friend earns, so it's also where a friend becomes real.
create or replace function private.referral_share(p_player uuid, p_amount bigint, p_reason text) returns void
language plpgsql as $$
declare
  base jsonb := coalesce(private.cfg('referrals') -> 'share', '{}'::jsonb); pc jsonb := private.ref_pkgs(); r public.referrals%rowtype; pk jsonb;
  v_pct numeric := 0; v_cap int := 0; v_days int := 0; v_owed int; v_pay int;
begin
  if p_amount <= 0 or not private.guide_play_reason(p_reason) then return; end if;  -- (only Ink the friend earns by playing)
  if exists (select 1 from public.referrals where referee_id = p_player and status = 'rewarded' and real_at is null
              and (real_checked is null or real_checked < private.game_day(now()))) then
    perform private.ref_real_try(p_player);
  end if;
  select * into r from public.referrals where referee_id = p_player and status <> 'void' for update;
  if not found then return; end if;
  pk := private.ref_stack(r.referrer_id);
  if pk is not null and coalesce((pk ->> 'share_pct')::numeric, 0) > 0 then
    if not coalesce((pc ->> 'share_enabled')::boolean, true) or r.status <> 'rewarded' then return; end if;
    v_pct := (pk ->> 'share_pct')::numeric; v_cap := coalesce((pk ->> 'share_cap')::int, 0); v_days := coalesce((pk ->> 'share_days')::int, 0);
    if v_days > 0 and r.qualified_at < now() - make_interval(days => v_days) then return; end if;
  elsif coalesce((base ->> 'enabled')::boolean, false) then
    v_pct := coalesce((base ->> 'pct')::numeric, 10); v_cap := coalesce((base ->> 'cap_ink')::int, 1000);
  else
    return;
  end if;
  if r.share_ink >= v_cap then return; end if;
  if exists (select 1 from public.players where id = r.referrer_id and status = 'banned') then return; end if;
  if private.earn_any_off() and private.earn_off(array['all', 'reason:referral_share', 'reason:referral']) then perform private.earn_note('reason:referral_share', 0); return; end if;
  r.share_acc := r.share_acc + p_amount * v_pct / 100;
  v_owed := least(floor(r.share_acc)::int, v_cap);
  v_pay := greatest(v_owed - r.share_ink, 0);
  update public.referrals set share_acc = r.share_acc, share_ink = share_ink + v_pay where referee_id = p_player;
  if v_pay > 0 then
    perform private.ledger_apply(r.referrer_id, 'ink', v_pay, 'referral_share', 'player', p_player::text, null);
  end if;
end $$;

-- a friend who counts and already played enough (e.g. confirmed their email late) is real straight away
select private.fn_patch('private.referral_qualify(uuid,text)',
  '  update public.referrals set status = ''rewarded'', reward_ink = v_reward, qualified_at = now() where referee_id = p_referee;',
  '  update public.referrals set status = ''rewarded'', reward_ink = v_reward, qualified_at = now() where referee_id = p_referee;
  perform private.ref_real_try(p_referee);');

-- ---- what the Invite page shows ---------------------------------------------------------------------------------
select private.fn_patch('public.my_referrals()',
  $f$'share', jsonb_build_object('enabled', coalesce((v_cfg -> 'share' ->> 'enabled')::boolean, false),$f$,
  $f$'share', private.ref_share_json(v_uid),
    'share_base', jsonb_build_object('enabled', coalesce((v_cfg -> 'share' ->> 'enabled')::boolean, false),$f$);
select private.fn_patch('public.my_referrals()', $f$'default_code', v_default,$f$, $f$'perks', private.ref_perks_json(v_uid), 'default_code', v_default,$f$);
select private.fn_patch('public.my_referrals()', $f$'share_ink', coalesce(sum(share_ink), 0),$f$,
  $f$'share_ink', coalesce(sum(share_ink), 0), 'bonus_ink', coalesce(sum((bonus ->> 'ink')::int), 0),
                'real', count(*) filter (where real_at is not null and status = 'rewarded'),$f$);
select private.fn_patch('public.my_referrals()', $f$'reward_ink', r.reward_ink, 'share_ink', r.share_ink,$f$,
  $f$'reward_ink', r.reward_ink, 'share_ink', r.share_ink, 'real', r.real_at is not null, 'bonus_status', r.bonus_status, 'bonus', r.bonus,$f$);

-- the integrity scanner counts the bonus in what each invited account paid its inviter
select private.fn_patch('private.integrity_referees(uuid,uuid[],text)',
  'select x.referee_id id, x.status, x.created_at, x.qualified_at, x.reward_ink, x.share_ink,',
  'select x.referee_id id, x.status, x.created_at, x.qualified_at, x.reward_ink, x.share_ink, coalesce((x.bonus ->> ''ink'')::int, 0) bonus_ink,');
select private.fn_patch('private.integrity_referees(uuid,uuid[],text)',
  'v_share := coalesce(r.reward_ink, 0) + coalesce(r.share_ink, 0);',
  'v_share := coalesce(r.reward_ink, 0) + coalesce(r.share_ink, 0) + coalesce(r.bonus_ink, 0);');

revoke all on function private.ref_bundle_ok(jsonb), private.ref_packages_ok(jsonb), private.ref_pkgs(), private.ref_real(uuid), private.ref_tier_of(int),
  private.ref_add(jsonb, jsonb), private.ref_stack(uuid), private.ref_share_json(uuid), private.ref_perks_json(uuid), private.ref_real_try(uuid)
  from public, anon, authenticated;
