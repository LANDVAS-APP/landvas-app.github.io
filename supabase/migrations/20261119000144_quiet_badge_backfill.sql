-- The ~200 new badges unlock in a burst the first time each player does anything after they arrived — that burst
-- doesn't belong on the live feed. Badges earned one at a time still do: a badge only goes on the feed when it's the
-- player's only few unlocks in that moment (a batch of 5+ at once is a catch-up, and stays off the feed).

create or replace function private.feed_achievement_trg() returns trigger
language plpgsql as $$
begin
  -- part of a batch? (anything else unlocked by this player in the last minute) — keep it off the feed, and take the
  -- batch's earlier badges back off it too
  if (select count(*) from public.player_achievements pa where pa.player_id = new.player_id and pa.achievement_key <> new.achievement_key
               and pa.unlocked_at > now() - interval '1 minute') >= 4 then
    delete from public.feed_events where kind = 'achievement' and player_id = new.player_id and created_at > now() - interval '1 minute';
    return null;
  end if;
  insert into public.feed_events (kind, player_id, data)
  select 'achievement', new.player_id, jsonb_build_object('key', a.key, 'name', a.name, 'icon', a.icon)
  from public.achievements a where a.key = new.achievement_key;
  return null;
end $$;

-- clear the burst that already landed since the new badges went out (players with 2+ badge posts within a minute)
delete from public.feed_events f
 where f.kind = 'achievement' and f.created_at > '2026-11-11T12:00:00Z'
   and (select count(*) from public.feed_events g where g.kind = 'achievement' and g.player_id = f.player_id and g.id <> f.id
          and g.created_at between f.created_at - interval '1 minute' and f.created_at + interval '1 minute') >= 4;
