-- The Phoenix takes over the Dragon's power, for a whole year: +10% rent for every day of your check-in streak, up to a
-- 365-day streak (×37.5). Miss a day and it falls to ashes (×1) until a new streak lights it again. The Dragon is
-- gone: Dragon plots become Phoenix plots.
update public.plot_rarities set ability = 'Grows with your daily streak: +10% rent for every day in a row you check in — all the way to a 365-day streak (×37.5). Miss a day and it falls to ashes until you start again.'
 where id = 'phoenix';
update public.world_plots set rarity = 'phoenix' where rarity = 'dragon';
update public.roll_tickets set min_rarity = 'phoenix' where min_rarity = 'dragon';
delete from public.plot_rarities where id = 'dragon';
update public.game_config set value = (value - 'dragon') || '{"phoenix": {"per_day": 0.1, "max_days": 365}}'::jsonb where key = 'rarity_abilities';
update public.achievements set is_active = false where key = 'rar_dragon';

create or replace function private.phoenix_mult(p_uid uuid, p_day date) returns numeric language sql stable as $$
  select case when s.last_day is not null and s.last_day >= p_day - 1 and s.streak > 0
              then 1 + coalesce((c ->> 'per_day')::numeric, 0.1) * least(s.streak, coalesce((c ->> 'max_days')::int, 365)) else 1 end
  from (select private.cfg('rarity_abilities') -> 'phoenix' c) x
  left join public.daily_streaks s on s.player_id = p_uid
$$;
create or replace function private.plot_day_mult(p public.world_plots, p_day date) returns numeric language sql stable as $$
  select case p.rarity
    when 'chaos' then private.chaos_mult(p.gx, p.gy, p_day)
    when 'phoenix' then private.phoenix_mult(p.owner_id, p_day)
    when 'kraken' then private.kraken_mult(p)
    when 'gemini' then private.gemini_mult(p)
    when 'mirror' then private.mirror_mult(p)
    else 1 end
$$;
create or replace function private.day_rarities() returns text[] language sql immutable as $$
  select array['chaos', 'phoenix', 'kraken', 'gemini', 'mirror']
$$;
drop function if exists private.dragon_mult(uuid, date);
