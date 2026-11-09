-- v0.7.3 Rate limits as one counter per player and action.
--
-- The limiter kept a new row for every player, action and time window, so each window started with a fresh insert
-- (and a new index entry) and old rows had to be swept away later. Now each player has a single counter per action
-- that is reset in place when a new window starts: every check is a small in-place update that touches no index,
-- and the table stays as small as the number of players. Limits and their answers are exactly as before.
truncate private.rate_limits;
alter table private.rate_limits drop constraint if exists rate_limits_pkey;
alter table private.rate_limits add primary key (player_id, action);

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
  insert into private.rate_limits as r (player_id, action, window_start, count)
  values (v_uid, p_action, v_start, 1)
  on conflict (player_id, action) do update
    set count = case when r.window_start = excluded.window_start then r.count + 1 else 1 end,
        window_start = excluded.window_start
  returning count into v_count;
  if v_count > v_max then
    raise exception 'rate_limited' using errcode = 'P0001',
      detail = greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => v_window)) - now())))::int::text,
      hint = p_action;
  end if;
end $$;
