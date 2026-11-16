-- Crowns: a 1% share of the kingdom instead of a rent multiplier.
--
-- A Crown used to multiply ALL its holder's rent (City ×1.5, State ×5, Country ×10 at full strength) — not
-- sustainable. Now each Crown pays its holder a share of its kingdom (the city, the state or the country), and the
-- holder picks which:
--   · Ink share  — 1% of all the Ink every other player with land in the kingdom earns by playing (paid every few
--                  minutes, as Ink; invites, conversions, refunds and other Crowns' shares don't count)
--   · Rent share — 1% of the rent every other player's land in the kingdom earns (base rent; boosts don't count),
--                  added to the holder's rent
-- The share is minted for the holder: nobody in the kingdom earns any less. Once picked, a Crown's share is locked
-- for a month; after that it can be switched (and locks for another month). Until its holder picks, a Crown pays the
-- Rent share and the first pick is free. When a Crown changes hands, its new holder picks afresh.
-- Every number is a setting (game_config 'crowns'); 'rent.extra:crown' and 'reason:crown' switch the shares off live.

insert into public.game_config (key, value, description) values ('crowns', jsonb_build_object(
    'ink_pct', 1, 'rent_pct', 1, 'lock_days', 30, 'tick_minutes', 10, 'ink_daily_cap', 0),
  'Crowns: the share of their kingdom each Crown pays its holder (Ink share % or Rent share %), how long a pick is locked, how often the Ink share is paid, and an optional daily cap on a Crown''s Ink share (0 = none).')
on conflict (key) do nothing;

-- the old multiplier is gone (rent_mult reads crown_pct)
create or replace function private.crown_pct(p_uid uuid) returns numeric language sql stable as $$ select 0::numeric $$;
update public.game_config set value = value
  || jsonb_build_object('crown', coalesce(value -> 'crown', '{}'::jsonb) || '{"pct": 0}'::jsonb,
                        'crown_state', coalesce(value -> 'crown_state', '{}'::jsonb) || '{"pct": 0}'::jsonb,
                        'crown_country', coalesce(value -> 'crown_country', '{}'::jsonb) || '{"pct": 0}'::jsonb)
where key = 'rarity_abilities';
update public.plot_rarities set ability = case id
  when 'crown' then 'One per city. Its holder picks a share of the city: 1% of all the Ink every other player with land there earns, or 1% of all their rent. Locked for a month once picked.'
  when 'crown_state' then 'One per state or province. Its holder picks a share of the state: 1% of all the Ink every other player with land there earns, or 1% of all their rent. Locked for a month once picked.'
  else 'One per country. Its holder picks a share of the country: 1% of all the Ink every other player with land there earns, or 1% of all their rent. Locked for a month once picked.' end
where id in ('crown', 'crown_state', 'crown_country');

create or replace function private.crown_cfg() returns jsonb language sql stable as $$ select coalesce(private.cfg('crowns'), '{}'::jsonb) $$;

-- ---- each Crown's pick ------------------------------------------------------------------------------------------
create table if not exists public.crown_shares (
  gx int not null, gy int not null,
  holder uuid not null references public.players (id) on delete cascade,
  choice text not null check (choice in ('ink', 'rent')),
  chosen_at timestamptz not null default now(),
  locked_until timestamptz not null,
  ink_paid_at timestamptz not null default now(),   -- the Ink share is counted from here
  ink_frac numeric not null default 0,
  ink_total bigint not null default 0,
  switches int not null default 0,
  primary key (gx, gy));
alter table public.crown_shares enable row level security;
create index if not exists crown_shares_holder on public.crown_shares (holder);

/** everyone else who owns land in a Crown's kingdom */
create or replace function private.crown_members(p_tier text, p_city int, p_holder uuid) returns table (player_id uuid) language sql stable as $$
  select distinct p.owner_id from public.world_plots p
   where p_tier = 'crown' and p.city_id = p_city and p.owner_id is not null and p.owner_id <> p_holder
  union
  select distinct p.owner_id from public.world_cities k join public.world_cities c on c.country = k.country and c.state = k.state
    join public.world_plots p on p.region_city_id = c.id
   where p_tier = 'crown_state' and k.id = p_city and k.state is not null and p.owner_id is not null and p.owner_id <> p_holder
  union
  select distinct p.owner_id from public.world_cities k join public.world_cities c on c.country = k.country
    join public.world_plots p on p.region_city_id = c.id
   where p_tier = 'crown_country' and k.id = p_city and p.owner_id is not null and p.owner_id <> p_holder
