-- Explorer's Eyes: the first-person view of the real place your explorer stands in (src/eyes/). Everything it shows
-- comes from what the game already has; the one new thing it pays for is the sky treasures:
--   every `window_min` minutes a few treasures drift through your sky (Ink balloons by day, lanterns at dusk, wishing
--   stars at night — the look is the client's, by the real sun). Tap one to catch it: a little Ink (paced like every
--   other source), sometimes Luck, rarely a Rare+ roll ticket. At most `daily_cap` a day.
-- Switches: game_config 'eyes' (enabled: the whole view; sky.enabled: just the treasures) and the earning switch
-- ref:eyes_sky (Admin → Live control → Earning switches) for the Ink.

insert into public.game_config (key, value, description) values ('eyes', jsonb_build_object(
  'enabled', true,
  'sky', jsonb_build_object('enabled', true, 'window_min', 15, 'per_window', 3, 'daily_cap', 12,
    'ink_min', 3, 'ink_max', 8, 'luck_pct', 12, 'luck', 2, 'ticket_pct', 1.5, 'ticket', 'rare')),
  'Explorer''s Eyes (first-person view): on/off, and the sky treasures (per window, daily cap, rewards)')
on conflict (key) do nothing;

create table if not exists public.eyes_catches (
  player_id uuid not null references public.players (id) on delete cascade,
  win bigint not null,
  i int not null,
  at timestamptz not null default now(),
  reward jsonb not null default '{}'::jsonb,
  primary key (player_id, win, i));
create index if not exists eyes_catches_day on public.eyes_catches (player_id, at desc);
alter table public.eyes_catches enable row level security;

create or replace function private.eyes_sky_cfg() returns jsonb language sql stable as $$
  select coalesce(private.cfg('eyes') -> 'sky', '{}'::jsonb)
$$;
create or replace function private.eyes_window_s() returns int language sql stable as $$
  select greatest(60, least(24 * 3600, coalesce((private.eyes_sky_cfg() ->> 'window_min')::int, 15) * 60))
$$;
create or replace function private.eyes_on() returns boolean language sql stable as $$
  select coalesce((private.cfg('eyes') ->> 'enabled')::boolean, true) and coalesce((private.eyes_sky_cfg() ->> 'enabled')::boolean, true)
$$;

/** the treasures in your sky right now: [{i, seed}] (seed 0…1 places and colours it), what you've caught today */
create or replace function public.eyes_sky() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s jsonb := private.eyes_sky_cfg(); v_ws int := private.eyes_window_s();
  v_win bigint := floor(extract(epoch from now()) / v_ws)::bigint;
  v_cap int := greatest(0, coalesce((s ->> 'daily_cap')::int, 12));
  v_per int := least(6, greatest(0, coalesce((s ->> 'per_window')::int, 3)));
  v_today int; v_drops jsonb;
begin
  if not private.eyes_on() then return jsonb_build_object('enabled', false); end if;
  select count(*) into v_today from public.eyes_catches where player_id = v_uid and at >= private.day_start(now());
  select coalesce(jsonb_agg(jsonb_build_object('i', g, 'seed', round(('x' || substr(md5(v_uid::text || ':' || v_win || ':' || g), 1, 7))::bit(28)::int / 268435456.0, 6)) order by g), '[]'::jsonb)
    into v_drops
    from (select g from generate_series(0, v_per - 1) g
           where not exists (select 1 from public.eyes_catches e where e.player_id = v_uid and e.win = v_win and e.i = g)
           order by g limit greatest(0, v_cap - v_today)) q;
  return jsonb_build_object('enabled', true, 'win', v_win, 'drops', v_drops, 'today', v_today, 'cap', v_cap,
    'window_s', v_ws, 'next_at', to_timestamp((v_win + 1) * v_ws));
end $$;

/** catch one: it must be from this window (or the one that just ended), not caught yet, and under today's cap */
create or replace function public.eyes_catch(p_win bigint, p_i int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s jsonb := private.eyes_sky_cfg(); v_ws int := private.eyes_window_s();
  v_now bigint := floor(extract(epoch from now()) / v_ws)::bigint;
  v_cap int := greatest(0, coalesce((s ->> 'daily_cap')::int, 12));
  v_per int := least(6, greatest(0, coalesce((s ->> 'per_window')::int, 3)));
  v_tp numeric := greatest(0, least(100, coalesce((s ->> 'ticket_pct')::numeric, 1.5)));
  v_lp numeric := greatest(0, least(100, coalesce((s ->> 'luck_pct')::numeric, 12)));
  v_lo int := greatest(0, coalesce((s ->> 'ink_min')::int, 3));
  v_hi int := greatest(0, coalesce((s ->> 'ink_max')::int, 8));
  v_ticket text := coalesce(nullif(s ->> 'ticket', ''), 'rare');
  v_today int; r numeric := random() * 100; v jsonb; n int;
begin
  perform private.rate_limit('eyes_catch', 40, 600);
  if not private.eyes_on() then raise exception 'eyes_off' using errcode = 'P0001'; end if;
  if p_win is null or p_win not in (v_now, v_now - 1) or p_i is null or p_i < 0 or p_i >= v_per then raise exception 'gone' using errcode = 'P0001'; end if;
  select count(*) into v_today from public.eyes_catches where player_id = v_uid and at >= private.day_start(now());
  if v_today >= v_cap then raise exception 'caught_enough' using errcode = 'P0001'; end if;
  insert into public.eyes_catches (player_id, win, i) values (v_uid, p_win, p_i) on conflict do nothing;
  if not found then raise exception 'gone' using errcode = 'P0001'; end if;
  if r < v_tp and exists (select 1 from public.plot_rarities where id = v_ticket) then
    perform private.ench_ticket(v_uid, v_ticket, 'eyes_sky');
    v := jsonb_build_object('ticket', v_ticket);
  elsif r < v_tp + v_lp then
    perform private.rx_luck(v_uid, greatest(1, coalesce((s ->> 'luck')::int, 2)));
    v := jsonb_build_object('luck', greatest(1, coalesce((s ->> 'luck')::int, 2)));
  else
    n := v_lo + floor(random() * (greatest(v_hi, v_lo) - v_lo + 1))::int;
    n := private.grant_ink_paced(v_uid, n, 'finds', 'eyes_sky', p_win || ':' || p_i, 'eyes:' || v_uid || ':' || p_win || ':' || p_i);
    v := jsonb_build_object('ink', n);
  end if;
  update public.eyes_catches set reward = v where player_id = v_uid and win = p_win and i = p_i;
  return v || jsonb_build_object('today', v_today + 1, 'cap', v_cap, 'balances', private.balances(v_uid));
end $$;

revoke all on function public.eyes_sky() from public, anon;
revoke all on function public.eyes_catch(bigint, int) from public, anon;
grant execute on function public.eyes_sky() to authenticated;
grant execute on function public.eyes_catch(bigint, int) to authenticated;
revoke all on function private.eyes_sky_cfg() from public;
revoke all on function private.eyes_window_s() from public;
revoke all on function private.eyes_on() from public;
