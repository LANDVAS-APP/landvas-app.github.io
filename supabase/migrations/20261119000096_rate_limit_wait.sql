-- v0.6.4 When someone goes too fast, say how long to wait: the rate-limit error now carries the seconds until the
-- window resets (detail) and the action that was limited (hint), so the app can tell the player in plain words.
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
end $$;
