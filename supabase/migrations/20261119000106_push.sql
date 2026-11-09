-- v0.7.3 Alerts arrive by push instead of every phone asking on a timer.
--
-- Every signed-in phone asked "anything new for me?" every minute or so, mostly to hear "no". Now, when something
-- lands in a player's alerts (a visit, a friend request, a support reply…) the database sends that player's phone a
-- tiny "look again" message over Realtime broadcast, and the phone asks once. New announcements do the same for
-- everyone. The message carries nothing but its kind; the phone still reads its alerts through the usual call.
--
-- Sending goes through pg_net (an HTTP request queued in an unlogged table and sent after the transaction commits)
-- to the Realtime broadcast API, using the project's public (publishable) key from game_config.push, which the
-- deploy fills in. Without pg_net or that setting (local builds, tests) nothing is sent and phones simply keep
-- asking now and then, as before.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
end $$;

-- each player's private topic: random, so nobody can listen in on when someone else gets an alert
alter table public.players add column if not exists push_token uuid not null default gen_random_uuid();

create or replace function public.my_push_topic() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select 'u:' || push_token from public.players where id = auth.uid()
$$;
revoke all on function public.my_push_topic() from public, anon;
grant execute on function public.my_push_topic() to authenticated;

/** Send "look again" to some topics (once per topic per transaction). */
create or replace function private.push(p_topics text[], p_kind text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  c jsonb := private.cfg('push');
  v_done text := coalesce(current_setting('landvas.pushed', true), '');
  v_new text[] := '{}';
  t text;
begin
  if c is null or coalesce(c ->> 'url', '') = '' or coalesce(c ->> 'key', '') = '' then return; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  foreach t in array coalesce(p_topics, '{}') loop
    if t is not null and position('|' || t || '|' in v_done) = 0 then v_new := v_new || t; v_done := v_done || '|' || t || '|'; end if;
  end loop;
  if cardinality(v_new) = 0 then return; end if;
  perform set_config('landvas.pushed', v_done, true);
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 3000)'
    using (c ->> 'url') || '/realtime/v1/api/broadcast',
          jsonb_build_object('messages', (select jsonb_agg(jsonb_build_object('topic', x, 'event', 'm', 'payload', jsonb_build_object('t', p_kind))) from unnest(v_new) x)),
          jsonb_build_object('Content-Type', 'application/json', 'apikey', c ->> 'key', 'Authorization', 'Bearer ' || (c ->> 'key'));
exception when others then
  -- a push is only a hint: never let it break the thing that caused it
  null;
end $$;

create or replace function private.push_player(p_player uuid, p_kind text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token uuid;
begin
  select push_token into v_token from public.players where id = p_player;
  if v_token is not null then perform private.push(array['u:' || v_token], p_kind); end if;
end $$;

-- alerts: the same rules as before, plus the push
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
  perform private.push_player(p_player, 'alerts');
end $$;

-- a reply from support: the player's phone looks again
create or replace function private.push_support_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.is_staff then perform private.push_player((select player_id from public.support_tickets where id = new.ticket_id), 'support'); end if;
  return null;
end $$;
drop trigger if exists support_messages_push on public.support_messages;
create trigger support_messages_push after insert on public.support_messages for each row execute function private.push_support_trg();

-- a new or changed announcement: everyone's phone looks again
create or replace function private.push_news_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push(array['news'], 'news');
  return null;
end $$;
drop trigger if exists announcements_push on public.announcements;
create trigger announcements_push after insert or update on public.announcements for each statement execute function private.push_news_trg();
