-- Five more live 3D party games from the house: Iceberg Sumo, Paint Splat, Snowball Fight, Red Light Green Light and
-- Treasure Rush. Same rules, places and Ink as the others.
update public.game_config set value = jsonb_set(value, '{games,list}', (value -> 'games' -> 'list') || '{
  "sumo":     {"name": "Iceberg Sumo", "min": 2, "max": 8},
  "paint":    {"name": "Paint Splat", "min": 2, "max": 8},
  "snow":     {"name": "Snowball Fight", "min": 2, "max": 8},
  "redlight": {"name": "Red Light, Green Light", "min": 2, "max": 8},
  "gems":     {"name": "Treasure Rush", "min": 2, "max": 8}
}'::jsonb) where key = 'home';
