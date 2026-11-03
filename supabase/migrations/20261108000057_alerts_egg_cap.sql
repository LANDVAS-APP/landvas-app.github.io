-- v0.39 Notifications for everything people do with you, and eggs capped at 3 a day.
-- New alerts: friend requests and accepts, sanctuary visits, playdates with your Inkborn, someone warping to
-- you, someone looking round your base, and a new neighbour next to one of your planet plots. The app pops
-- them up as they arrive. Eggs: at most 3 a day each, counting the ones you get as a host too.

alter table public.player_notifications drop constraint if exists player_notifications_kind_check;
alter table public.player_notifications add constraint player_notifications_kind_check check (kind in (
  'stamp', 'visit', 'checkin', 'inspire', 'sketch_vote', 'note', 'potd', 'duet', 'doodle',
  'friend_request', 'friend_accept', 'sanctuary_visit', 'playdate', 'warp', 'base_visit', 'neighbor'));

create or replace function private.notify(p_player uuid, p_kind text, p_actor uuid, p_data jsonb) returns void
language plpgsql as $$
begin
  if p_player is null or p_player = p_actor then return; end if;
  -- the same person doesn't ping you twice in an hour for a visit or a warp, or twice in a day as a new neighbour
  if p_kind in ('visit', 'sanctuary_visit', 'base_visit', 'warp') and exists (select 1 from public.player_notifications where player_id = p_player and kind = p_kind
       and actor_id is not distinct from p_actor and created_at > now() - interval '1 hour') then return; end if;
  if p_kind = 'neighbor' and exists (select 1 from public.player_notifications where player_id = p_player and kind = 'neighbor'
       and actor_id is not distinct from p_actor and created_at > now() - interval '1 day') then return; end if;
  -- keep the list tidy: no more than 300 a person
  insert into public.player_notifications (player_id, kind, actor_id, data) values (p_player, p_kind, p_actor, coalesce(p_data, '{}'::jsonb));
  delete from public.player_notifications where player_id = p_player and id < (
    select id from public.player_notifications where player_id = p_player order by id desc offset 300 limit 1);
end $$;