$$;

/** the base rent rate of everyone else's land in a kingdom ($/s) */
create or replace function private.kingdom_rent_rate(p_tier text, p_city int, p_holder uuid) returns numeric language sql stable as $$
  select coalesce(sum(private.plot_rate(p, r.usd_per_second)), 0) from (
    select p.* from public.world_plots p where p_tier = 'crown' and p.city_id = p_city and p.owner_id is not null and p.owner_id <> p_holder
    union all
    select p.* from public.world_cities k join public.world_cities c on c.country = k.country and c.state = k.state
      join public.world_plots p on p.region_city_id = c.id
     where p_tier = 'crown_state' and k.id = p_city and k.state is not null and p.owner_id is not null and p.owner_id <> p_holder
    union all
    select p.* from public.world_cities k join public.world_cities c on c.country = k.country
      join public.world_plots p on p.region_city_id = c.id
     where p_tier = 'crown_country' and k.id = p_city and p.owner_id is not null and p.owner_id <> p_holder) p
  join public.plot_rarities r on r.id = p.rarity
$$;

/** a Crown's pick (a pick by an earlier holder doesn't count) */
create or replace function private.crown_choice(p public.world_plots) returns text language sql stable as $$
  select coalesce((select s.choice from public.crown_shares s where s.gx = p.gx and s.gy = p.gy and s.holder = p.owner_id), 'rent')
$$;

/** the Rent share: 1% of the kingdom's rent for every Crown of theirs on the Rent share ($/s) */
create or replace function private.crown_rent_rate(p_uid uuid) returns numeric language sql stable as $$
  select coalesce(sum(private.kingdom_rent_rate(p.rarity, p.city_id, p_uid)), 0) * coalesce((private.crown_cfg() ->> 'rent_pct')::numeric, 1) / 100
  from public.world_plots p
  where p.owner_id = p_uid and p.rarity in ('crown', 'crown_state', 'crown_country') and p.city_id is not null and private.crown_choice(p) = 'rent'
$$;

/** what the Rent share added since the last settle (unboosted) */
create or replace function private.crown_rent_extra(p_uid uuid, p_settled_at timestamptz) returns numeric language sql stable as $$
  select case when private.earn_any_off() and private.earn_off(array['rent.extra:crown']) then 0::numeric
              when not exists (select 1 from public.world_plots where owner_id = p_uid and rarity in ('crown', 'crown_state', 'crown_country')) then 0::numeric
              else private.crown_rent_rate(p_uid) * greatest(0, extract(epoch from now() - greatest(p_settled_at, now() - make_interval(days => coalesce((private.cfg('rent') ->> 'max_offline_days')::int, 30))))) end
$$;

select private.fn_patch('private.rent_settle(uuid)', '+ private.ability_extra(p_uid, a.settled_at)', '+ private.ability_extra(p_uid, a.settled_at) + private.crown_rent_extra(p_uid, a.settled_at)');
select private.fn_patch('private.rent_json(uuid)', '+ private.ability_extra(p_uid, a.settled_at)', '+ private.ability_extra(p_uid, a.settled_at) + private.crown_rent_extra(p_uid, a.settled_at)');

