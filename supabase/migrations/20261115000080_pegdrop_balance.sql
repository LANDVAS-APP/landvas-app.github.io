-- Peg Drop rebalanced after closing the edge exploit: chips now average ~35 points wherever you aim (the middle
-- slot pays 100), so the score limits and rates follow (still ~40 Ink an hour for strong play).
update public.game_config set value = jsonb_set(value, '{games,plinko}', (value -> 'games' -> 'plinko')
  || '{"max_score": 2000, "per_second": 80, "points_per_ink": 750, "tickets_per_point": 0.06}'::jsonb)
where key = 'arcade';
