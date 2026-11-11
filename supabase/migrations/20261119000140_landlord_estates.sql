-- Landlord estates: every Landlord plot group is an estate you can walk into (in 3D), with a monthly to-do list.
-- Rent day (the 1st, 50× USD rent) now has to be earned: an estate only pays 50× on the 1st if its checklist for
-- that rent day is done. The checklist runs from the day after one rent day up to the end of the next one (so you
-- can still finish it on the 1st itself and catch the rest of the day):
--   🔍 Inspect      visit the estate on 3 different days
--   🔧 Repairs      fix 6 things that broke (a few new ones break every day)
--   📬 Tenants      answer 3 tenant requests (up to 2 a day)
--   🌷 Garden       water the garden on 2 different days
-- Every number is in game_config('residential') -> landlord_tasks.

update public.game_config set value = value || '{"landlord_tasks": {"inspect_days": 3, "repairs": 6, "requests": 3, "garden": 2, "spots_per_day": 3, "requests_per_day": 2}}'::jsonb
 where key = 'residential';

create table if not exists public.landlord_progress (
  group_id uuid not null references public.canvas_groups (id) on delete cascade,
  cycle date not null,
  inspect_days date[] not null default '{}',
  garden_days date[] not null default '{}',
  repaired text[] not null default '{}',
  requests int not null default 0,
  request_days jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (group_id, cycle)
);
alter table public.landlord_progress enable row level security;
revoke all on public.landlord_progress from anon, authenticated;

/** the rent day a moment's work counts towards: the 1st itself while it's the 1st, otherwise the next 1st */
create or replace function private.landlord_cycle(p_ts timestamptz) returns date language sql stable as $$
  select case when extract(day from p_ts at time zone 'UTC') = 1 then (p_ts at time zone 'UTC')::date
              else (date_trunc('month', p_ts at time zone 'UTC') + interval '1 month')::date end
$$;
create or replace function private.landlord_tasks() returns jsonb language sql stable as $$
  select coalesce(private.cfg('residential') -> 'landlord_tasks', '{}'::jsonb)
$$;
/** is an estate's checklist done for a rent day? */
create or replace function private.landlord_done(p_group uuid, p_cycle date) returns boolean language sql stable as $$
  select coalesce((
    select coalesce(array_length(l.inspect_days, 1), 0) >= coalesce((t ->> 'inspect_days')::int, 3)
       and coalesce(array_length(l.repaired, 1), 0) >= coalesce((t ->> 'repairs')::int, 6)
       and l.requests >= coalesce((t ->> 'requests')::int, 3)
       and coalesce(array_length(l.garden_days, 1), 0) >= coalesce((t ->> 'garden')::int, 2)
    from public.landlord_progress l, (select private.landlord_tasks() t) x
    where l.group_id = p_group and l.cycle = p_cycle), false)
$$;

-- ---- rent day pays only estates that earned it -----------------------------------------------------------------------
/** the USD rent of a player's Landlord plots whose estates earned a given rent day */
create or replace function private.landlord_rate_for(p_uid uuid, p_cycle date) returns numeric language sql stable as $$
  with c as (select coalesce((private.cfg('rent') ->> 'level_bonus')::numeric, 0.01) as lb)
  select coalesce(sum(r.usd_per_second * (1 + c.lb * (p.level - 1))), 0)
  from public.world_plots p
  join public.plot_rarities r on r.id = p.rarity
  join public.canvas_group_members m on m.gx = p.gx and m.gy = p.gy
  join public.canvas_groups g on g.id = m.group_id and g.kind = 'landlord' and g.status = 'active' and g.owner_id = p_uid
  cross join c
  where p.owner_id = p_uid and private.landlord_done(g.id, p_cycle)
$$;
create or replace function private.landlord_rate(p_uid uuid) returns numeric language sql stable as $$
  select private.landlord_rate_for(p_uid, private.landlord_cycle(now()))
