-- Chat for everyone in a home's room (up to 10): a chat box and speech bubbles over the explorers. Same word filter,
-- link ban, mutes and blocks as the other chats.
create table if not exists public.home_chat (
  id bigint generated always as identity primary key,
  home_id uuid not null references public.players (id) on delete cascade,
  shard int not null,
  player_id uuid not null references public.players (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 140),
  created_at timestamptz not null default now()
);
create index if not exists home_chat_room_idx on public.home_chat (home_id, shard, id desc);
alter table public.home_chat enable row level security;
revoke all on public.home_chat from anon, authenticated;

create or replace function private.home_chat_json(m public.home_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'player', private.profile_json(m.player_id))
$$;

create or replace function public.home_chat_send(p_home uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); pr public.home_presence%rowtype; v_muted timestamptz; v_body text; m public.home_chat%rowtype;
begin
  if not private.flag('global_chat') then raise exception 'chat_disabled' using errcode = 'P0001'; end if;
  select * into pr from public.home_presence where player_id = v_uid;
  if not found or pr.host_id <> p_home or pr.seen_at < now() - interval '30 seconds' then raise exception 'not_in_home' using errcode = 'P0001'; end if;
  select chat_muted_until into v_muted from public.players where id = v_uid;
  if v_muted is not null and v_muted > now() then raise exception 'chat_muted' using errcode = 'P0001', detail = v_muted::text; end if;
  perform private.rate_limit('home_chat_burst', 1, 1);
  perform private.rate_limit('home_chat', 20, 60);
  perform private.rate_limit('home_chat_hour', 400, 3600);
  v_body := private.chat_clean(p_body);
  if char_length(v_body) > 140 then raise exception 'chat_too_long' using errcode = 'P0001'; end if;
  insert into public.home_chat (home_id, shard, player_id, body) values (pr.host_id, pr.shard, v_uid, v_body) returning * into m;
  delete from public.home_chat where home_id = pr.host_id and created_at < now() - interval '1 day';
  return private.home_chat_json(m);
end $$;

create or replace function public.home_chat_list(p_home uuid, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); pr public.home_presence%rowtype;
begin
  select * into pr from public.home_presence where player_id = v_uid;
  if not found or pr.host_id <> p_home then return jsonb_build_object('items', '[]'::jsonb, 'shard', null); end if;
  return jsonb_build_object('shard', pr.shard, 'items', coalesce((
    select jsonb_agg(private.home_chat_json(m) order by m.id) from (
      select * from public.home_chat c
       where c.home_id = pr.host_id and c.shard = pr.shard and c.id > coalesce(p_after, 0) and c.created_at > now() - interval '30 minutes'
         and not exists (select 1 from public.player_blocks b where (b.blocker_id = v_uid and b.blocked_id = c.player_id) or (b.blocker_id = c.player_id and b.blocked_id = v_uid))
       order by c.id desc limit 40) m), '[]'::jsonb));
end $$;

do $$ declare f text; begin
  execute 'revoke all on function private.home_chat_json(public.home_chat) from public, anon, authenticated';
  foreach f in array array['public.home_chat_send(uuid, text)', 'public.home_chat_list(uuid, bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
