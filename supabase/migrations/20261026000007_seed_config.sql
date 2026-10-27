-- LANDVAS reference data and tunable configuration (no fake players or content).

insert into public.plot_types (id, name, minigame, minigame_name, tagline, color_primary, color_secondary, weight,
                               acquire_multiplier, sort) values
  ('graphite', 'Graphite', 'tracecraft', 'TraceCraft', 'Charcoal, silver and pencil grain', '#B9C3D8', '#5C6680', 30, 1.0, 1),
  ('pigment', 'Pigment', 'colorburst', 'ColorBurst', 'Saturated paint and watercolor blooms', '#FF5470', '#FFB23F', 30, 1.0, 2),
  ('mosaic', 'Mosaic', 'patternshift', 'PatternShift', 'Geometric tiles and bright patterns', '#22C7B5', '#FFD43B', 20, 1.0, 3),
  ('lumina', 'Lumina', 'lightlines', 'LightLines', 'Neon light and glowing gradients', '#8B5CFF', '#22E3FF', 20, 1.0, 4)
on conflict (id) do nothing;

-- Rent rates follow the published Atlas Earth / TerraMine ladder (Common = Rock
-- $0.0000000011/s, Rare = Coal 1.5x, Epic = Gold 2x, Legendary = Diamond 4x)
-- plus a fifth tier, Mythic, at 8x. Odds out of 1000.
insert into public.plot_rarities (id, name, weight, usd_per_second, ink_reward_multiplier, price_multiplier, color, glow, sort) values
  ('common', 'Common', 500, 0.0000000011, 1.00, 1.0, '#3DDC97', '#A6FFD6', 1),
  ('rare', 'Rare', 300, 0.0000000016, 1.15, 1.0, '#2FB8FF', '#B3E5FF', 2),
  ('epic', 'Epic', 140, 0.0000000022, 1.35, 1.0, '#A45CFF', '#DABDFF', 3),
  ('legendary', 'Legendary', 50, 0.0000000044, 1.70, 1.0, '#FFB31F', '#FFE3A1', 4),
  ('mythic', 'Mythic', 10, 0.0000000088, 2.25, 1.0, '#FF3D9A', '#FFC4E1', 5)
on conflict (id) do nothing;