-- friends
create or replace function private.notify_friend_trg() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform private.notify(new.addressee_id, 'friend_request', new.requester_id, '{}'::jsonb);
  elsif new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    perform private.notify(new.requester_id, 'friend_accept', new.addressee_id, '{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify after insert or update of status on public.friendships for each row execute function private.notify_friend_trg();

-- a new neighbour on a planet: everyone who owns one of the 8 plots around it
create or replace function private.notify_neighbor_trg() returns trigger language plpgsql as $$
declare o uuid;
begin
  for o in select distinct owner_id from public.planet_plots
            where world = new.world and gx between new.gx - 1 and new.gx + 1 and gy between new.gy - 1 and new.gy + 1 and owner_id <> new.owner_id limit 8 loop
    perform private.notify(o, 'neighbor', new.owner_id, jsonb_build_object('world', new.world, 'gx', new.gx, 'gy', new.gy));
  end loop;
  return new;
end $$;
drop trigger if exists planet_plots_notify on public.planet_plots;
create trigger planet_plots_notify after insert on public.planet_plots for each row execute function private.notify_neighbor_trg();

/** Looking round someone's sanctuary: tells the keeper (once an hour per visitor). */
create or replace function public.sanctuary_visit_ping(p_habitat uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); h public.habitats%rowtype;
begin
  perform private.rate_limit('visit_ping', 240, 3600);
  select * into h from public.habitats where id = p_habitat;
  if not found or h.owner_id = v_uid or not private.visible_to(h.owner_id, v_uid) then return jsonb_build_object('ok', false); end if;
  perform private.notify(h.owner_id, 'sanctuary_visit', v_uid, jsonb_build_object('habitat', h.id,
    'name', coalesce((select name from public.canvas_groups where id = h.group_id), case when h.kind = 'starter' then 'Starter sanctuary' end)));
  return jsonb_build_object('ok', true);
end $$;

/** Looking round someone's planet base. */
create or replace function public.planet_base_visit_ping(p_world text, p_gx int, p_gy int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b public.planet_bases%rowtype;
begin
  perform private.rate_limit('visit_ping', 240, 3600);
  select * into b from public.planet_bases where world = p_world and gx = p_gx and gy = p_gy;
  if not found or b.owner_id = v_uid or jsonb_array_length(b.layout) = 0 or not private.visible_to(b.owner_id, v_uid) then return jsonb_build_object('ok', false); end if;
  perform private.notify(b.owner_id, 'base_visit', v_uid, jsonb_build_object('world', p_world, 'gx', p_gx, 'gy', p_gy));
  return jsonb_build_object('ok', true);
end $$;

/** How many eggs this player has been given today (as the one who asked or the one who hosted). */
create or replace function private.eggs_today(p_uid uuid) returns int language sql stable as $$
  select count(*)::int from public.inkborn_eggs where owner_id = p_uid and laid_at >= private.day_start(now())
$$;

create or replace function public.space_warp_to_player(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); me public.space_pilots%rowtype; them public.space_pilots%rowtype;
  v_friend boolean; pr public.planet_presence%rowtype; v_in int; v_max int := coalesce((private.planet_cfg() -> 'live' ->> 'group_size')::int, 10);
  v_d float8[]; v_spawn jsonb := null;
begin
  perform private.rate_limit('space_launch', 240, 3600);
  if p_player = v_uid then raise exception 'invalid_target' using errcode = 'P0001'; end if;
  if not private.visible_to(p_player, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  me := private.space_pilot(v_uid);
  if cardinality(me.parts) < 4 then raise exception 'rocket_not_built' using errcode = 'P0001'; end if;
  select * into them from public.space_pilots where player_id = p_player;
  if not found or them.location = 'earth' or them.dest is not null then raise exception 'not_in_space' using errcode = 'P0001'; end if;
  v_friend := private.friend_state(v_uid, p_player) = 'friends';
  -- where they are (their last known spot on this world), and whether their live group is still live
  select * into pr from public.planet_presence where player_id = p_player and world = them.location;
  if pr.player_id is not null and pr.seen_at > now() - interval '15 seconds' then
    select count(*) into v_in from public.planet_presence where world = pr.world and shard = pr.shard and seen_at > now() - interval '15 seconds' and player_id <> v_uid;
  else
    v_in := null;
  end if;
  -- a far-off world (someone's home) only with friends; anyone else only into a live group with room
  if them.location like 'exo:%' and not v_friend then raise exception 'not_friends' using errcode = 'P0001'; end if;
  if not v_friend and (v_in is null or v_in >= v_max) then raise exception 'room_full' using errcode = 'P0001'; end if;
  -- warp there (free and instant), and join their live group if it has room
  update public.space_pilots set location = them.location, dest = null, depart_at = null, arrive_at = null, exo_seed = coalesce(them.exo_seed, exo_seed),
         visited = case when them.location = any(visited) then visited else visited || them.location end, launches = launches + 1, updated_at = now()
   where player_id = v_uid returning * into me;
  if pr.player_id is not null then
    v_d := pr.d;
    if v_in is not null and v_in < v_max then
      insert into public.planet_presence (player_id, world, shard, d, face, hop, joined_at, seen_at)
      values (v_uid, pr.world, pr.shard, pr.d, pr.face, 0, now(), now())
      on conflict (player_id) do update set world = excluded.world, shard = excluded.shard, d = excluded.d, face = excluded.face, hop = 0, joined_at = now(), seen_at = now();
    end if;
    v_spawn := jsonb_build_object('d', to_jsonb(v_d), 'player', p_player);
  end if;
  perform private.notify(p_player, 'warp', v_uid, jsonb_build_object('world', them.location, 'joined', v_in is not null and v_in < v_max));
  return private.space_json(me) || jsonb_build_object('warped', true, 'spawn', v_spawn, 'with', private.profile_json(p_player));
end $$;

create or replace function public.inkborn_playdate_start(p_mine uuid, p_theirs uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); a public.inkborn%rowtype; b public.inkborn%rowtype; p public.inkborn_playdates%rowtype; c jsonb := private.pd_cfg();
begin
  perform private.rate_limit('inkborn_playdate', 60, 3600);
  if not coalesce((c ->> 'enabled')::boolean, true) then raise exception 'feature_disabled' using errcode = 'P0001'; end if;
  select * into a from public.inkborn where id = p_mine;
  if not found or a.owner_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  select * into b from public.inkborn where id = p_theirs;
  if not found or not private.visible_to(b.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if b.owner_id = v_uid then raise exception 'playdate_own' using errcode = 'P0001'; end if;
  insert into public.inkborn_playdates (guest_id, guest_inkborn, host_id, host_inkborn, seed)
  values (v_uid, a.id, b.owner_id, b.id, floor(random() * 2147483647)::int) returning * into p;
  return jsonb_build_object('session', p.id, 'seed', p.seed, 'seconds', coalesce((c ->> 'seconds')::int, 45), 'egg_score', coalesce((c ->> 'egg_score')::int, 45),
    'mine', jsonb_build_object('id', a.id, 'name', a.name, 'genome', a.genome),
    'theirs', jsonb_build_object('id', b.id, 'name', b.name, 'genome', b.genome, 'owner', private.profile_json(b.owner_id)),
    'eggs_left', greatest(0, coalesce((c ->> 'eggs_per_day')::int, 3) - private.eggs_today(v_uid)));
end $$;

create or replace function public.inkborn_playdate_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); p public.inkborn_playdates%rowtype; c jsonb := private.pd_cfg();
  a public.inkborn%rowtype; b public.inkborn%rowtype; v_secs numeric; v_score int; v_ink int := 0; v_paid int := 0; v_tip int := 0;
  v_eggs boolean := false; v_why text; m1 jsonb; m2 jsonb; e1 public.inkborn_eggs%rowtype; e2 public.inkborn_eggs%rowtype;
  v_kinds text[] := array['speckled', 'swirl', 'starry', 'striped', 'glimmer', 'cosmic']; k1 int; k2 int;
  v_parents jsonb; v_hatch timestamptz;
begin
  select * into p from public.inkborn_playdates where id = p_session for update;
  if not found or p.guest_id <> v_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if p.finished_at is not null then return jsonb_build_object('score', p.score, 'paid', p.ink, 'repeat', true); end if;
  v_secs := extract(epoch from (now() - p.started_at));
  if v_secs < coalesce((c ->> 'seconds')::int, 45) * 0.85 then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((c ->> 'max_score')::int, 140)));
  select * into a from public.inkborn where id = p.guest_inkborn;
  select * into b from public.inkborn where id = p.host_inkborn;
  if v_secs <= 1800 then
    v_ink := least(coalesce((c ->> 'max_ink')::int, 20), floor(v_score / greatest(1, coalesce((c ->> 'points_per_ink')::numeric, 6))))::int;
    v_paid := private.inkborn_pay(v_uid, v_ink, 'playdate', p.id::text, 'playdate:' || p.id);
    if v_score > 0 then v_tip := private.inkborn_pay(p.host_id, coalesce((c ->> 'host_tip')::int, 4), 'playdate_host', p.id::text, 'playdate-host:' || p.id); end if;
  end if;
  if v_score > 0 then update public.inkborn set bond = bond + 2, updated_at = now() where id in (p.guest_inkborn, p.host_inkborn); end if;
  -- eggs: a great round, eggs left today, and these two haven't had eggs together lately
  if v_score < coalesce((c ->> 'egg_score')::int, 45) then v_why := 'score';
  elsif private.eggs_today(v_uid) >= coalesce((c ->> 'eggs_per_day')::int, 3) then v_why := 'daily';
  elsif exists (select 1 from public.inkborn_playdates where eggs and finished_at > now() - make_interval(hours => coalesce((c ->> 'pair_cooldown_hours')::int, 20))
                 and ((guest_inkborn = p.guest_inkborn and host_inkborn = p.host_inkborn) or (guest_inkborn = p.host_inkborn and host_inkborn = p.guest_inkborn))) then v_why := 'pair';
  elsif a.id is null or b.id is null then v_why := 'gone';
  else
    v_eggs := true;
    v_hatch := now() + make_interval(mins => coalesce((c ->> 'hatch_minutes')::int, 60));
    v_parents := jsonb_build_array(
      jsonb_build_object('name', a.name, 'owner', (select username from public.profiles where id = a.owner_id), 'genome', a.genome),
      jsonb_build_object('name', b.name, 'owner', (select username from public.profiles where id = b.owner_id), 'genome', b.genome));
    -- one egg each, and never the same kind: yours leans on your creature, theirs on theirs
    k1 := 1 + floor(random() * 6)::int; k2 := 1 + ((k1 + floor(random() * 5)::int) % 6);
    m1 := private.mix_genome(a.genome, b.genome, coalesce((c ->> 'mutation')::numeric, 0.18));
    m2 := private.mix_genome(b.genome, a.genome, coalesce((c ->> 'mutation')::numeric, 0.18));
    insert into public.inkborn_eggs (owner_id, playdate_id, kind, shell, genome, parents, mutated, hatch_at)
    values (v_uid, p.id, v_kinds[k1], jsonb_build_object('a', a.genome ->> 'color', 'b', b.genome ->> 'color', 'c', a.genome ->> 'accent'), m1 -> 'genome', v_parents, (m1 ->> 'mutated')::boolean, v_hatch)
    returning * into e1;
    -- the other keeper only gets one if they haven't had their 3 today
    if private.eggs_today(p.host_id) < coalesce((c ->> 'eggs_per_day')::int, 3) then
    insert into public.inkborn_eggs (owner_id, playdate_id, kind, shell, genome, parents, mutated, hatch_at)
    values (p.host_id, p.id, v_kinds[k2], jsonb_build_object('a', b.genome ->> 'color', 'b', a.genome ->> 'color', 'c', b.genome ->> 'accent'), m2 -> 'genome', v_parents, (m2 ->> 'mutated')::boolean, v_hatch)
    returning * into e2;
    end if;
  end if;
  update public.inkborn_playdates set finished_at = now(), score = v_score, ink = v_paid, eggs = v_eggs where id = p.id;
  if v_score > 0 then
    perform private.notify(p.host_id, 'playdate', v_uid, jsonb_build_object('mine', b.name, 'theirs', a.name, 'habitat', b.habitat_id, 'score', v_score,
      'tip', v_tip, 'egg', e2.id is not null));
  end if;
  if v_score > 0 and not exists (select 1 from public.feed_events where kind = 'playdate' and player_id = v_uid and created_at > now() - interval '20 minutes') then
    insert into public.feed_events (kind, player_id, data) values ('playdate', v_uid, jsonb_build_object('mine', a.name, 'theirs', b.name, 'host', (select username from public.profiles where id = p.host_id),
      'habitat', b.habitat_id, 'eggs', v_eggs, 'score', v_score));
  end if;
  return jsonb_build_object('score', v_score, 'earned', v_ink, 'paid', v_paid, 'capped', v_paid < v_ink, 'host_tip', v_tip, 'balances', private.balances(v_uid),
    'egg', case when v_eggs then private.egg_json(e1) else null end,
    'their_egg', case when e2.id is not null then jsonb_build_object('kind', e2.kind) else null end, 'eggs_left', greatest(0, coalesce((c ->> 'eggs_per_day')::int, 3) - private.eggs_today(v_uid)),
    'no_egg_because', v_why);
end $$;

do $$
declare f text;
begin
  execute 'revoke all on function private.eggs_today(uuid) from public';
  foreach f in array array['public.sanctuary_visit_ping(uuid)', 'public.planet_base_visit_ping(text, int, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