$$;
/** the extra on every rent day since rent was last settled — each rent day paying the estates that earned it */
create or replace function private.landlord_extra(p_uid uuid, p_settled_at timestamptz) returns numeric language sql stable as $$
  with r as (select greatest(p_settled_at, now() - make_interval(days => coalesce((private.cfg('rent') ->> 'max_offline_days')::int, 30))) f, now() t)
  select coalesce(sum(private.landlord_rate_for(p_uid, (d at time zone 'UTC')::date)
                      * (coalesce((private.cfg('residential') ->> 'landlord_mult')::numeric, 50) - 1)
                      * greatest(0, extract(epoch from least(r.t, d + interval '1 day') - greatest(r.f, d)))), 0)
  from r, lateral generate_series(date_trunc('month', r.f at time zone 'UTC'), date_trunc('month', r.t at time zone 'UTC'), interval '1 month') s(m),
       lateral (select s.m at time zone 'UTC' as d) x
  where r.t > r.f
$$;

-- ---- the estate --------------------------------------------------------------------------------------------------------
create or replace function private.estate_group(p_uid uuid, p_group uuid) returns public.canvas_groups language plpgsql stable as $$
declare g public.canvas_groups;
begin
  select * into g from public.canvas_groups where id = p_group;
  if not found or g.owner_id is distinct from p_uid or g.status <> 'active' then raise exception 'not_owned' using errcode = 'P0001'; end if;
  if g.kind <> 'landlord' then raise exception 'not_an_estate' using errcode = 'P0001'; end if;
  return g;
end $$;
/** what broke today: a few houses, chosen by the day (house index, and which thing) */
create or replace function private.estate_spots(p_group uuid, p_houses int, p_day date) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('idx', i, 'house', abs(hashtext(p_group::text || p_day::text || i)) % greatest(p_houses, 1),
           'what', (array['roof', 'window', 'door', 'pipe', 'light', 'fence'])[1 + abs(hashtext('w' || p_group::text || p_day::text || i)) % 6]) order by i), '[]'::jsonb)
  from generate_series(0, coalesce((private.landlord_tasks() ->> 'spots_per_day')::int, 3) - 1) i
$$;
create or replace function private.estate_json(p_group uuid) returns jsonb language sql stable as $$
  with g as (select * from public.canvas_groups where id = p_group),
  t as (select private.landlord_tasks() t, private.game_day(now()) d, private.landlord_cycle(now()) c),
  l as (select * from public.landlord_progress where group_id = p_group and cycle = (select c from t))
  select jsonb_build_object(
    'group_id', g.id, 'name', g.name, 'houses', g.plot_count, 'cycle', t.c, 'today', t.d,
    'rent_day', extract(day from now() at time zone 'UTC') = 1,
    'next_rent_day', (t.c::timestamp at time zone 'UTC'),
    'multiplier', coalesce((private.cfg('residential') ->> 'landlord_mult')::numeric, 50),
    'eligible', private.landlord_done(g.id, t.c),
    'tasks', jsonb_build_object(
      'inspect', jsonb_build_object('done', coalesce(array_length(l.inspect_days, 1), 0), 'need', coalesce((t.t ->> 'inspect_days')::int, 3), 'today', coalesce(t.d = any (l.inspect_days), false)),
      'repairs', jsonb_build_object('done', coalesce(array_length(l.repaired, 1), 0), 'need', coalesce((t.t ->> 'repairs')::int, 6)),
      'requests', jsonb_build_object('done', coalesce(l.requests, 0), 'need', coalesce((t.t ->> 'requests')::int, 3),
                                     'left_today', greatest(coalesce((t.t ->> 'requests_per_day')::int, 2) - coalesce((l.request_days ->> t.d::text)::int, 0), 0)),
      'garden', jsonb_build_object('done', coalesce(array_length(l.garden_days, 1), 0), 'need', coalesce((t.t ->> 'garden')::int, 2), 'today', coalesce(t.d = any (l.garden_days), false))),
    'spots', (select coalesce(jsonb_agg(s || jsonb_build_object('fixed', coalesce((t.d::text || ':' || (s ->> 'idx')) = any (l.repaired), false))), '[]'::jsonb)
              from jsonb_array_elements(private.estate_spots(g.id, g.plot_count, t.d)) s))
  from g, t left join l on true