insert into public.game_config (key, value, description) values
('economy', '{
  "starter_bonus": {"pigments": 5, "brush_points": 10},
  "acquire": {"base_ink": 100, "growth": 1.0, "max_ink": 100000},
  "upgrade": {"max_level": 10,
              "level_cost_ink": [0, 150, 220, 300, 400, 520, 660, 820, 1000, 1200],
              "level_cost_pigments": [0, 3, 5, 8, 12, 16, 20, 25, 30, 36]},
  "publish_reward": {"brush_points": 20, "brush_points_per_plot": 2, "pigments": 2, "gallery_tokens": 1, "daily_token_cap": 3}
}', 'Game currencies. Ink buys plots and is earned only by winning plot minigames; it has no cash value.'),
('rent', '{
  "enabled": true, "currency": "USD", "level_bonus": 0.01, "max_offline_days": 30,
  "boost": {"multiplier": 20, "minutes_per_boost": 30, "max_stack_hours": 8, "free_per_day": 6, "reset_hour_utc": 9},
  "cashout": {"minimum_usd": 5, "methods": ["paypal", "gift_card"]}
}', 'USD rent per owned plot (rates live in plot_rarities). Boost multiplies all rent while active. Cash-out is a separate, legally gated flag.'),
('explorer', '{
  "claim_reach": 1, "max_speed_kmh": 1000, "manual_travel": true, "travel_speed_kmh": 20, "jump_cooldown_hours": 24
}', 'Location rules: plots are claimable within claim_reach plots of the explorer. GPS jumps faster than max_speed_kmh are refused (one re-anchor per jump cooldown). Without GPS the explorer travels at travel_speed_kmh.'),
('limits', '{
  "max_canvas_side": 10, "max_canvas_plots": 100, "max_layers_base": 6, "max_layers_hard": 32,
  "max_plots_per_player": 2500, "min_plots_to_react": 1, "plot_px": 256
}', 'Canvas, layer and anti-abuse limits.'),
('moderation', '{
  "mode": "manual", "screening_provider": "none", "suspend_threshold": 3, "ban_threshold": 5
}', 'manual = every publication goes to the review queue; screened = auto-approve only after a screening provider passes it; auto = development only.'),
('legal', '{
  "terms_version": "2026-10-draft-1", "privacy_version": "2026-10-draft-1",
  "support_email": "support@example.com", "abuse_email": "abuse@example.com", "copyright_email": "copyright@example.com"
}', 'Replace contact addresses and versions before launch.'),
('minigames', '{
  "max_level": 60, "session_minutes": 20, "daily_rewarded_wins_per_game": 6, "plot_level_bonus": 0.05,
  "rewards": {"base_ink": 20, "ink_per_level": 2, "score_ink_divisor": 80, "brush_points_base": 6,
              "brush_points_per_star": 3, "pigments_on_three_stars": 2, "fail_brush_points": 2},
  "games": {
    "tracecraft": {"enabled": true}, "colorburst": {"enabled": true},
    "patternshift": {"enabled": true}, "lightlines": {"enabled": true}
  }
}', 'Minigame availability, levels and rewards. Winning is the only source of Ink.'),
('shop', '{"items": [
  {"key": "brush.airbrush", "name": "Airbrush", "kind": "brush", "description": "Soft, buildable spray for glows and gradients.", "cost": {"pigments": 15}},
  {"key": "brush.spray", "name": "Spray Can", "kind": "brush", "description": "Street-art speckle with pressure-driven density.", "cost": {"pigments": 20}},
  {"key": "brush.calligraphy", "name": "Calligraphy Nib", "kind": "brush", "description": "Angled nib for elegant thick-thin strokes.", "cost": {"pigments": 20}},
  {"key": "palette.neon", "name": "Neon Palette", "kind": "palette", "description": "Twelve electric colors inspired by Lumina plots.", "cost": {"pigments": 12}},
  {"key": "palette.earth", "name": "Earth & Mineral Palette", "kind": "palette", "description": "Ochres, umbers and slate for natural scenes.", "cost": {"pigments": 10}},
  {"key": "palette.pastel", "name": "Pastel Bloom Palette", "kind": "palette", "description": "Soft chalky tones for dreamy murals.", "cost": {"pigments": 10}},
  {"key": "layers.extra1", "name": "Layer Slots +2", "kind": "layer_slot", "description": "Work with up to 8 layers.", "cost": {"pigments": 25}},
  {"key": "layers.extra2", "name": "Layer Slots +2 (II)", "kind": "layer_slot", "description": "Work with up to 10 layers.", "cost": {"pigments": 60}, "requires": "layers.extra1"},
  {"key": "frame.gold", "name": "Gilded Profile Frame", "kind": "frame", "description": "A gallery-gold frame for your avatar.", "cost": {"gallery_tokens": 5}},
  {"key": "frame.prism", "name": "Prism Profile Frame", "kind": "frame", "description": "A shifting rainbow frame for your avatar.", "cost": {"gallery_tokens": 10}}
]}', 'Unlockable tools and cosmetics bought with fictional currency.'),
('rate_limits', '{}', 'Optional overrides: {"action": [max, window_seconds]}.')
on conflict (key) do nothing;

