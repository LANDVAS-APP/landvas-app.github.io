-- Real push notifications for the iOS / Android apps (APNs and Firebase Cloud Messaging).
--
-- Until now the apps had local notifications (timers the phone is told about ahead of time) and the "look again" hints
-- (20261119000106), which only reach a phone that has LANDVAS open. This sends real pushes that reach a closed phone,
-- for the moments that matter: a fox at your egg, the Leviathan heading for you, a friend request or a party invite,
-- something happening on your land.
--
--   • private.push_devices  each phone's push address (APNs device token / FCM registration token), whose it is, and
--                           which kinds of push the player switched on for it. Written only by push_register /
--                           push_unregister (the app), read only by the sender.
--   • private.push_outbox   pushes waiting to go. Bell alerts of the push-worthy kinds are copied in by a trigger on
--                           player_notifications, so every feature that already writes an alert pushes too, unchanged.
--                           The fox has no alert (its visits are worked out, never stored): private.push_tick() looks
--                           for lurking foxes every minute, only on geese of players who asked for fox pushes.
--   • the sender            the "push" Edge Function (supabase/functions-src/push.ts) claims due rows (svc_push_claim),
--                           sends them and reports back (svc_push_done: dead addresses are dropped). The database wakes
--                           it through pg_net when something is queued; the minute cron catches anything left.
-- Nothing is queued for a player with no phone registered: the trigger's first check is one index probe.
-- Live control: game_config 'phone_push' (on/off, per platform, daily cap per player, cooldown per kind of alert).

insert into public.game_config (key, value, description) values ('phone_push',
  '{"on": true, "ios": true, "android": true, "daily_cap": 30, "cooldown_s": 600}'::jsonb,
  'Push notifications to the apps: on, per platform, most pushes per player per day, and the shortest gap between two pushes for the same kind of alert from the same player.')
on conflict (key) do nothing;

