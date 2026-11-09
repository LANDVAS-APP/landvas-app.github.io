-- v0.7.4 Chat, the feed and meteor showers arrive by push instead of every phone asking every few seconds.
--
-- Planet, home and clan chat were each checked every 6-8 seconds by everyone in the group, the social feed every 8
-- seconds by everyone on that screen, and meteor showers every 6 seconds by everyone on a world, almost always to
-- hear "nothing new". Now the database sends a tiny "look again" to the place it happened (that planet group, that
-- room, that clan, the feed, that world's sky) and only the phones there ask, once. The phones still check now and
-- then as a safety net. The messages carry nothing but their kind, so anything shown still comes through the usual,
-- checked calls.

-- some topics (the feed, a world's meteors) can get many changes in a burst: nudge them at most once every few
-- seconds. The phone looks once more a moment after a nudge, so the last change of a burst is never missed.
create table if not exists private.push_gate (topic text primary key, at timestamptz not null default now());

create or replace function private.push_gated(p_topic text, p_kind text, p_gap interval) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into private.push_gate (topic, at) values (p_topic, now() - p_gap - interval '1 second') on conflict (topic) do nothing;
  -- never wait: if another change is nudging this topic right now, that nudge covers this one too
  perform 1 from private.push_gate where topic = p_topic and at < now() - p_gap for update skip locked;
  if not found then return; end if;
  update private.push_gate set at = now() where topic = p_topic;
  perform private.push(array[p_topic], p_kind);
exception when others then
  null; -- a push is only a hint
end $$;

-- ── chat ─────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.push_planet_chat_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push(array['pc:' || new.world || ':' || new.shard], 'chat');
  return null;
end $$;
drop trigger if exists planet_chat_push on public.planet_chat;
create trigger planet_chat_push after insert on public.planet_chat for each row execute function private.push_planet_chat_trg();

create or replace function private.push_home_chat_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push(array['hc:' || new.home_id || ':' || new.shard], 'chat');
  return null;
end $$;
drop trigger if exists home_chat_push on public.home_chat;
create trigger home_chat_push after insert on public.home_chat for each row execute function private.push_home_chat_trg();

create or replace function private.push_clan_chat_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push(array['cc:' || new.clan_id], 'chat');
  return null;
end $$;
drop trigger if exists clan_chat_push on public.clan_chat;
create trigger clan_chat_push after insert on public.clan_chat for each row execute function private.push_clan_chat_trg();

-- the clan chat list also says which clan, so the phone knows where to listen
create or replace function public.clan_chat_list(p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); m public.clan_members%rowtype;
begin
  perform private.rate_limit('clan_chat_list', 3000, 3600);
  select * into m from public.clan_members where player_id = v_uid;
  if not found then return jsonb_build_object('items', '[]'::jsonb, 'clan', null); end if;
  return jsonb_build_object('clan', m.clan_id, 'items', (select coalesce(jsonb_agg(private.clan_chat_json(c) order by c.id), '[]'::jsonb)
    from (select * from public.clan_chat c where c.clan_id = m.clan_id and c.id > coalesce(p_after, 0)
           and private.visible_to(c.player_id, v_uid) order by c.id desc limit 50) c));
end $$;

-- ── the social feed (everyone's, so at most one nudge every 5 seconds) ─────────────────────────────────────────
create or replace function private.push_feed_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push_gated('feed', 'feed', interval '5 seconds');
  return null;
end $$;
drop trigger if exists feed_events_push on public.feed_events;
create trigger feed_events_push after insert on public.feed_events for each statement execute function private.push_feed_trg();

-- ── meteor showers: someone grabbed one (a new shower starts on the clock, which phones already know) ─────────
create or replace function private.push_meteor_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.push_gated('pm:' || new.world, 'meteors', interval '2 seconds');
  return null;
end $$;
drop trigger if exists planet_meteors_push on public.planet_meteors;
create trigger planet_meteors_push after insert on public.planet_meteors for each row execute function private.push_meteor_trg();
