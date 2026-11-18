-- Global chat lines arrive with the push.
--
-- Every new global message used to nudge the shared 'global-chat' topic, and every open map answered by asking the
-- database for the chat list: one database call per message per player online, a load that grows with the square of
-- the players. Now the database also sends the line itself on 'global-chat:lines', a private channel: signed-in players
-- may listen (the policy below), nobody may post on it (there's no insert policy), so what arrives there can be shown
-- as is. Apps that know about it stop answering the nudges; older apps keep working on the nudge, which is still sent.
--
-- Only lines anyone may see go out (not from hidden or banned players; blocks are filtered by each app, as the list
-- does on the server for the asking player). Staff switching the global chat off stops them too.

create or replace function private.chat_line_send(p_topic text, m public.chat_messages)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return; end if;
  if not private.flag('global_chat') or not private.visible_to(m.player_id, null) then return; end if;
  execute 'select realtime.send($1, $2, $3, true)'
    using private.chat_json(m) || jsonb_build_object('at', m.created_at, 'kind', 'chat'), 'line', p_topic;
exception when others then
  null; -- a push is only a help: never let it break the message itself
end $$;
revoke all on function private.chat_line_send(text, public.chat_messages) from public, anon, authenticated;

create or replace function private.push_global_chat_trg()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.room = 'global' and new.kind = 'chat' then
    perform private.push(array['global-chat'], 'chat'); -- (apps from before this listen for the nudge)
    perform private.chat_line_send('global-chat:lines', new);
  end if;
  return null;
end $$;

-- who may listen on the lines channel: any signed-in player. (No insert policy: only the database sends there.)
do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute 'drop policy if exists "landvas: hear global chat lines" on realtime.messages';
    execute $p$create policy "landvas: hear global chat lines" on realtime.messages for select to authenticated
              using (realtime.topic() = 'global-chat:lines' and realtime.messages.extension = 'broadcast')$p$;
  end if;
end $$;
