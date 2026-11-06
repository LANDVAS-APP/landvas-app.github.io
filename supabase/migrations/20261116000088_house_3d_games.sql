-- Live 3D party games from the house: Ink Tag, Hide & Seek, Floor is Lava, Musical Chairs. Players' explorer looks
-- come with the table so everyone runs about as themselves.
update public.game_config set value = jsonb_set(value, '{games,list}', (value -> 'games' -> 'list') || '{
  "tag":    {"name": "Ink Tag", "min": 2, "max": 8},
  "hide":   {"name": "Hide & Seek", "min": 3, "max": 8},
  "lava":   {"name": "Floor is Lava", "min": 2, "max": 8},
  "chairs": {"name": "Musical Chairs", "min": 3, "max": 8}
}'::jsonb) where key = 'home';

create or replace function private.hg_json(p_game uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', g.id, 'game', g.game, 'status', g.status, 'host', g.host_id, 'home', g.home_id,
    'seed', case when g.status <> 'lobby' then g.seed end, 'result', g.result,
    'created_at', g.created_at, 'started_at', g.started_at, 'server_time', now(),
    'players', (select coalesce(jsonb_agg(private.profile_json(p.player_id) || jsonb_build_object('slot', p.slot, 'place', p.place, 'ink', p.ink,
                  'explorer_style', (select explorer_style from public.profiles where id = p.player_id))
                  order by p.slot nulls last, p.joined_at), '[]'::jsonb) from public.home_game_players p where p.game_id = g.id))
  from public.home_games g where g.id = p_game
$$;
revoke all on function private.hg_json(uuid) from public, anon, authenticated;
