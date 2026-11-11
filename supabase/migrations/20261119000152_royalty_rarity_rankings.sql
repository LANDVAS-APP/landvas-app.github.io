-- Royalty and rarity rankings.
-- royalty(): every Crown held right now (Country, State, City): the holder, the kingdom, when it was claimed, how long
--   they've reigned, how strong the Crown is (players in the kingdom vs. what full strength needs) and its rent boost,
--   plus the royal court (players with the most Crowns) and how many kingdoms are still unclaimed. Places are kingdom
--   names only — never where the plot is. Players can keep themselves off this page (privacy: royalty).
-- rarity_rankings(rarity): who owns the most plots of a rarity (top 50), or, without a rarity, every rarity's totals
--   and top holder. Players who hide their stats from their profile aren't listed.

create index if not exists world_plots_rarity_owner_idx on public.world_plots (rarity, owner_id) where owner_id is not null;

-- a new privacy switch: show me on the Royalty page (on by default, like everything else)
create or replace function private.privacy_keys() returns text[] language sql immutable as $$
  select array['feed', 'feed_account', 'feed_claims', 'feed_badges', 'feed_games', 'feed_art', 'feed_luck', 'feed_travel', 'feed_places',
               'profile_badges', 'profile_games', 'profile_stats', 'royalty']
         || (select array_agg('fa_' || a.id) from private.feed_activities() a)
$$;

create or replace function public.royalty() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); a jsonb := private.cfg('rarity_abilities');
begin
  return (
    with c as (
      select p.rarity tier, p.owner_id, p.claimed_at, p.shiny, k.id city_id, k.name city, k.state, k.country, coalesce(k.country_name, k.country) country_name,
             private.kingdom_rivals(p.rarity, k.id, p.owner_id) rivals,
             coalesce((a -> p.rarity ->> 'need')::numeric, case p.rarity when 'crown' then 5 when 'crown_state' then 25 else 100 end) need,
             coalesce((a -> p.rarity ->> 'pct')::numeric, case p.rarity when 'crown' then 50 when 'crown_state' then 400 else 900 end) pct,
             (p.owner_id = v_uid) is_me,
             (p.owner_id = v_uid or (private.shows(p.owner_id, 'royalty') and private.visible_to(p.owner_id, v_uid))) shown
      from public.world_plots p join public.world_cities k on k.id = p.city_id
      where p.rarity in ('crown', 'crown_state', 'crown_country') and p.owner_id is not null),
    crown_rows as (
      select jsonb_build_object(
        'tier', tier, 'city', case when tier = 'crown' then city end, 'state', case when tier <> 'crown_country' then state end,
        'country', country, 'country_name', country_name,
        'kingdom', case tier when 'crown' then city when 'crown_state' then coalesce(state, country_name) else country_name end,
        'claimed_at', claimed_at, 'reign_days', greatest(0, floor(extract(epoch from now() - claimed_at) / 86400))::int, 'shiny', shiny,
        'rivals', rivals, 'need', need, 'strength', round(least(1, rivals / greatest(need, 1)), 3), 'pct', pct,
        'boost', round(1 + least(1, rivals / greatest(need, 1)) * pct / 100, 3), 'full_boost', round(1 + pct / 100, 3),
        'is_me', is_me, 'holder', case when shown then private.profile_json(owner_id) end) j,
        tier, claimed_at, owner_id, shown
      from c),
    court as (
      select owner_id, count(*) n, count(*) filter (where tier = 'crown_country') countries, count(*) filter (where tier = 'crown_state') states,
             count(*) filter (where tier = 'crown') cities, min(claimed_at) since
      from crown_rows where shown group by owner_id)
    select jsonb_build_object(
      'crowns', coalesce((select jsonb_agg(j order by case tier when 'crown_country' then 0 when 'crown_state' then 1 else 2 end, claimed_at) from crown_rows), '[]'::jsonb),
      'court', coalesce((select jsonb_agg(jsonb_build_object('player', private.profile_json(owner_id), 'crowns', n, 'countries', countries, 'states', states, 'cities', cities,
                                         'since', since, 'rent_boost', round(1 + private.crown_pct(owner_id) / 100, 3))
                                       order by countries desc, states desc, cities desc, since) from (select * from court order by countries desc, states desc, cities desc, since limit 50) x), '[]'::jsonb),
      'totals', jsonb_build_object(
        'city', (select count(*) from c where tier = 'crown'), 'state', (select count(*) from c where tier = 'crown_state'), 'country', (select count(*) from c where tier = 'crown_country'),
        'cities', (select count(*) from public.world_cities),
        'states', (select count(*) from (select distinct country, state from public.world_cities where state is not null) s),
        'countries', (select count(distinct country) from public.world_cities),
        'monarchs', (select count(distinct owner_id) from c)),
      'rules', jsonb_build_object('crown', a -> 'crown', 'crown_state', a -> 'crown_state', 'crown_country', a -> 'crown_country'))
  );
end $$;

create or replace function public.rarity_rankings(p_rarity text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if p_rarity is null then
    return (select coalesce(jsonb_agg(jsonb_build_object('rarity', r.id, 'owned', coalesce(s.owned, 0), 'owners', coalesce(s.owners, 0), 'shiny', coalesce(s.shiny, 0),
                      'top', (select jsonb_build_object('player', private.profile_json(t.owner_id), 'value', t.n) from (
                                select owner_id, count(*) n from public.world_plots
                                where rarity = r.id and owner_id is not null and private.visible_to(owner_id, v_uid) and private.shows(owner_id, 'profile_stats')
                                group by 1 order by 2 desc, min(claimed_at) limit 1) t)) order by r.sort), '[]'::jsonb)
            from public.plot_rarities r
            left join (select rarity, count(*) owned, count(distinct owner_id) owners, count(*) filter (where shiny) shiny
                       from public.world_plots where owner_id is not null group by 1) s on s.rarity = r.id);
  end if;
  if not exists (select 1 from public.plot_rarities where id = p_rarity) then raise exception 'invalid_rarity' using errcode = 'P0001'; end if;
  return jsonb_build_object('rarity', p_rarity,
    'owned', (select count(*) from public.world_plots where rarity = p_rarity and owner_id is not null),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', x.rank, 'player', private.profile_json(x.owner_id), 'value', x.n, 'shiny', x.shiny, 'since', x.first) order by x.rank) from (
              select owner_id, count(*) n, count(*) filter (where shiny) shiny, min(claimed_at) first, rank() over (order by count(*) desc) rank
              from public.world_plots where rarity = p_rarity and owner_id is not null and private.visible_to(owner_id, v_uid) and private.shows(owner_id, 'profile_stats')
              group by 1 order by n desc, first limit 50) x), '[]'::jsonb),
    'me', case when v_uid is not null then (select count(*) from public.world_plots where rarity = p_rarity and owner_id = v_uid) end);
end $$;

revoke all on function public.royalty() from public;
grant execute on function public.royalty() to anon, authenticated;
revoke all on function public.rarity_rankings(text) from public;
grant execute on function public.rarity_rankings(text) to anon, authenticated;