insert into public.achievements (key, name, description, icon, category, metric, threshold, reward, sort) values
  ('first_plot', 'Ground Breaker', 'Claim your first plot.', 'flag', 'collection', 'plots', 1, '{"gallery_tokens": 1}', 1),
  ('first_stroke', 'First Stroke', 'Save your first drawing.', 'brush', 'creation', 'saved_tiles', 1, '{"pigments": 3}', 2),
  ('first_masterpiece', 'First Masterpiece', 'Publish your first artwork to the world map.', 'frame', 'creation', 'publications', 1, '{"pigments": 5, "gallery_tokens": 2}', 3),
  ('canvas_connector', 'Canvas Connector', 'Fuse plots into one continuous canvas.', 'link', 'creation', 'largest_group', 2, '{"pigments": 5}', 4),
  ('color_explorer', 'Color Explorer', 'Publish an artwork using 24 or more distinct colors.', 'palette', 'creation', 'max_colors', 24, '{"pigments": 10}', 5),
  ('nine_plot_canvas', 'Nine-Plot Canvas', 'Publish a mural spanning 9 or more plots.', 'grid', 'creation', 'largest_publication', 9, '{"gallery_tokens": 3, "pigments": 10}', 6),
  ('mural_architect', 'Mural Architect', 'Publish a mural spanning 25 or more plots.', 'landmark', 'creation', 'largest_publication', 25, '{"gallery_tokens": 6, "pigments": 25}', 7),
  ('landholder', 'Landholder', 'Own 10 plots.', 'map', 'collection', 'plots', 10, '{"pigments": 10, "gallery_tokens": 1}', 8),
  ('hundred_plot_collection', 'Hundred Plot Collection', 'Own 100 plots.', 'crown', 'collection', 'plots', 100, '{"gallery_tokens": 10}', 9),
  ('global_artist', 'Global Artist', 'Own plots in 3 different world regions.', 'globe', 'exploration', 'regions', 3, '{"gallery_tokens": 4}', 10),
  ('developer', 'Developer', 'Install 5 plot upgrades.', 'hammer', 'collection', 'upgrades', 5, '{"pigments": 10}', 11),
  ('master_of_graphite', 'Master of Graphite', 'Clear TraceCraft level 10.', 'pencil', 'mastery', 'tracecraft', 10, '{"pigments": 12, "gallery_tokens": 2}', 12),
  ('master_of_pigment', 'Master of Pigment', 'Clear ColorBurst level 10.', 'droplet', 'mastery', 'colorburst', 10, '{"pigments": 12, "gallery_tokens": 2}', 13),
  ('mosaic_genius', 'Mosaic Genius', 'Clear PatternShift level 10.', 'shapes', 'mastery', 'patternshift', 10, '{"pigments": 12, "gallery_tokens": 2}', 14),
  ('lumina_architect', 'Lumina Architect', 'Clear LightLines level 10.', 'sparkles', 'mastery', 'lightlines', 10, '{"pigments": 12, "gallery_tokens": 2}', 15),
  ('game_on', 'Game On', 'Win 10 minigames.', 'gamepad', 'mastery', 'minigame_wins', 10, '{"pigments": 10}', 16),
  ('curator', 'Curator', 'Appreciate 10 artworks by other artists.', 'heart', 'community', 'appreciations_given', 10, '{"pigments": 5}', 17),
  ('beloved', 'Beloved', 'Receive 25 appreciations.', 'star', 'community', 'appreciations_received', 25, '{"gallery_tokens": 3}', 18),
  ('treasure_hunter', 'Treasure Hunter', 'Own 3 Epic or rarer plots.', 'gem', 'exploration', 'rare_plots', 3, '{"pigments": 8}', 19),
  ('legend_seeker', 'Legend Seeker', 'Own a Legendary or Mythic plot.', 'trophy', 'exploration', 'legendary_plots', 1, '{"pigments": 12, "gallery_tokens": 2}', 20),
  ('mythic_finder', 'Mythic Finder', 'Own a Mythic plot.', 'sparkles', 'exploration', 'mythic_plots', 1, '{"gallery_tokens": 5}', 21),
  ('overdrive', 'Overdrive', 'Activate the rent boost 10 times.', 'zap', 'collection', 'boosts', 10, '{"pigments": 6}', 22)
on conflict (key) do nothing;

insert into public.feature_flags (key, enabled, is_public, description, config) values
  ('minigames', true, true, 'Plot minigames', '{}'),
  ('gallery', true, true, 'Global gallery', '{}'),
  ('events', true, true, 'World events', '{}'),
  ('globe_view', true, true, 'Globe projection when zoomed out', '{}'),
  ('collaborative_murals', false, true, 'Multi-owner Canvas Alliances (not yet released)', '{"status": "design"}'),
  ('location_gated_claims', true, true, 'Plots can only be claimed near the player''s explorer (GPS or travel)', '{}'),
  ('payments', false, true, 'Real-money purchases of cosmetics (plots are never sold for money)', '{"legally_gated": true, "legal_signoff": ""}'),
  ('creator_marketplace', false, true, 'Commissions and creator sales', '{"legally_gated": true, "legal_signoff": ""}'),
  ('cashout', false, true, 'Players can request payout of USD rent', '{"legally_gated": true, "legal_signoff": ""}'),
  ('rewarded_ads', false, true, 'Rewarded ads for extra boosts / minigame attempts (needs an ad network)', '{}'),
  ('local_dev_mode', false, true, 'Local development conveniences (never enable in production)', '{}')
on conflict (key) do nothing;

-- Event templates (drafts are invisible to players; admins schedule them).
insert into public.event_definitions (key, name, kind, description, status, config) values
  ('color-the-world-template', 'Color the World', 'color_the_world',
   'A worldwide creative push: every plot painted during the event counts toward the global canvas.', 'draft',
   '{"theme_colors": ["#FF5470", "#FFB23F", "#22C7B5", "#8B5CFF"],
     "rewards": {"participation": {"gallery_tokens": 1}, "goal": {"metric": "plots_painted", "threshold": 4, "reward": {"pigments": 15}},
                 "top": [{"rank_max": 10, "reward": {"gallery_tokens": 3}}]}}'),
  ('great-mural-template', 'The Great Mural', 'great_mural',
   'Build the largest connected artwork you can. Score = plots painted.', 'draft',
   '{"rewards": {"participation": {"pigments": 10}, "goal": {"metric": "largest", "threshold": 9, "reward": {"gallery_tokens": 4}},
                 "top": [{"rank_max": 3, "reward": {"gallery_tokens": 8}}]}}'),
  ('palette-festival-template', 'Palette Festival', 'palette_festival',
   'A seasonal celebration of color: publish a mural during the festival for bonus Pigments.', 'draft',
   '{"rewards": {"participation": {"pigments": 8}}}')
on conflict (key) do nothing;