-- ---- the Ink share ----------------------------------------------------------------------------------------------
/** pay one Crown's Ink share up to now */
create or replace function private.crown_ink_pay(p_gx int, p_gy int) returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.world_plots; s public.crown_shares; v_sum numeric; v numeric; v_pay int; v_cap int := coalesce((private.crown_cfg() ->> 'ink_daily_cap')::int, 0); v_today int;
begin
  select * into p from public.world_plots where gx = p_gx and gy = p_gy;
  if p.owner_id is null or p.rarity not in ('crown', 'crown_state', 'crown_country') or p.city_id is null then return 0; end if;
  select * into s from public.crown_shares where gx = p_gx and gy = p_gy and holder = p.owner_id and choice = 'ink' for update;
  if not found then return 0; end if;
  select coalesce(sum(l.delta), 0) into v_sum from public.resource_ledger l
   where l.resource = 'ink' and l.delta > 0 and l.created_at > s.ink_paid_at and l.created_at <= now()
     and l.reason <> 'crown' and private.guide_play_reason(l.reason)
     and l.player_id in (select m.player_id from private.crown_members(p.rarity, p.city_id, p.owner_id) m);
  v := s.ink_frac + v_sum * coalesce((private.crown_cfg() ->> 'ink_pct')::numeric, 1) / 100;
  v_pay := floor(v)::int;
  if v_cap > 0 and v_pay > 0 then
    select coalesce(sum(delta), 0) into v_today from public.resource_ledger where player_id = p.owner_id and resource = 'ink' and reason = 'crown'
       and ref_id = p_gx || ':' || p_gy and created_at >= private.day_start(now());
    v_pay := least(v_pay, greatest(0, v_cap - v_today));
    v := least(v, v_pay + 0.999);
  end if;
  if v_pay > 0 then
    perform private.grant(p.owner_id, jsonb_build_object('ink', v_pay), 'crown', 'crown', p_gx || ':' || p_gy, 'crown:' || p_gx || ':' || p_gy || ':' || extract(epoch from now())::bigint);
  end if;
  update public.crown_shares set ink_paid_at = now(), ink_frac = v - floor(v), ink_total = ink_total + greatest(v_pay, 0) where gx = p_gx and gy = p_gy;
  return v_pay;
end $$;

/** every Crown on the Ink share, every few minutes */
create or replace function private.crown_tick() returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_n int := 0;
begin
  for r in select s.gx, s.gy from public.crown_shares s join public.world_plots p on p.gx = s.gx and p.gy = s.gy and p.owner_id = s.holder
            where s.choice = 'ink' and s.ink_paid_at < now() - make_interval(mins => greatest(coalesce((private.crown_cfg() ->> 'tick_minutes')::int, 10), 1)) loop
    v_n := v_n + coalesce(private.crown_ink_pay(r.gx, r.gy), 0);
  end loop;
  return v_n;
end $$;

