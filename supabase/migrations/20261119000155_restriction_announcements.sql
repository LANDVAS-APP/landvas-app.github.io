-- Ban and suspension announcements, wired for every path. Any change of a player's status to suspended or banned — from
-- Admin → Integrity, Admin → Players, or anywhere else — now posts a red notice to the live chat and the live feed for
-- everyone: the admin's own summary when they wrote one, otherwise a default made from the reason. Leaving the summary
-- empty in the Integrity panel posts nothing. Lifting a ban by hand (or undoing the action) takes the notices down.
-- Players restricted in the last 3 days without a notice get one now.

alter table public.feed_events drop constraint if exists feed_events_kind_check;
alter table public.feed_events add constraint feed_events_kind_check
  check (kind in ('join', 'claim', 'publish', 'achievement', 'referral', 'level', 'minigame', 'pvp', 'challenge', 'featured', 'sketch', 'duet', 'stamp',
                  'planet_plot', 'settle', 'exploring', 'playdate', 'dig', 'base', 'core', 'harvest', 'ipo', 'arcade',
                  'luck', 'crown', 'flight', 'estate', 'moderation'));

/** post a ban/suspension notice to the live chat and the live feed; returns the chat message id */
create or replace function private.announce_restriction(p_player uuid, p_status text, p_until timestamptz, p_reason text, p_text text default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text := coalesce((select '@' || username from public.profiles where id = p_player), 'A player'); v_text text; v_id bigint; v_reason text;
begin
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason in ('Banned by the operator', 'Suspended by the operator') then v_reason := null; end if;
  v_text := coalesce(nullif(trim(coalesce(p_text, '')), ''),
    '{name} was ' || case when p_status = 'banned' then 'banned' else 'suspended' || coalesce(' until ' || to_char(p_until at time zone 'UTC', 'Mon DD'), '') end
    || coalesce(' for: ' || left(v_reason, 180), ' for breaking the rules') || case when right(coalesce(v_reason, 'x'), 1) in ('.', '!', '?') then '' else '.' end);
  v_text := left(replace(v_text, '{name}', v_name), 300);
  insert into public.chat_messages (player_id, body, kind, data)
  values (p_player, v_text, 'moderation', jsonb_build_object('action', case when p_status = 'banned' then 'ban' else 'suspend' end, 'until', p_until))
  returning id into v_id;
  insert into public.feed_events (kind, player_id, data)
  values ('moderation', p_player, jsonb_build_object('action', case when p_status = 'banned' then 'ban' else 'suspend' end, 'until', p_until, 'summary', v_text, 'chat_id', v_id));
  return v_id;
end $$;

create or replace function private.players_restriction_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_set text := current_setting('landvas.announce', true); v_id bigint;
begin
  if new.status in ('suspended', 'banned') and (old.status is distinct from new.status or (new.status = 'suspended' and old.suspended_until is distinct from new.suspended_until)) then
    if coalesce(v_set, '') <> '-' then
      v_id := private.announce_restriction(new.id, new.status, new.suspended_until, new.suspension_reason, nullif(v_set, ''));
      perform set_config('landvas.announce_id', v_id::text, true);
    end if;
  elsif new.status = 'active' and old.status in ('suspended', 'banned') and current_setting('landvas.lift', true) = '1' then
    -- lifted by an admin: take the notices down (a suspension that simply runs out keeps its history)
    update public.chat_messages set deleted_at = now() where player_id = new.id and kind = 'moderation' and deleted_at is null;
    delete from public.feed_events where player_id = new.id and kind = 'moderation';
  end if;
  return null;
end $$;
drop trigger if exists players_restriction_announce on public.players;
create trigger players_restriction_announce after update of status, suspended_until on public.players for each row execute function private.players_restriction_trg();

drop function if exists public.admin_set_player_status(uuid, text, timestamp with time zone, text);
create or replace function public.admin_set_player_status(p_player_id uuid, p_status text, p_until timestamptz default null, p_reason text default null, p_announce text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_admin(array['moderator']);
begin
  if p_status not in ('active', 'suspended', 'banned') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  if p_player_id = v_uid then raise exception 'cannot_moderate_self' using errcode = 'P0001'; end if;
  if private.has_role(p_player_id, array['owner']) and not private.has_role(v_uid, array['owner']) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  -- a ban or suspension announces itself (p_announce: the summary to post; '' posts nothing; null posts the default)
  perform set_config('landvas.announce', case when p_announce is null then '' when trim(p_announce) = '' then '-' else trim(p_announce) end, true);
  if p_status = 'active' then perform set_config('landvas.lift', '1', true); end if;
  update public.players
     set status = p_status,
         suspended_until = case when p_status = 'suspended' then p_until end,
         suspension_reason = case when p_status = 'active' then null else p_reason end
   where id = p_player_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.audit('player.set_status', 'player', p_player_id::text,
                        jsonb_build_object('status', p_status, 'until', p_until, 'reason', p_reason));
  return public.admin_player_detail(p_player_id);
end $$;

create or replace function public.feed_recent(p_after_id bigint default null, p_before_id bigint default null, p_limit int default 40) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'created_at', e.created_at,
                                        'data', case when e.kind = 'exploring' then e.data || private.room_json(e.player_id, e.data ->> 'world') else e.data end,
                                        'player', private.profile_json(e.player_id)) order by e.id desc)
    from (select f.* from public.feed_events f join public.profiles pr on pr.id = f.player_id
          where (p_after_id is null or f.id > p_after_id) and (p_before_id is null or f.id < p_before_id)
            and (f.kind = 'moderation' or (private.visible_to(f.player_id, v_uid) and private.feed_shown(pr.privacy, f.kind, f.data)))
            and (f.kind <> 'publish' or exists (select 1 from public.artwork_publications a
                                                where a.id = (f.data ->> 'publication_id')::uuid and a.status = 'published'))
          order by f.id desc limit least(greatest(coalesce(p_limit, 40), 1), 100)) e), '[]'::jsonb);
