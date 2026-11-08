-- v0.7.1 Use far less disk (the free plan's Disk IO budget).
--
-- 1. Map updates no longer go through Realtime's database-change feed. That feed keeps a logical replication slot open
--    and decodes every change written anywhere in the database (rate-limit counters, presence, balances, …) about
--    once a second, just to spot the occasional new map tile — by far the biggest steady load on the temp server.
--    The app now checks for map updates itself (map_updates_since, which it already used to catch up).
-- 2. Short-lived bookkeeping that is rewritten on nearly every request — rate-limit counters and who is standing in an
--    arcade or on a planet right now — is kept in unlogged tables: no write-ahead log, so a fraction of the disk
--    writes. If the database ever restarts uncleanly these simply start empty again, which is harmless for them.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'map_updates') then
    execute 'alter publication supabase_realtime drop table public.map_updates';
  end if;
end $$;

alter table private.rate_limits set unlogged;
alter table public.arcade_presence set unlogged;
alter table public.planet_presence set unlogged;

-- old rate-limit windows are never read again: clear them out now and then (on about 1 in 500 checks)
create or replace function private.rate_limit(p_action text, p_max int, p_window_seconds int) returns void
language plpgsql as $$
declare
  v_uid uuid := auth.uid();
  v_override jsonb := private.cfg('rate_limits') -> p_action;
  v_max int := coalesce((v_override ->> 0)::int, p_max);
  v_window int := coalesce((v_override ->> 1)::int, p_window_seconds);
  v_start timestamptz;
  v_count int;
begin
  if v_uid is null then return; end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / v_window) * v_window);
  insert into private.rate_limits (player_id, action, window_start, count)
  values (v_uid, p_action, v_start, 1)
  on conflict (player_id, action, window_start) do update set count = private.rate_limits.count + 1
  returning count into v_count;
  if v_count > v_max then
    raise exception 'rate_limited' using errcode = 'P0001',
      detail = greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => v_window)) - now())))::int::text,
      hint = p_action;
  end if;
  if random() < 0.002 then
    delete from private.rate_limits where window_start < now() - interval '2 days';
  end if;
end $$;