-- ---- what a holder sees, and the pick ---------------------------------------------------------------------------
create or replace function private.crown_share_json(p public.world_plots, p_uid uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.crown_shares; k public.world_cities; v_members int; v_ink_day numeric; v_rent numeric; c jsonb := private.crown_cfg();
begin
  select * into k from public.world_cities where id = p.city_id;
  select * into s from public.crown_shares where gx = p.gx and gy = p.gy and holder = p.owner_id;
  select count(*) into v_members from private.crown_members(p.rarity, p.city_id, p.owner_id);
  select coalesce(sum(l.delta), 0) into v_ink_day from public.resource_ledger l
   where l.resource = 'ink' and l.delta > 0 and l.created_at > now() - interval '24 hours' and l.reason <> 'crown' and private.guide_play_reason(l.reason)
     and l.player_id in (select m.player_id from private.crown_members(p.rarity, p.city_id, p.owner_id) m);
  v_rent := private.kingdom_rent_rate(p.rarity, p.city_id, p.owner_id);
  return jsonb_build_object(
    'gx', p.gx, 'gy', p.gy, 'tier', p.rarity,
    'kingdom', case p.rarity when 'crown' then k.name when 'crown_state' then coalesce(k.state, k.country_name, k.country) else coalesce(k.country_name, k.country) end,
    'country', k.country, 'members', v_members,
    'choice', coalesce(s.choice, 'rent'), 'picked', s.gx is not null, 'chosen_at', s.chosen_at, 'locked_until', s.locked_until,
    'can_switch', s.gx is null or s.locked_until <= now(),
    'ink_pct', coalesce((c ->> 'ink_pct')::numeric, 1), 'rent_pct', coalesce((c ->> 'rent_pct')::numeric, 1), 'lock_days', coalesce((c ->> 'lock_days')::int, 30),
    -- what each share would pay right now
    'ink_day', floor(v_ink_day * coalesce((c ->> 'ink_pct')::numeric, 1) / 100),
    'rent_usd_per_second', v_rent * coalesce((c ->> 'rent_pct')::numeric, 1) / 100,
    'rent_day', v_rent * coalesce((c ->> 'rent_pct')::numeric, 1) / 100 * 86400,
    'ink_total', coalesce(s.ink_total, 0), 'ink_pending', case when s.choice = 'ink' then floor(s.ink_frac) else 0 end,
    'mine', p.owner_id = p_uid);
end $$;

/** my Crowns, each with its share (settles any Ink share due first) */
create or replace function public.crown_shares_mine() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r record;
begin
  for r in select s.gx, s.gy from public.crown_shares s join public.world_plots p on p.gx = s.gx and p.gy = s.gy and p.owner_id = s.holder
            where s.holder = v_uid and s.choice = 'ink' loop
    perform private.crown_ink_pay(r.gx, r.gy);
  end loop;
  return coalesce((select jsonb_agg(private.crown_share_json(p, v_uid) order by case p.rarity when 'crown_country' then 0 when 'crown_state' then 1 else 2 end, p.claimed_at)
                     from public.world_plots p where p.owner_id = v_uid and p.rarity in ('crown', 'crown_state', 'crown_country') and p.city_id is not null), '[]'::jsonb);
end $$;

/** pick (or, a month later, switch) a Crown's share */
create or replace function public.crown_share_choose(p_gx int, p_gy int, p_choice text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); p public.world_plots; s public.crown_shares; v_lock int := coalesce((private.crown_cfg() ->> 'lock_days')::int, 30);
begin
  if coalesce(p_choice, '') not in ('ink', 'rent') then raise exception 'invalid_choice' using errcode = 'P0001'; end if;
  select * into p from public.world_plots where gx = p_gx and gy = p_gy;
  if p.owner_id is distinct from v_uid or p.rarity not in ('crown', 'crown_state', 'crown_country') then raise exception 'not_your_crown' using errcode = 'P0001'; end if;
  select * into s from public.crown_shares where gx = p_gx and gy = p_gy for update;
  if found and s.holder = v_uid then
    if s.choice = p_choice then return private.crown_share_json(p, v_uid); end if;
    if s.locked_until > now() then raise exception 'crown_choice_locked' using errcode = 'P0001', detail = s.locked_until::text; end if;
  end if;
  -- what the old share earned up to now is paid under it
  perform private.rent_settle(v_uid);
  if found and s.holder = v_uid and s.choice = 'ink' then perform private.crown_ink_pay(p_gx, p_gy); end if;
  insert into public.crown_shares (gx, gy, holder, choice, chosen_at, locked_until, ink_paid_at, ink_frac, ink_total, switches)
  values (p_gx, p_gy, v_uid, p_choice, now(), now() + make_interval(days => v_lock), now(), 0, 0, 0)
  on conflict (gx, gy) do update set holder = excluded.holder, choice = excluded.choice, chosen_at = now(), locked_until = excluded.locked_until, ink_paid_at = now(), ink_frac = 0,
    ink_total = case when public.crown_shares.holder = excluded.holder then public.crown_shares.ink_total else 0 end,
    switches = case when public.crown_shares.holder = excluded.holder then public.crown_shares.switches + 1 else 0 end;
  perform private.audit('crown.share', 'plot', p_gx || ':' || p_gy, jsonb_build_object('choice', p_choice, 'tier', p.rarity));
  return private.crown_share_json(p, v_uid);
end $$;

revoke all on function public.crown_shares_mine() from public, anon;
revoke all on function public.crown_share_choose(int, int, text) from public, anon;
grant execute on function public.crown_shares_mine() to authenticated;
grant execute on function public.crown_share_choose(int, int, text) to authenticated;

-- the Royalty page: the share instead of the old boost
select private.fn_patch('public.royalty()', '''rent_boost'', round(1 + private.crown_pct(owner_id) / 100, 3))', '''rent_boost'', 1)');
select private.fn_patch('public.royalty()', 'select p.rarity tier, p.owner_id,', 'select p.gx, p.gy, p.rarity tier, p.owner_id,');
select private.fn_patch('public.royalty()', '''is_me'', is_me,', '''is_me'', is_me,
        ''share'', case when is_me then coalesce((select s.choice from public.crown_shares s where s.gx = c.gx and s.gy = c.gy and s.holder = c.owner_id), ''rent'') end,');

-- the heartbeat pays the Ink shares every ten minutes (elsewhere they're paid whenever the holder looks)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'landvas-crowns';
      perform cron.schedule('landvas-crowns', '*/10 * * * *', 'select private.crown_tick()');
    exception when others then
      raise notice 'pg_cron not available here (%): Crown Ink shares are paid when their holder looks', sqlerrm;
    end;
  end if;
end $$;
