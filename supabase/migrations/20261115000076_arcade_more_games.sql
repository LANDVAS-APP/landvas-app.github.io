-- Ten more arcade cabinets. Like the first six they're free to play and pay tickets and a slow trickle of Ink:
-- points_per_ink is set so a strong player earns roughly the same Ink an hour on any machine (~40), and
-- per_second / max_score keep impossible scores out (Endless lifts max_score only).
update public.game_config set value = jsonb_set(value, '{games}', (value -> 'games') || '{
  "airhockey": {"order": 7,  "name": "Air Hockey",    "emoji": "🏒", "color": "#22E3FF", "level": 2,  "cost": 150,  "min_seconds": 10, "max_score": 1500, "per_second": 40,  "tickets_per_point": 0.075, "points_per_ink": 600,  "max_ink": 10},
  "plinko":    {"order": 8,  "name": "Plinko",        "emoji": "🔻", "color": "#FF3D9A", "level": 3,  "cost": 220,  "min_seconds": 8,  "max_score": 6000, "per_second": 250, "tickets_per_point": 0.02,  "points_per_ink": 2250, "max_ink": 10},
  "snake":     {"order": 9,  "name": "Neon Snake",    "emoji": "🐍", "color": "#B6FF3D", "level": 4,  "cost": 320,  "min_seconds": 6,  "max_score": 2000, "per_second": 30,  "tickets_per_point": 0.11,  "points_per_ink": 400,  "max_ink": 10},
  "pusher":    {"order": 10, "name": "Coin Pusher",   "emoji": "🪙", "color": "#FFD84D", "level": 5,  "cost": 450,  "min_seconds": 10, "max_score": 1500, "per_second": 40,  "tickets_per_point": 0.1,   "points_per_ink": 450,  "max_ink": 10},
  "fruit":     {"order": 11, "name": "Fruit Slash",   "emoji": "🍉", "color": "#FF7A3D", "level": 6,  "cost": 600,  "min_seconds": 10, "max_score": 4000, "per_second": 80,  "tickets_per_point": 0.03,  "points_per_ink": 1500, "max_ink": 10},
  "blaster":   {"order": 12, "name": "Space Blaster", "emoji": "🚀", "color": "#3DDC97", "level": 7,  "cost": 800,  "min_seconds": 10, "max_score": 3000, "per_second": 60,  "tickets_per_point": 0.05,  "points_per_ink": 900,  "max_ink": 10},
  "maze":      {"order": 13, "name": "Maze Muncher",  "emoji": "🟡", "color": "#FFE14D", "level": 8,  "cost": 1000, "min_seconds": 10, "max_score": 2500, "per_second": 50,  "tickets_per_point": 0.075, "points_per_ink": 600,  "max_ink": 10},
  "rhythm":    {"order": 14, "name": "Rhythm Rush",   "emoji": "🎵", "color": "#B57BFF", "level": 9,  "cost": 1300, "min_seconds": 15, "max_score": 6000, "per_second": 150, "tickets_per_point": 0.015, "points_per_ink": 3000, "max_ink": 10},
  "racer":     {"order": 15, "name": "Neon Racer",    "emoji": "🏎️", "color": "#FF3D6E", "level": 10, "cost": 1600, "min_seconds": 10, "max_score": 3000, "per_second": 45,  "tickets_per_point": 0.035, "points_per_ink": 1350, "max_ink": 10},
  "pinball":   {"order": 16, "name": "Pinball",       "emoji": "🎯", "color": "#8B5CFF", "level": 12, "cost": 2000, "min_seconds": 10, "max_score": 8000, "per_second": 150, "tickets_per_point": 0.02,  "points_per_ink": 2250, "max_ink": 10}
}'::jsonb)
where key = 'arcade';
