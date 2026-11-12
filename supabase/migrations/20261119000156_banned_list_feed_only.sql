-- Ban notices: the live feed only (not the chat), plus a public Banned players list.
-- Notices get their own table, so the list stays complete however long ago it happened. Existing chat notices move over
-- and leave the chat.

create table if not exists public.moderation_notices (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  action text not null check (action in ('ban', 'suspend')),
  until timestamptz, summary text not null, created_at timestamptz not null default now(), removed_at timestamptz);
create index if not exists moderation_notices_recent on public.moderation_notices (created_at desc) where removed_at is null;
create index if not exists moderation_notices_player on public.moderation_notices (player_id);
alter table public.moderation_notices enable row level security;
revoke all on public.moderation_notices from anon, authenticated;

/** post a ban/suspension notice to the live feed (and the Banned list); returns the notice id */
create or replace function private.announce_restriction(p_player uuid, p_status text, p_until timestamptz, p_reason text, p_text text default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text := coalesce((select '@' || username from public.profiles where id = p_player), 'A player'); v_text text; v_id bigint; v_reason text;
  v_action text := case when p_status = 'banned' then 'ban' else 'suspend' end;
begin
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason in ('Banned by the operator', 'Suspended by the operator') then v_reason := null; end if;
  v_text := coalesce(nullif(trim(coalesce(p_text, '')), ''),
    '{name} was ' || case when p_status = 'banned' then 'banned' else 'suspended' || coalesce(' until ' || to_char(p_until at time zone 'UTC', 'Mon DD'), '') end
    || coalesce(' for: ' || left(v_reason, 180), ' for breaking the rules') || case when right(coalesce(v_reason, 'x'), 1) in ('.', '!', '?') then '' else '.' end);
  v_text := left(replace(v_text, '{name}', v_name), 300);
  -- one live notice per player: a new one replaces the last
  update public.moderation_notices set removed_at = now() where player_id = p_player and removed_at is null;
  delete from public.feed_events where player_id = p_player and kind = 'moderation';
  insert into public.moderation_notices (player_id, action, until, summary) values (p_player, v_action, p_until, v_text) returning id into v_id;
  insert into public.feed_events (kind, player_id, data)
  values ('moderation', p_player, jsonb_build_object('action', v_action, 'until', p_until, 'summary', v_text, 'notice_id', v_id));
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
    -- lifted by an admin: take the notice down (a suspension that simply runs out keeps its history)
    update public.moderation_notices set removed_at = now() where player_id = new.id and removed_at is null;
    delete from public.feed_events where player_id = new.id and kind = 'moderation';
  end if;
  return null;
end $$;

-- move the chat notices over, then out of the chat
do $$
declare c record; v_id bigint;
begin
  for c in select * from public.chat_messages where kind = 'moderation' order by id loop
    if c.deleted_at is null then
      insert into public.moderation_notices (player_id, action, until, summary, created_at)
      values (c.player_id, coalesce(c.data ->> 'action', 'ban'), nullif(c.data ->> 'until', '')::timestamptz, c.body, c.created_at) returning id into v_id;
      update public.feed_events set data = data || jsonb_build_object('notice_id', v_id) where kind = 'moderation' and data ->> 'chat_id' = c.id::text;
      update public.integrity_actions set chat_id = v_id where chat_id = c.id;
    end if;
  end loop;
  delete from public.chat_messages where kind = 'moderation';
end $$;

-- the chat is for chatting
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
              and c.kind = 'chat' and private.visible_to(c.player_id, v_uid)
            order by c.id desc limit least(greatest(coalesce(p_limit, 60), 1), 200)) m), '[]'::jsonb),
    'muted_until', (select case when chat_muted_until > now() then chat_muted_until end from public.players where id = v_uid),
    'enabled', private.flag('global_chat'));
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
  if a.chat_id is not null then  -- (chat_id now holds the notice's id)
    update public.moderation_notices set removed_at = now() where id = a.chat_id and removed_at is null;
    delete from public.feed_events where kind = 'moderation' and data ->> 'notice_id' = a.chat_id::text;
  end if;
  perform private.audit('integrity.undo', 'player', a.player_id::text, jsonb_build_object('action', a.id, 'ink_returned', v_back));
  return jsonb_build_object('ink_returned', v_back);
end $$;




/** the Banned players list: players restricted right now, newest first, with the public summary (searchable) */
create or replace function public.banned_players(p_q text default null, p_limit int default 50, p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := lower(trim(coalesce(p_q, '')));
begin
  return jsonb_build_object(
    'total', (select count(*) from public.moderation_notices n join public.players pl on pl.id = n.player_id
              where n.removed_at is null and (pl.status = 'banned' or (pl.status = 'suspended' and coalesce(pl.suspended_until, 'infinity') > now()))),
    'rows', coalesce((select jsonb_agg(x order by (x ->> 'at')::timestamptz desc) from (
      select jsonb_build_object('player', private.profile_json(n.player_id), 'action', n.action,
               'until', case when pl.status = 'suspended' then pl.suspended_until end, 'summary', n.summary, 'at', n.created_at) x
      from public.moderation_notices n join public.players pl on pl.id = n.player_id join public.profiles pr on pr.id = n.player_id
      where n.removed_at is null and (pl.status = 'banned' or (pl.status = 'suspended' and coalesce(pl.suspended_until, 'infinity') > now()))
        and (v_q = '' or lower(pr.username) like '%' || v_q || '%' or lower(coalesce(pr.display_name, '')) like '%' || v_q || '%')
        and (p_before is null or n.created_at < p_before)
      order by n.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) t), '[]'::jsonb));
end $$;

revoke all on function public.banned_players(text, integer, timestamp with time zone) from public;
grant execute on function public.banned_players(text, integer, timestamp with time zone) to anon, authenticated;
revoke all on function private.announce_restriction(uuid, text, timestamp with time zone, text, text) from public, anon, authenticated;
revoke all on function public.admin_integrity_undo(bigint) from public, anon;
grant execute on function public.admin_integrity_undo(bigint) to authenticated;
