-- The Ultra tracker: every Ultra plot you own and where it stands today.
--   Chaos     — today's roll (×0 to ×20), new every daily reset
--   Phoenix   — your check-in streak's multiplier now, and what checking in today makes it
--   Kraken / Gemini / Mirror — today's multiplier
--   Solar / Lunar / Comet — their daily window (UTC start hour + length) and whether it is open right now
--   everything else — its ability (it doesn't change day to day)

create or replace function public.my_ultras() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  d date := private.game_day(now());
  c jsonb := private.cfg('rarity_abilities');
  s public.daily_streaks;
  per numeric := coalesce((c -> 'phoenix' ->> 'per_day')::numeric, 0.1);
  maxd int := coalesce((c -> 'phoenix' ->> 'max_days')::int, 365);
  lit boolean;
  plots jsonb;
  h numeric := extract(epoch from (now() - date_trunc('day', now() at time zone 'UTC' ) at time zone 'UTC')) / 3600.0;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into s from public.daily_streaks where player_id = uid;
  -- the streak still counts until a whole day is missed
  lit := s.last_day is not null and s.last_day >= d - 1 and s.streak > 0;

  select coalesce(jsonb_agg(x order by x ->> 'sort', x ->> 'rarity', (x ->> 'mult')::numeric desc), '[]'::jsonb) into plots from (
    select jsonb_build_object(
      'gx', p.gx, 'gy', p.gy, 'rarity', p.rarity, 'plot_type', p.plot_type, 'level', p.level, 'name', p.name,
      'sort', lpad(r.sort::text, 3, '0'),
      'ability', r.ability,
      'daily', p.rarity = any(private.day_rarities()),
      'mult', case when p.rarity = any(private.day_rarities()) then round(private.plot_day_mult(p, d), 2) end,
      'window', case when p.rarity in ('solar', 'lunar', 'comet') then w.win end
    ) x
    from public.world_plots p
    join public.plot_rarities r on r.id = p.rarity
    left join lateral (
      select jsonb_build_object('start', st, 'len', ln,
        'mult', case p.rarity when 'comet' then coalesce((c -> 'comet' ->> 'mult')::numeric, 30) else coalesce((c -> p.rarity ->> 'mult')::numeric, 3) end,
        'open', ((h - st + 48) % 24) < ln) win
      from (select round((case p.rarity
          when 'solar' then 6 - ((p.gx + 0.5) / 4194304.0 * 360 - 180) / 15
          when 'lunar' then 18 - ((p.gx + 0.5) / 4194304.0 * 360 - 180) / 15
          else (abs(private.cell_roll('comet', p.gx, p.gy)) % 96) / 4.0 end + 48)::numeric % 24 * 4) / 4 st,
        case p.rarity when 'comet' then coalesce((c -> 'comet' ->> 'hours')::numeric, 1) else 12 end ln) q
    ) w on true
    where p.owner_id = uid
      and p.rarity in ('solar', 'lunar', 'comet', 'chaos', 'phoenix', 'gemini', 'kraken', 'ancient', 'mirror', 'prismatic', 'crown', 'crown_state', 'genesis', 'crown_country', 'singularity')
  ) t;

  return jsonb_build_object(
    'day', d,
    'resets_at', private.day_start(now()) + interval '1 day',
    'streak', coalesce(s.streak, 0),
    'checked_in', coalesce(s.last_day >= d, false),
    'phoenix', jsonb_build_object(
      'per_day', per, 'max_days', maxd,
      'now', case when lit then round(1 + per * least(s.streak, maxd), 2) else 1 end,
      -- what checking in today makes it (the same if you already have)
      'next', case when coalesce(s.last_day >= d, false) then round(1 + per * least(s.streak, maxd), 2)
                   when lit then round(1 + per * least(s.streak + 1, maxd), 2)
                   else round(1 + per, 2) end),
    'chaos_values', coalesce(c -> 'chaos' -> 'values', '[1]'::jsonb),
    'plots', plots);
end $$;
revoke all on function public.my_ultras() from public, anon;
grant execute on function public.my_ultras() to authenticated;
