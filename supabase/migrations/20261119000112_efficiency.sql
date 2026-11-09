-- v0.7.5 Less disk for the same game: fixes from the main server's own load report (Micro compute, Nov 2026).
--
-- 1. The daily sketch screen built up to 60 drawings (every stroke) and then sorted the finished JSON, which spilled
--    ~3 MB to disk on every look; it also re-checked every past day's prizes each time. Now the drawings are put in
--    order before any JSON is built, and only the last week is checked for unpaid prizes.
-- 2. Check-ins (planets, arcades, arenas, homes) rewrote their room index on every beat, because the index held the
--    "last seen" time. Without it the beat is a HOT update (just the row, no index writes); stale presence rows are
--    cleared out hourly instead, so the rooms stay small to scan.
-- 3. "Your minigame records" read every finished game you'd played; an index now answers it directly.
-- 4. Old one-off rows are tidied away: retry keys after a week, app error reports after 30 days.

-- ── 1. the daily sketch ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.sketch_sweep() returns void
language plpgsql as $$
declare d record; s record; k int; v_prizes jsonb := coalesce(private.creative('sketch') -> 'prizes', '[]'::jsonb); v_p int;
  v_today timestamptz := private.day_start(now());
begin
  -- only the last week can still be unpaid (anything older was paid the day after)
  for d in select distinct x.day from public.sketches x where x.day < v_today and x.day >= v_today - interval '7 days' and x.submitted_at is not null
             and not exists (select 1 from public.sketch_days sd where sd.day = x.day and sd.paid_at is not null) loop
    insert into public.sketch_days (day) values (d.day) on conflict do nothing;
    perform 1 from public.sketch_days where day = d.day and paid_at is null for update skip locked;
    if not found then continue; end if;
    k := 0;
    for s in select * from public.sketches where day = d.day and submitted_at is not null and votes > 0 order by votes desc, submitted_at limit jsonb_array_length(v_prizes) loop
      k := k + 1;
      v_p := greatest(coalesce((v_prizes ->> (k - 1))::int, 0), 0);
      update public.sketches set place = k, prize = v_p where id = s.id;
      if v_p > 0 then perform private.grant(s.player_id, jsonb_build_object('ink', v_p), 'sketch', 'sketch', s.id::text, 'sketch:' || s.id); end if;
      if k <= 3 then insert into public.feed_events (kind, player_id, data) values ('sketch', s.player_id, jsonb_build_object('word', s.word, 'place', k)); end if;
    end loop;
    update public.sketch_days set paid_at = now() where day = d.day;
  end loop;
end $$;

create or replace function public.sketch_today() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); c jsonb := private.creative('sketch'); v_day timestamptz := private.day_start(now()); me public.sketches%rowtype;
  v_entries jsonb := '[]'::jsonb; s public.sketches%rowtype;
begin
  perform private.sketch_sweep();
  select * into me from public.sketches where player_id = v_uid and day = v_day;
  -- today's latest 60, in this viewer's shuffled order: the order is settled on ids alone, then each drawing is
  -- added in turn (nothing heavy is ever sorted)
  for s in select x.* from (select id, md5(id::text || coalesce(v_uid::text, '')) k from public.sketches
                             where day = v_day and submitted_at is not null order by submitted_at desc limit 60) t
           join public.sketches x on x.id = t.id order by t.k loop
    v_entries := v_entries || jsonb_build_array(private.sketch_json(s, v_uid, false));
  end loop;
  return jsonb_build_object(
    'enabled', coalesce((c ->> 'enabled')::boolean, false), 'word', private.sketch_word(v_day), 'day', v_day,
    'ends_at', v_day + interval '1 day', 'minutes', coalesce((c ->> 'minutes')::numeric, 10), 'prizes', coalesce(c -> 'prizes', '[]'::jsonb),
    'votes_per_player', coalesce((c ->> 'votes_per_player')::int, 20),
    'votes_left', greatest(coalesce((c ->> 'votes_per_player')::int, 20) - (select count(*) from public.sketch_votes where voter_id = v_uid and day = v_day), 0),
    'mine', case when me.id is null then null else jsonb_build_object('id', me.id, 'started_at', me.started_at, 'submitted', me.submitted_at is not null,
              'deadline', me.started_at + make_interval(secs => coalesce((c ->> 'minutes')::numeric, 10) * 60), 'strokes', me.strokes, 'votes', me.votes) end,
    'entries', v_entries,
    'yesterday', (select coalesce(jsonb_agg(private.sketch_json(s2, v_uid, true) order by s2.place), '[]'::jsonb)
                  from public.sketches s2 where s2.day = v_day - interval '1 day' and s2.place is not null),
    'yesterday_word', private.sketch_word(v_day - interval '1 day'),
    'server_time', now());
end $$;

-- ── 2. check-ins without index writes ───────────────────────────────────────────────────────────────────────────
drop index if exists public.planet_presence_world_idx;
create index if not exists planet_presence_room_idx on public.planet_presence (world, shard);
drop index if exists public.arcade_presence_room_idx;
create index if not exists arcade_presence_room2_idx on public.arcade_presence (arcade_id, shard);
drop index if exists public.arena_presence_room_idx;
create index if not exists arena_presence_shard_idx on public.arena_presence (shard);
drop index if exists public.home_presence_room_idx;
create index if not exists home_presence_room2_idx on public.home_presence (host_id, shard);
-- room on each page for the updated row, so the beat stays on the same page (HOT)
alter table public.planet_presence set (fillfactor = 70);
alter table public.arcade_presence set (fillfactor = 70);
alter table public.arena_presence set (fillfactor = 70);
alter table public.home_presence set (fillfactor = 70);

-- ── 3. minigame records ─────────────────────────────────────────────────────────────────────────────────────────
create index if not exists minigame_sessions_bests_idx on public.minigame_sessions (player_id, game, level, score)
  where status = 'validated' and passed;

-- ── 4. tidying ──────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.tidy(p_daily boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_out jsonb := '{}'::jsonb; n int;
begin
  -- presence nobody has refreshed for an hour: they've left (a returning player just joins again)
  delete from public.planet_presence where seen_at < now() - interval '1 hour'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('planet_presence', n);
  delete from public.arcade_presence where seen_at < now() - interval '1 hour'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('arcade_presence', n);
  delete from public.arena_presence where seen_at < now() - interval '1 hour'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('arena_presence', n);
  delete from public.home_presence where seen_at < now() - interval '1 hour'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('home_presence', n);
  if p_daily then
    -- retry keys only matter for a request being sent twice in a row
    delete from private.idempotent_ops where created_at < now() - interval '7 days'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('idempotent_ops', n);
    delete from private.client_errors where created_at < now() - interval '30 days'; get diagnostics n = row_count; v_out := v_out || jsonb_build_object('client_errors', n);
  end if;
  return v_out;
end $$;
revoke all on function private.tidy(boolean) from public, anon, authenticated;

-- run it on a schedule where pg_cron can be turned on (Supabase); elsewhere (tests, local) it's simply not scheduled
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname in ('landvas-tidy-hourly', 'landvas-tidy-daily');
      perform cron.schedule('landvas-tidy-hourly', '7 * * * *', 'select private.tidy(false)');
      perform cron.schedule('landvas-tidy-daily', '23 10 * * *', 'select private.tidy(true)');
    exception when others then
      raise notice 'pg_cron not available here (%): tidying not scheduled', sqlerrm;
    end;
  end if;
end $$;
