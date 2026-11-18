-- The fair-play auto-scan keeps up as LANDVAS grows.
--
-- It rescanned at most 150 players an hour, each every 6 hours: enough for about 900 active players. Past that, most
-- players would silently never be rescanned (and cash-outs lean on these scores). Now each hourly run scans enough
-- players to get round everyone active in the last two days every 6 hours (never fewer than 150), within a time budget
-- (45 s, adjustable: integrity config 'scan_budget_s') so a big run can't hog the database; whatever's left is first
-- in line next hour (oldest scan first). Same rules as before for who's scanned and how.
create or replace function private.integrity_auto_scan()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_n int := 0; v_active int; v_batch int; v_stop timestamptz;
begin
  if not coalesce((private.icfg() ->> 'auto_scan')::boolean, true) then return 0; end if;
  perform set_config('request.jwt.claims', coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}'), true);
  delete from private.integrity_baseline where at < now() - interval '50 minutes';
  perform private.integrity_baseline_get();
  select count(*) into v_active from public.players p where p.last_active_at > now() - interval '2 days';
  v_batch := least(greatest(150, ceil(v_active / 6.0)::int), 20000);
  v_stop := clock_timestamp() + make_interval(secs => least(greatest(coalesce((private.icfg() ->> 'scan_budget_s')::int, 45), 5), 240));
  for r in select p.id from public.players p left join private.integrity_scores s on s.player_id = p.id
            where p.last_active_at > now() - interval '2 days' and (s.player_id is null or s.version < 2 or s.scanned_at < now() - interval '6 hours')
            order by s.scanned_at nulls first limit v_batch loop
    exit when clock_timestamp() > v_stop;
    begin perform private.integrity_scan_save(r.id); v_n := v_n + 1; exception when others then null; end;
  end loop;
  return v_n;
end $$;
revoke all on function private.integrity_auto_scan() from public, anon, authenticated;

-- "who's been active lately" is asked by the scan above and a dozen other checks; with a million players that's a
-- full read of the players table each time. (last_active_at moves at most every 5 minutes a player.)
create index if not exists players_last_active_idx on public.players (last_active_at);
