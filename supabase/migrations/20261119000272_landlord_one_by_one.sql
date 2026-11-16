-- Landlord estates: the monthly checklist is done one estate at a time, by being there.
--
-- Each estate's checklist (inspect, repairs, tenants, garden) has to be done in that estate, by hand:
--   · you're "in" one estate at a time — walking into another leaves the first;
--   · today's inspection counts once you've been in the estate a moment (the screen looks again after a couple of
--     seconds), so you can't tick off a row of estates by flicking through them;
--   · repairs, tenant letters and watering only count in the estate you're in (enter_estate_first otherwise), once
--     you've been there a moment, and one task at a time, about a second apart (estate_too_fast otherwise — the
--     game queues taps so a quick tapper never sees it).
-- So nothing can tick off many estates in bulk, and a script can't clear a checklist in one go.
-- Settings in game_config 'residential' landlord_pace: min_stay_seconds, gap_seconds, presence_minutes.
-- Each task done goes in the fair-play log ('estate_task') for the integrity scanner.

update public.game_config set value = value || jsonb_build_object('landlord_pace', coalesce(value -> 'landlord_pace',
  '{"min_stay_seconds": 2, "gap_seconds": 1, "presence_minutes": 30}'::jsonb))
where key = 'residential';

create table if not exists private.estate_presence (
  player_id uuid primary key references public.players (id) on delete cascade,
  group_id uuid not null,
  entered_at timestamptz not null default now(),
  last_action_at timestamptz,
  actions int not null default 0);
alter table private.estate_presence enable row level security;

create or replace function private.estate_pace() returns jsonb language sql stable as $$
  select coalesce(private.cfg('residential') -> 'landlord_pace', '{}'::jsonb)
$$;

/** you're in this estate now (and no other). True once you've been here a moment: that's when an inspection counts. */
create or replace function private.estate_enter(p_uid uuid, p_group uuid) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare pr private.estate_presence; c jsonb := private.estate_pace();
begin
  select * into pr from private.estate_presence where player_id = p_uid for update;
  if found and pr.group_id = p_group and pr.entered_at > now() - make_interval(mins => coalesce((c ->> 'presence_minutes')::int, 30)) then
    return now() - pr.entered_at >= make_interval(secs => coalesce((c ->> 'min_stay_seconds')::numeric, 2));
  end if;
  insert into private.estate_presence (player_id, group_id, entered_at, last_action_at, actions) values (p_uid, p_group, now(), null, 0)
  on conflict (player_id) do update set group_id = excluded.group_id, entered_at = now(), last_action_at = null, actions = 0;
  return false; -- just walked in
end $$;

/** a checklist task here, now: in this estate, settled in, one at a time */
create or replace function private.estate_act(p_uid uuid, p_group uuid, p_task text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare pr private.estate_presence; c jsonb := private.estate_pace();
begin
  select * into pr from private.estate_presence where player_id = p_uid for update;
  if not found or pr.group_id <> p_group or pr.entered_at < now() - make_interval(mins => coalesce((c ->> 'presence_minutes')::int, 30)) then
    raise exception 'enter_estate_first' using errcode = 'P0001';
  end if;
  if now() - pr.entered_at < make_interval(secs => coalesce((c ->> 'min_stay_seconds')::numeric, 2))
     or (pr.last_action_at is not null and now() - pr.last_action_at < make_interval(secs => coalesce((c ->> 'gap_seconds')::numeric, 1))) then
    raise exception 'estate_too_fast' using errcode = 'P0001';
  end if;
  update private.estate_presence set last_action_at = now(), actions = actions + 1 where player_id = p_uid;
  perform private.fairplay(p_uid, 'estate_task', null, null, jsonb_build_object('group', p_group, 'task', p_task,
    'since_enter', round(extract(epoch from now() - pr.entered_at)::numeric, 2),
    'since_last', round(extract(epoch from now() - pr.last_action_at)::numeric, 2)));
end $$;

-- walking in: you're here now; it's today's inspection once you've been here a moment
select private.fn_patch('public.estate_visit(uuid)',
  '  perform private.estate_touch(g.id);
  update public.landlord_progress set inspect_days = array_append(inspect_days, v_day), updated_at = now()
   where group_id = g.id and cycle = private.landlord_cycle(now()) and not (v_day = any (inspect_days));',
  '  perform private.estate_touch(g.id);
  if private.estate_enter(v_uid, g.id) then
    update public.landlord_progress set inspect_days = array_append(inspect_days, v_day), updated_at = now()
     where group_id = g.id and cycle = private.landlord_cycle(now()) and not (v_day = any (inspect_days));
  end if;');
-- every task: in this estate, one at a time
select private.fn_patch('public.estate_repair(uuid,integer)', '  v_key := v_day::text || '':'' || p_idx;', '  v_key := v_day::text || '':'' || p_idx;
  perform private.estate_act(v_uid, g.id, ''repair'');');
select private.fn_patch('public.estate_request(uuid,boolean)', '  perform private.estate_touch(g.id);', '  perform private.estate_act(v_uid, g.id, ''request'');
  perform private.estate_touch(g.id);');
select private.fn_patch('public.estate_garden(uuid)', '  perform private.estate_touch(g.id);', '  perform private.estate_act(v_uid, g.id, ''garden'');
  perform private.estate_touch(g.id);');
