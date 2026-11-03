-- v0.29 Bigger worlds: every planet's plot map grows (the giants biggest), now that the 3D globes
-- only build detailed ground around you and size no longer costs anything to draw.
update public.game_config set value = value || jsonb_build_object('worlds', (value -> 'worlds')
    || jsonb_build_object(
      'mercury', (value -> 'worlds' -> 'mercury') || '{"size": 32}',
      'venus',   (value -> 'worlds' -> 'venus')   || '{"size": 40}',
      'mars',    (value -> 'worlds' -> 'mars')    || '{"size": 44}',
      'jupiter', (value -> 'worlds' -> 'jupiter') || '{"size": 72}',
      'saturn',  (value -> 'worlds' -> 'saturn')  || '{"size": 64}',
      'uranus',  (value -> 'worlds' -> 'uranus')  || '{"size": 48}',
      'neptune', (value -> 'worlds' -> 'neptune') || '{"size": 48}',
      'pluto',   (value -> 'worlds' -> 'pluto')   || '{"size": 24}',
      'exo',     (value -> 'worlds' -> 'exo')     || '{"size": 24}'))
 where key = 'planets';
