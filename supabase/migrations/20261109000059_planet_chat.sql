-- v0.41 Group chat for the live groups of up to 10 on each world. You can only talk to the group you're
-- walking with; messages show in a chat box and as a speech bubble over the explorer. Same word filter,
-- link ban and mutes as the global chat; players you've blocked (or who blocked you) are hidden.

create table if not exists public.planet_chat (
  id bigint generated always as identity primary key,
  world text not null,
  shard int not null,
  player_id uuid not null references public.players (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 140),
  created_at timestamptz not null default now()
);
create index if not exists planet_chat_room_idx on public.planet_chat (world, shard, id desc);
alter table public.planet_chat enable row level security;
revoke all on public.planet_chat from anon, authenticated;

create or replace function private.planet_chat_json(m public.planet_chat) returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'player', private.profile_json(m.player_id))
$$;

/** Say something to your live group on this world. */
create or replace function public.planet_chat_send(p_world text, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); pr public.planet_presence%rowtype; v_muted timestamptz; v_body text; m public.planet_chat%rowtype;
begin
  if not private.flag('global_chat') then raise exception 'chat_disabled' using errcode = 'P0001'; end if;
  select * into pr from public.planet_presence where player_id = v_uid;
  if not found or pr.world <> p_world or pr.seen_at < now() - interval '30 seconds' then raise exception 'not_in_group' using errcode = 'P0001'; end if;
  select chat_muted_until into v_muted from public.players where id = v_uid;
  if v_muted is not null and v_muted > now() then raise exception 'chat_muted' using errcode = 'P0001', detail = v_muted::text; end if;
  perform private.rate_limit('planet_chat_burst', 1, 1);
  perform private.rate_limit('planet_chat', 20, 60);
  perform private.rate_limit('planet_chat_hour', 400, 3600);
  v_body := private.chat_clean(p_body);
  if char_length(v_body) > 140 then raise exception 'chat_too_long' using errcode = 'P0001'; end if;
  insert into public.planet_chat (world, shard, player_id, body) values (pr.world, pr.shard, v_uid, v_body) returning * into m;
  -- keep a day of chat
  delete from public.planet_chat where world = pr.world and shard = pr.shard and created_at < now() - interval '1 day';
  return private.planet_chat_json(m);
end $$;

/** What your live group has said (the last half hour, newer than p_after). */
create or replace function public.planet_chat_list(p_world text, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); pr public.planet_presence%rowtype;
begin
  select * into pr from public.planet_presence where player_id = v_uid;
  if not found or pr.world <> p_world then return jsonb_build_object('items', '[]'::jsonb, 'shard', null); end if;
  return jsonb_build_object('shard', pr.shard, 'items', coalesce((
    select jsonb_agg(private.planet_chat_json(m) order by m.id) from (
      select * from public.planet_chat c
       where c.world = pr.world and c.shard = pr.shard and c.id > coalesce(p_after, 0) and c.created_at > now() - interval '30 minutes'
         and not exists (select 1 from public.player_blocks b where (b.blocker_id = v_uid and b.blocked_id = c.player_id) or (b.blocker_id = c.player_id and b.blocked_id = v_uid))
       order by c.id desc limit 40) m), '[]'::jsonb));
end $$;

do $$
declare f text;
begin
  execute 'revoke all on function private.planet_chat_json(public.planet_chat) from public';
  foreach f in array array['public.planet_chat_send(text, text)', 'public.planet_chat_list(text, bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