$$;
create or replace function private.estate_touch(p_group uuid) returns void language sql as $$
  insert into public.landlord_progress (group_id, cycle) values (p_group, private.landlord_cycle(now())) on conflict do nothing
$$;

/** walk into your estate (counts as today's inspection) */
create or replace function public.estate_visit(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.canvas_groups := private.estate_group(v_uid, p_group); v_day date := private.game_day(now());
begin
  perform private.estate_touch(g.id);
  update public.landlord_progress set inspect_days = array_append(inspect_days, v_day), updated_at = now()
   where group_id = g.id and cycle = private.landlord_cycle(now()) and not (v_day = any (inspect_days));
  return private.estate_json(g.id);
end $$;

/** fix one of today's broken things */
create or replace function public.estate_repair(p_group uuid, p_idx int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.canvas_groups := private.estate_group(v_uid, p_group); v_day date := private.game_day(now()); v_key text;
begin
  perform private.rate_limit('estate_action', 600, 3600);
  if p_idx is null or p_idx < 0 or p_idx >= coalesce((private.landlord_tasks() ->> 'spots_per_day')::int, 3) then raise exception 'invalid_spot' using errcode = 'P0001'; end if;
  v_key := v_day::text || ':' || p_idx;
  perform private.estate_touch(g.id);
  update public.landlord_progress set repaired = array_append(repaired, v_key), updated_at = now()
   where group_id = g.id and cycle = private.landlord_cycle(now()) and not (v_key = any (repaired));
  if not found then raise exception 'already_fixed' using errcode = 'P0001'; end if;
  return private.estate_json(g.id);
end $$;

/** answer a tenant (helping counts; ignoring doesn't) */
create or replace function public.estate_request(p_group uuid, p_help boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.canvas_groups := private.estate_group(v_uid, p_group); v_day text := private.game_day(now())::text;
  l public.landlord_progress;
begin
  perform private.rate_limit('estate_action', 600, 3600);
  perform private.estate_touch(g.id);
  select * into l from public.landlord_progress where group_id = g.id and cycle = private.landlord_cycle(now()) for update;
  if coalesce((l.request_days ->> v_day)::int, 0) >= coalesce((private.landlord_tasks() ->> 'requests_per_day')::int, 2) then
    raise exception 'no_requests_today' using errcode = 'P0001';
  end if;
  update public.landlord_progress
     set request_days = request_days || jsonb_build_object(v_day, coalesce((request_days ->> v_day)::int, 0) + 1),
         requests = requests + case when coalesce(p_help, false) then 1 else 0 end, updated_at = now()
   where group_id = l.group_id and cycle = l.cycle;
  return private.estate_json(g.id);
end $$;

/** water the garden (once a day) */
create or replace function public.estate_garden(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.canvas_groups := private.estate_group(v_uid, p_group); v_day date := private.game_day(now());
begin
  perform private.estate_touch(g.id);
  update public.landlord_progress set garden_days = array_append(garden_days, v_day), updated_at = now()
   where group_id = g.id and cycle = private.landlord_cycle(now()) and not (v_day = any (garden_days));
  if not found then raise exception 'already_watered' using errcode = 'P0001'; end if;
  return private.estate_json(g.id);
end $$;

/** all your estates at a glance */
create or replace function public.my_estates() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player();
begin
  return coalesce((select jsonb_agg(private.estate_json(g.id) order by g.created_at)
                   from public.canvas_groups g where g.owner_id = v_uid and g.kind = 'landlord' and g.status = 'active'), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.estate_visit(uuid)', 'public.estate_repair(uuid, integer)', 'public.estate_request(uuid, boolean)', 'public.estate_garden(uuid)', 'public.my_estates()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.landlord_cycle(timestamptz)', 'private.landlord_tasks()', 'private.landlord_done(uuid, date)', 'private.landlord_rate_for(uuid, date)',
    'private.estate_group(uuid, uuid)', 'private.estate_spots(uuid, integer, date)', 'private.estate_json(uuid)', 'private.estate_touch(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