create table if not exists private.push_devices (
  token text primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  kinds text[] not null default '{}',
  apns_env text not null default 'production' check (apns_env in ('production', 'sandbox')),
  app text check (char_length(app) <= 60),
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create index if not exists push_devices_player on private.push_devices (player_id);

create table if not exists private.push_outbox (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null,                 -- the switch it belongs to: fox, leviathan, friends, land, visits (or test)
  title text, body text, to_path text, -- written here, or made by the sender from the alert (src/shared/pushText.ts)
  alert jsonb,                        -- the bell alert it came from: { kind, sub, data, actor }
  dedupe text,                        -- one push per key per player
  check_args jsonb,                   -- still true when it's sent? (a fox: still at that egg)
  send_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  sent int,
  result text,
  created_at timestamptz not null default now()
);
create unique index if not exists push_outbox_dedupe on private.push_outbox (player_id, dedupe) where dedupe is not null;
create index if not exists push_outbox_due on private.push_outbox (send_at) where sent_at is null;
create index if not exists push_outbox_sent on private.push_outbox (player_id, sent_at) where result = 'sent';

-- who may wake the sender and claim pushes: a random key only the database knows (the sender passes on what it was
-- called with, and svc_push_claim checks it), plus when it was last woken
create table if not exists private.push_hook (
  id int primary key default 1 check (id = 1),
  key text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  kicked_at timestamptz not null default '-infinity'
);
insert into private.push_hook default values on conflict do nothing;

revoke all on private.push_devices, private.push_outbox, private.push_hook from public;
do $$ begin
  execute 'revoke all on private.push_devices, private.push_outbox, private.push_hook from anon, authenticated';
exception when undefined_object then null; end $$;

/** the push switches, and which are on until the player changes them */
create or replace function private.push_kinds_all() returns text[] language sql immutable as $$ select array['fox', 'leviathan', 'friends', 'land', 'visits'] $$;
create or replace function private.push_kinds_default() returns text[] language sql immutable as $$ select array['fox', 'leviathan', 'friends', 'land'] $$;

/** which switch a bell alert belongs to (null: it never pushes) */
create or replace function private.push_category(p_kind text, p_sub text) returns text language sql immutable as $$
  select case
    when p_kind = 'leviathan' then case when p_sub in ('warning', 'coming', 'trampled', 'fallen', 'escaped', 'blocked') then 'leviathan' end
    when p_kind in ('friend_request', 'friend_accept', 'party_invite', 'party_join', 'chat_reply', 'meet_wave', 'duet', 'playdate') then 'friends'
    when p_kind = 'enchant' then case
      when p_sub in ('splice_invite', 'splice_accepted') then 'friends'
      when p_sub in ('parasite_attached', 'symbiote_attached', 'size_prank', 'treasure_piece', 'puppet_auto', 'far_sighted', 'sun_nova',
                     'wish_gift', 'spore_landed', 'prophecy_true_you', 'mirror_seen', 'ascended', 'glyph_found') then 'land' end
    when p_kind = 'power' then case when p_sub in ('erupted', 'whisper', 'hatched', 'midas', 'gift', 'decree', 'stars', 'genesis', 'ticket', 'pollinated') then 'land' end
    when p_kind = 'star' then case when p_sub in ('cut', 'painted', 'art_ok', 'art_no', 'toll', 'supernova') then 'land' end
    when p_kind in ('potd', 'ultra_set', 'core') then 'land'
    when p_kind = 'gallery' then case when p_sub in ('loan_request', 'loan_yes', 'exhibition') then 'friends' end
    when p_kind in ('visit', 'checkin', 'note', 'sanctuary_visit', 'base_visit', 'warp', 'neighbor', 'stamp', 'inspire', 'sketch_vote') then 'visits'
  end
$$;

/** wake the sender (at most once per transaction and every few seconds; the minute cron catches anything after that) */
create or replace function private.push_kick(p_force boolean default false) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare c jsonb; v_key text;
begin
  if coalesce(current_setting('landvas.push_kicked', true), '') = '1' then return; end if;
  c := private.cfg('push');
  if c is null or coalesce(c ->> 'url', '') = '' then return; end if;
  if not coalesce((private.cfg('phone_push') ->> 'on')::boolean, true) then return; end if;
  if to_regnamespace('net') is null then return; end if; -- no pg_net (local builds): the minute cron's own call is all there is
  update private.push_hook h set kicked_at = now()
    where h.id = (select id from private.push_hook where id = 1 and (p_force or kicked_at < now() - interval '3 seconds') for update skip locked)
    returning h.key into v_key;
  if v_key is null then return; end if;
  perform set_config('landvas.push_kicked', '1', true);
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
      using (c ->> 'url') || '/functions/v1/push', '{}'::jsonb,
            jsonb_build_object('Content-Type', 'application/json', 'x-landvas-push', v_key, 'apikey', c ->> 'key', 'Authorization', 'Bearer ' || (c ->> 'key'));
  exception when others then
    null; -- a push is never worth breaking what caused it
  end;
end $$;

-- ==== the app: this phone's push address ===========================================================================

/** register (or refresh) this phone's push address for the signed-in player, with the switches they have on */
create or replace function public.push_register(p_token text, p_platform text, p_kinds jsonb default null, p_app text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_kinds text[];
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform private.rate_limit('push_register', 40, 3600);
  if p_platform not in ('ios', 'android') then raise exception 'bad_platform' using errcode = 'P0001'; end if;
  if p_token is null or not (case when p_platform = 'ios' then p_token ~ '^[0-9a-fA-F]{64,200}$' else p_token ~ '^[A-Za-z0-9_:.-]+$' and char_length(p_token) between 20 and 4096 end) then
    raise exception 'bad_token' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_kinds) = 'array' then
    v_kinds := array(select distinct k from jsonb_array_elements_text(p_kinds) k where k = any(private.push_kinds_all()) order by 1);
  end if;
  insert into private.push_devices as d (token, player_id, platform, kinds, app)
    values (p_token, v_uid, p_platform, coalesce(v_kinds, private.push_kinds_default()), left(p_app, 60))
    on conflict (token) do update set
      player_id = excluded.player_id, platform = excluded.platform, app = excluded.app, seen_at = now(),
      -- a phone that changes hands starts from the defaults; the same player keeps their switches unless they sent new ones
      kinds = coalesce(v_kinds, case when d.player_id = excluded.player_id then d.kinds else private.push_kinds_default() end),
      apns_env = case when d.player_id = excluded.player_id then d.apns_env else 'production' end
    returning kinds into v_kinds;
  -- a player's old addresses (reinstalls, old phones) don't pile up: the five they used last
  delete from private.push_devices where player_id = v_uid
    and token not in (select token from private.push_devices where player_id = v_uid order by seen_at desc limit 5);
  return jsonb_build_object('ok', true, 'kinds', to_jsonb(v_kinds), 'all', to_jsonb(private.push_kinds_all()));
end $$;

/** this phone stops getting pushes (notifications turned off, or signed out) */
create or replace function public.push_unregister(p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null then return jsonb_build_object('ok', true, 'removed', 0); end if;
  delete from private.push_devices where token = p_token and player_id = v_uid;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'removed', n);
end $$;

/** a test push to every phone the player has registered (Settings → Notifications) */
create or replace function public.push_test() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform private.rate_limit('push_test', 6, 3600);
  select count(*) into n from private.push_devices where player_id = v_uid;
  if n = 0 then return jsonb_build_object('ok', false, 'devices', 0); end if;
  insert into private.push_outbox (player_id, kind, title, body, to_path)
    values (v_uid, 'test', '🔔 Pushes work!', 'This is how LANDVAS reaches you when the app is closed. Tap to come back.', '/settings');
  perform private.push_kick();
  return jsonb_build_object('ok', true, 'devices', n);
end $$;

revoke all on function public.push_register(text, text, jsonb, text), public.push_unregister(text), public.push_test() from public, anon;
grant execute on function public.push_register(text, text, jsonb, text), public.push_unregister(text), public.push_test() to authenticated;

-- ==== bell alerts → pushes =========================================================================================

create or replace function private.push_alert_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sub text; v_cat text; v_cfg jsonb; v_cool int; v_actor text;
begin
  -- the usual case, kept cheap (no savepoint): this player has no phone registered
  if not exists (select 1 from private.push_devices where player_id = new.player_id) then return null; end if;
  v_sub := new.data ->> 'sub';
  v_cat := private.push_category(new.kind, v_sub);
  if v_cat is null then return null; end if;
  if not exists (select 1 from private.push_devices where player_id = new.player_id and v_cat = any(kinds)) then return null; end if;
  begin
    v_cfg := coalesce(private.cfg('phone_push'), '{}'::jsonb);
    v_cool := greatest(coalesce((v_cfg ->> 'cooldown_s')::int, 600), 1);
    if new.actor_id is not null then select username into v_actor from public.profiles where id = new.actor_id; end if;
    insert into private.push_outbox (player_id, kind, alert, dedupe)
      values (new.player_id, v_cat,
              jsonb_build_object('kind', new.kind, 'sub', v_sub, 'data', new.data, 'actor', v_actor),
              -- the same kind of alert from the same player pushes once per cooldown (the bell still lists every one)
              concat_ws(':', new.kind, v_sub, new.actor_id, floor(extract(epoch from now()) / v_cool)::bigint))
      on conflict do nothing;
    perform private.push_kick();
  exception when others then
    null; -- never let a push stop the alert itself
  end;
  return null;
end $$;

drop trigger if exists push_alerts on public.player_notifications;
create trigger push_alerts after insert on public.player_notifications for each row execute function private.push_alert_trg();

-- ==== the minute beat: foxes, tidying, waking the sender ===========================================================

/** 🦊 a fox at the egg of a goose whose owner wants fox pushes (geese in a fresh order each minute, inside a time budget) */
create or replace function private.push_foxes(p_budget interval default interval '3 seconds') returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.enchantments; g jsonb; v_until timestamptz := clock_timestamp() + p_budget; v_min text := to_char(now(), 'YYYYMMDDHH24MI'); n int := 0;
begin
  for e in
    select en.* from public.enchantments en
    where en.kind = 'goose' and en.status = 'active'
      and en.owner_id in (select player_id from private.push_devices where 'fox' = any(kinds))
    order by md5(en.id::text || v_min)
  loop
    exit when clock_timestamp() > v_until;
    g := private.goose_eval(e, private.ench_now(e));
    if g ->> 'lurking' is not null then
      insert into private.push_outbox (player_id, kind, title, body, to_path, dedupe, check_args)
        values (e.owner_id, 'fox', '🦊 A fox is at your egg!',
                coalesce(e.nickname, 'Your Golden Goose') || '’s egg is in danger — chase the fox off before it takes a bite.',
                '/grimoire/' || e.id,
                concat_ws(':', 'fox', e.id, coalesce(e.state ->> 'eggs', '0'), g ->> 'lurking'),
                jsonb_build_object('fox', e.id, 'k', (g ->> 'lurking')::int))
        on conflict do nothing;
      if found then n := n + 1; end if;
    end if;
  end loop;
  return n;
end $$;

/** the minute beat: foxes, tidying, waking the sender for anything still waiting */
create or replace function private.push_tick() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform private.push_foxes();
  exception when others then
    raise notice 'push_foxes: %', sqlerrm; -- one bad goose mustn't stop the rest of the beat
  end;
  -- a few days of history is plenty; addresses not seen for three months are gone
  delete from private.push_outbox where id in (select id from private.push_outbox where created_at < now() - interval '3 days' limit 5000);
  delete from private.push_devices where token in (select token from private.push_devices where seen_at < now() - interval '90 days' limit 1000);
  if exists (select 1 from private.push_outbox where sent_at is null and send_at <= now()) then perform private.push_kick(true); end if;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'landvas-push';
      perform cron.schedule('landvas-push', '* * * * *', 'select private.push_tick()');
    exception when others then
      raise notice 'pg_cron not available here (%): pushes go when something wakes the sender', sqlerrm;
    end;
  end if;
end $$;

-- ==== the sender (service role only) ===============================================================================

/** due pushes, each with the phones it goes to; marks them taken (another sender skips them for two minutes) */
create or replace function public.svc_push_claim(p_key text, p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c jsonb := coalesce(private.cfg('phone_push'), '{}'::jsonb);
  v_cap int := coalesce((c ->> 'daily_cap')::int, 30);
  v_ios boolean := coalesce((c ->> 'ios')::boolean, true);
  v_android boolean := coalesce((c ->> 'android')::boolean, true);
  out jsonb := '[]'::jsonb; r private.push_outbox; e public.enchantments; v_dev jsonb; v_fox text;
begin
  if p_key is null or p_key is distinct from (select key from private.push_hook where id = 1) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not coalesce((c ->> 'on')::boolean, true) then return jsonb_build_object('off', true, 'items', '[]'::jsonb); end if;
  for r in
    select * from private.push_outbox
    where sent_at is null and send_at <= now() and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by send_at, id limit least(greatest(coalesce(p_limit, 200), 1), 500)
    for update skip locked
  loop
    if r.send_at < now() - interval '2 hours' then
      update private.push_outbox set sent_at = now(), result = 'expired' where id = r.id; continue;
    end if;
    if r.check_args ? 'fox' then
      select * into e from public.enchantments where id = (r.check_args ->> 'fox')::uuid and owner_id = r.player_id and status = 'active';
      v_fox := case when found then private.goose_eval(e, private.ench_now(e)) ->> 'lurking' end;
      if v_fox is distinct from (r.check_args ->> 'k') then
        update private.push_outbox set sent_at = now(), result = 'stale' where id = r.id; continue;
      end if;
    end if;
    if r.kind <> 'test' and (select count(*) from private.push_outbox where player_id = r.player_id and result = 'sent' and sent_at > now() - interval '1 day') >= v_cap then
      update private.push_outbox set sent_at = now(), result = 'capped' where id = r.id; continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('token', d.token, 'platform', d.platform, 'env', d.apns_env)), '[]'::jsonb) into v_dev
      from private.push_devices d
      where d.player_id = r.player_id and (r.kind = 'test' or r.kind = any(d.kinds))
        and ((d.platform = 'ios' and v_ios) or (d.platform = 'android' and v_android));
    if jsonb_array_length(v_dev) = 0 then
      update private.push_outbox set sent_at = now(), result = 'no_device' where id = r.id; continue;
    end if;
    update private.push_outbox set claimed_at = now() where id = r.id;
    out := out || jsonb_build_object('id', r.id, 'kind', r.kind, 'title', r.title, 'body', r.body, 'to', r.to_path, 'alert', r.alert, 'devices', v_dev);
  end loop;
  return jsonb_build_object('items', out);
end $$;

/** what happened: [{ id, sent, error?, dead: [tokens], sandbox: [tokens] }] */
create or replace function public.svc_push_done(p_key text, p_results jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare x jsonb; n int := 0;
begin
  if p_key is null or p_key is distinct from (select key from private.push_hook where id = 1) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    update private.push_outbox set sent_at = now(), sent = coalesce((x ->> 'sent')::int, 0),
      result = case when coalesce((x ->> 'sent')::int, 0) > 0 then 'sent' else left(coalesce(x ->> 'error', 'failed'), 80) end
      where id = (x ->> 'id')::bigint and sent_at is null;
    delete from private.push_devices where token in (select jsonb_array_elements_text(coalesce(x -> 'dead', '[]'::jsonb)));
    update private.push_devices set apns_env = 'sandbox' where token in (select jsonb_array_elements_text(coalesce(x -> 'sandbox', '[]'::jsonb)));
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'done', n);
end $$;

revoke all on function public.svc_push_claim(text, int), public.svc_push_done(text, jsonb) from public, anon, authenticated;
grant execute on function public.svc_push_claim(text, int), public.svc_push_done(text, jsonb) to service_role;
