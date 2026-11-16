-- Your places carry their own level, so the map's Worlds button can show your best place of each kind — the highest
-- tier you've unlocked, then the highest level — instead of every farm and arcade you own. An arcade (and its
-- Carnival and Galaxy Park, the same arcade grown bigger) has the arcade's level; a realm has the realm's.
select private.fn_patch('private.group_json(uuid)',
  $f$'realm_id', (select r.id from public.realms r where r.group_id = g.id and r.kind = g.kind),$f$,
  $f$'realm_id', (select r.id from public.realms r where r.group_id = g.id and r.kind = g.kind),
    'place_level', case when g.kind = 'arcade' or private.cfg('realms') -> 'kinds' -> g.kind ->> 'base' = 'arcade'
                        then (select (private.arc_level(a.xp) ->> 'level')::int from public.arcades a where a.group_id = g.id)
                        else (select (private.rlm_level(r.xp) ->> 'level')::int from public.realms r where r.group_id = g.id and r.kind = g.kind) end,$f$);
