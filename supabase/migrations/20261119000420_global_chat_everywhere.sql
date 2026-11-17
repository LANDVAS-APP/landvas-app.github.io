-- The global chat everywhere: every chat box in the game (the map, houses, arcades, clan halls, planets, the Party page)
-- has a Global tab first, beside your party's and the place's own. It's the same global chat as the Social page's:
-- sending is still send_chat_message (the global switch, mutes, the filter, rate limits), and it reads like the other
-- room chats: a list since the last message seen, and a nudge on one topic when someone says something.

/** the global chat since `p_after` (0: the last few), shaped like every room chat ({items, topic}) */
create or replace function public.global_chat_list(p_after bigint default 0) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.uid(); v_on boolean := private.flag('global_chat');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'items', case when not v_on then '[]'::jsonb else coalesce((
      select jsonb_agg(private.chat_json(m) || jsonb_build_object('at', m.created_at, 'kind', 'chat') order by m.id)
      from (select c.* from public.chat_messages c
            where c.room = 'global' and c.kind = 'chat' and c.deleted_at is null
              and c.id > coalesce(p_after, 0)
              and private.visible_to(c.player_id, v_uid)
            order by c.id desc limit case when coalesce(p_after, 0) > 0 then 60 else 30 end) m), '[]'::jsonb) end,
    'topic', 'global-chat',
    'enabled', v_on,
    'muted_until', (select case when chat_muted_until > now() then chat_muted_until end from public.players where id = v_uid));
end $$;

/** someone said something in the global chat: everyone listening looks again (the nudge carries nothing) */
create or replace function private.push_global_chat_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.room = 'global' and new.kind = 'chat' then perform private.push(array['global-chat'], 'chat'); end if;
  return null;
end $$;
drop trigger if exists chat_messages_global_push on public.chat_messages;
create trigger chat_messages_global_push after insert on public.chat_messages for each row execute function private.push_global_chat_trg();

do $$ begin
  revoke all on function public.global_chat_list(bigint) from public, anon;
  grant execute on function public.global_chat_list(bigint) to authenticated, service_role;
  revoke all on function private.push_global_chat_trg() from public, anon, authenticated;
end $$;
