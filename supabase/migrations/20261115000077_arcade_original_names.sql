-- Keep the arcade clear of other people's brands: "Plinko" and "Skee-Ball" are registered trademarks, so those
-- cabinets get names of their own, and the maze game is now Ink Maze (an original ink blob and smudges).
update public.game_config set value = jsonb_set(jsonb_set(jsonb_set(value,
  '{games,plinko}',   (value -> 'games' -> 'plinko')   || '{"name": "Peg Drop", "emoji": "🔻"}'::jsonb),
  '{games,skeeball}', (value -> 'games' -> 'skeeball') || '{"name": "Ring Roll", "emoji": "🎳"}'::jsonb),
  '{games,maze}',     (value -> 'games' -> 'maze')     || '{"name": "Ink Maze", "emoji": "🖌️"}'::jsonb)
where key = 'arcade';