end $$;

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
    -- the status change announces itself (live chat + live feed) with the admin's summary, or not at all if they left it empty
    perform set_config('landvas.announce', coalesce(nullif(trim(coalesce(p_announce, '')), ''), '-'), true);
    perform set_config('landvas.announce_id', '', true);
    if p_kind in ('suspend', 'ban') then
      update public.players set status = case p_kind when 'ban' then 'banned' else 'suspended' end, suspended_until = case when p_kind = 'suspend' then p_until end,
             suspension_reason = left(p_reason, 1000), strikes = strikes + 1 where id = p;
    end if;
    v_chat := nullif(current_setting('landvas.announce_id', true), '')::bigint;
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
  if a.chat_id is not null then
    update public.chat_messages set deleted_at = now(), deleted_by = v_uid where id = a.chat_id;
    delete from public.feed_events where kind = 'moderation' and data ->> 'chat_id' = a.chat_id::text;
  end if;
  perform private.audit('integrity.undo', 'player', a.player_id::text, jsonb_build_object('action', a.id, 'ink_returned', v_back));
  return jsonb_build_object('ink_returned', v_back);
end $$;



-- notices for players restricted in the last 3 days who never got one
do $$
declare r record; v_id bigint;
begin
  for r in select p.id, p.status, p.suspended_until, p.suspension_reason from public.players p
           where p.status in ('suspended', 'banned')
             and not exists (select 1 from public.chat_messages c where c.player_id = p.id and c.kind = 'moderation')
             and exists (select 1 from public.audit_logs a where a.target_type = 'player' and a.target_id = p.id::text
                          and a.action in ('player.set_status', 'integrity.ban', 'integrity.suspend') and a.created_at > now() - interval '3 days') loop
    v_id := private.announce_restriction(r.id, r.status, r.suspended_until, r.suspension_reason,
              (select nullif(a.reason, '') from public.integrity_actions a where a.player_id = r.id and a.undone_at is null and a.kind in ('ban', 'suspend') order by a.created_at desc limit 1));
    update public.integrity_actions set chat_id = v_id where id = (select id from public.integrity_actions where player_id = r.id and undone_at is null order by created_at desc limit 1) and chat_id is null;
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_set_player_status(uuid, text, timestamp with time zone, text, text)', 'public.admin_integrity_act(uuid[], text, timestamp with time zone, text, text, jsonb, jsonb, text)', 'public.admin_integrity_undo(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.announce_restriction(uuid, text, timestamp with time zone, text, text)', 'private.players_restriction_trg()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
