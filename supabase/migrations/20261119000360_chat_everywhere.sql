-- Chat everywhere people walk about together, with what they say popping up over their heads:
--  * the arcade's room chat now keeps the two sides of the glass apart (the front hall and the Mirror Arcade each have
--    their own rooms, so the mirror gets a chat of its own), and
--  * the Live Arena gets a room chat (everyone in your arena room).
-- Same rules as every room chat: the word filter, no links, mutes, the global chat switch, blocks both ways, a few days kept.

-- ===== the arcade: front and mirror have their own rooms ===============================================================
alter table public.arcade_chat add column if not exists side text not null default 'front';
alter table public.arcade_chat drop constraint if exists arcade_chat_side_check;
alter table public.arcade_chat add constraint arcade_chat_side_check check (side in ('front', 'mirror'));
create index if not exists arcade_chat_side_room_idx on public.arcade_chat (arcade_id, side, shard, id desc);

/** which side of the glass you're on in this arcade (null if you're not there right now) */
create or replace function private.arcade_side(p_uid uuid, p_arcade uuid) returns text language sql stable as $$
  select side from public.arcade_presence where player_id = p_uid and arcade_id = p_arcade
     and seen_at > now() - make_interval(secs => coalesce((private.cfg('arcade') -> 'live' ->> 'stale_seconds')::int, 12))
$$;
/** a room's nudge topic (the front's stays as it was) */
create or replace function private.arcade_chat_topic(p_arcade uuid, p_side text, p_shard int) returns text language sql immutable as $$
  select 'ac:' || p_arcade || ':' || case when p_side = 'mirror' then 'm' else '' end || p_shard
$$;

select private.fn_patch('public.arcade_chat_send(uuid,text)',
  $a$v_shard int := private.arcade_room(v_uid, p_arcade);$a$,
  $b$v_shard int := private.arcade_room(v_uid, p_arcade); v_side text := coalesce(private.arcade_side(v_uid, p_arcade), 'front');$b$);
select private.fn_patch('public.arcade_chat_send(uuid,text)',
  $a$insert into public.arcade_chat (arcade_id, shard, player_id, body) values (p_arcade, v_shard, v_uid, v_body) returning * into r;$a$,
  $b$insert into public.arcade_chat (arcade_id, shard, side, player_id, body) values (p_arcade, v_shard, v_side, v_uid, v_body) returning * into r;$b$);

select private.fn_patch('public.arcade_chat_list(uuid,bigint)',
  $a$v_shard int := private.arcade_room(v_uid, p_arcade);$a$,
  $b$v_shard int := private.arcade_room(v_uid, p_arcade); v_side text := coalesce(private.arcade_side(v_uid, p_arcade), 'front');$b$);
select private.fn_patch('public.arcade_chat_list(uuid,bigint)',
  $a$'topic', 'ac:' || p_arcade || ':' || v_shard,$a$,
  $b$'topic', private.arcade_chat_topic(p_arcade, v_side, v_shard), 'side', v_side,$b$);
select private.fn_patch('public.arcade_chat_list(uuid,bigint)',
  $a$where c.arcade_id = p_arcade and c.shard = v_shard and c.id > coalesce(p_after, 0)$a$,
  $b$where c.arcade_id = p_arcade and c.shard = v_shard and c.side = v_side and c.id > coalesce(p_after, 0)$b$);

create or replace function private.push_arcade_chat_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push(array[private.arcade_chat_topic(new.arcade_id, new.side, new.shard)], 'chat');
  return null;
end $$;

-- ===== the Live Arena ====================================================================================================
create table if not exists public.arena_chat (
  id bigint generated always as identity primary key,
  shard int not null,
  player_id uuid not null references public.players (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists arena_chat_room_idx on public.arena_chat (shard, id desc);
create index if not exists arena_chat_player_idx on public.arena_chat (player_id);
alter table public.arena_chat enable row level security;
revoke all on public.arena_chat from anon, authenticated;

create or replace function private.arena_chat_json(m public.arena_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'kind', 'chat', 'player', private.profile_json(m.player_id))
$$;

create or replace function public.arena_chat_send(p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); me public.arena_presence; v_muted timestamptz; v_body text; r public.arena_chat%rowtype;
begin
  if not private.flag('global_chat') then raise exception 'chat_disabled' using errcode = 'P0001'; end if;
  me := private.arena_here(v_uid);
  if me.player_id is null then raise exception 'not_in_arcade' using errcode = 'P0001'; end if;
  select chat_muted_until into v_muted from public.players where id = v_uid;
  if v_muted is not null and v_muted > now() then raise exception 'chat_muted' using errcode = 'P0001', detail = v_muted::text; end if;
  perform private.rate_limit('arcade_chat_burst', 1, 1);
  perform private.rate_limit('arcade_chat', 20, 60);
  perform private.rate_limit('arcade_chat_hour', 400, 3600);
  v_body := private.chat_clean(p_body);
  if char_length(v_body) > 200 then raise exception 'chat_too_long' using errcode = 'P0001'; end if;
  insert into public.arena_chat (shard, player_id, body) values (me.shard, v_uid, v_body) returning * into r;
  delete from public.arena_chat where created_at < now() - make_interval(days => coalesce((private.party_cfg() ->> 'arcade_chat_days')::int, 2));
  return private.arena_chat_json(r);
end $$;

create or replace function public.arena_chat_list(p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); me public.arena_presence;
begin
  perform private.rate_limit('arcade_chat_list', 3000, 3600);
  me := private.arena_here(v_uid);
  if me.player_id is null then return jsonb_build_object('items', '[]'::jsonb, 'shard', null, 'topic', null); end if;
  return jsonb_build_object('shard', me.shard, 'topic', 'arena-chat:' || me.shard,
    'items', (select coalesce(jsonb_agg(private.arena_chat_json(c) order by c.id), '[]'::jsonb)
      from (select * from public.arena_chat c where c.shard = me.shard and c.id > coalesce(p_after, 0)
              and c.created_at > now() - interval '2 hours' and private.visible_to(c.player_id, v_uid) order by c.id desc limit 50) c));
end $$;

create or replace function private.push_arena_chat_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push(array['arena-chat:' || new.shard], 'chat');
  return null;
end $$;
drop trigger if exists arena_chat_push on public.arena_chat;
create trigger arena_chat_push after insert on public.arena_chat for each row execute function private.push_arena_chat_trg();

do $$ declare f text; begin
  foreach f in array array['private.arcade_side(uuid, uuid)', 'private.arcade_chat_topic(uuid, text, int)', 'private.arena_chat_json(public.arena_chat)', 'private.push_arena_chat_trg()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.arena_chat_send(text)', 'public.arena_chat_list(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
