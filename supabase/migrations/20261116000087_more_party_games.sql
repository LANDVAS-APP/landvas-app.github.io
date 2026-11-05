-- More house party games for 3-8 players, and house games can pay up to 500 Ink a day.
update public.game_config set value = jsonb_set(jsonb_set(value, '{games,daily_ink}', '500'::jsonb), '{games,list}', (value -> 'games' -> 'list') || '{
  "chain":     {"name": "Scribble Chain", "min": 3, "max": 8},
  "spy":       {"name": "Word Spy", "min": 3, "max": 8},
  "samebrain": {"name": "Same Brain", "min": 3, "max": 8},
  "bluff":     {"name": "Bluff Buffet", "min": 3, "max": 8}
}'::jsonb) where key = 'home';
