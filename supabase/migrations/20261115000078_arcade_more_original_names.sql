-- Two more names of our own: Tower Stacker -> Ink Tower, Cyclone -> Prism Ring (both echoed real prize machines).
update public.game_config set value = jsonb_set(jsonb_set(value,
  '{games,stacker}', (value -> 'games' -> 'stacker') || '{"name": "Ink Tower"}'::jsonb),
  '{games,cyclone}', (value -> 'games' -> 'cyclone') || '{"name": "Prism Ring"}'::jsonb)
where key = 'arcade';
