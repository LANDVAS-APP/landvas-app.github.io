-- v0.9.3 Every Estate becomes a hub of games: four more minigames each, on their own stands round the world
-- (like the arcade's cabinets). They pay out the same way as the signature game (same drops, caps and Ink), open as
-- the place levels up (1, 2, 4, 6), and come in a fixed order (the signature game is order 0).
do $$
declare v jsonb; k record; sig jsonb;
begin
  select value into v from public.game_config where key = 'realms';
  for k in select * from (values
  ('atelier', 'fill', 'Fill Frenzy', '🎨', 'Paint by numbers against the clock: pick a colour and fill every tile with its number.', 1, 1),
  ('atelier', 'levelit', 'Level It', '🖼️', 'Gusts swing the painting on its nail — nudge it back and keep it hanging perfectly straight.', 2, 2),
  ('atelier', 'forgery', 'Spot the Forgery', '🔍', 'The bottom painting is a fake. Find the three things the forger got wrong.', 3, 4),
  ('atelier', 'splat', 'Splat Catch', '🪣', 'Catch the paint drops that match your bucket — and keep up when it changes colour.', 4, 6),
  ('reserve', 'safari', 'Photo Safari', '📷', 'Snap the shutter when an animal is right in the frame. Rare ones are worth a fortune.', 1, 1),
  ('reserve', 'tracks', 'Track Reader', '🐾', 'Watch the trail of prints appear, then walk it back from memory.', 2, 2),
  ('reserve', 'rivercross', 'River Crossing', '🐸', 'Hop up the river on logs and lily pads all the way to the far bank.', 3, 4),
  ('reserve', 'feeding', 'Feeding Time', '🥕', 'Every animal wants something different — give each one the right food before it gets grumpy.', 4, 6),
  ('ranch', 'barrel', 'Barrel Race', '🏇', 'Weave round the barrels on the side the arrows say, faster and faster.', 1, 1),
  ('ranch', 'lasso', 'Lasso Toss', '🤠', 'Aim where the calf is going and throw your loop. The bull is worth the most.', 2, 2),
  ('ranch', 'haystack', 'Haystack Hunt', '🌾', 'A golden egg hides in the hay. Each haystack tells you how far away it is.', 3, 4),
  ('ranch', 'corral', 'Corral Count', '🐑', 'The herd stampedes past — count just the ones you’re asked for.', 4, 6),
  ('exchange', 'change', 'Coin Counter', '🪙', 'Give each customer their exact change. Fewer coins and faster hands mean bigger tips.', 1, 1),
  ('exchange', 'auction', 'Going, Going…', '🔨', 'Outbid the rival at the auction — but only win lots for less than they’re worth.', 2, 2),
  ('exchange', 'briefcase', 'Briefcase Shuffle', '💼', 'The cash goes in one case and the cases shuffle. Follow it.', 3, 4),
  ('exchange', 'contracts', 'Contract Rush', '📝', 'Sign the deals that make money, shred the ones that don’t. Mind the small print.', 4, 6),
  ('boardwalk', 'whack', 'Whack-a-Crab', '🦀', 'Bop the crabs as they pop out of the sand. Lobsters pay triple — never bop a starfish.', 1, 1),
  ('boardwalk', 'striker', 'High Striker', '🔔', 'Swing the mallet right at the peak of the gauge to ring the bell.', 2, 2),
  ('boardwalk', 'watergun', 'Water Gun Race', '🔫', 'Keep your stream on the moving target and pop your balloon before the rivals.', 3, 4),
  ('boardwalk', 'darts', 'Balloon Darts', '🎈', 'Throw darts in an arc at the balloons drifting up. Gold ones pay most.', 4, 6),
  ('gemheart', 'gemswap', 'Gem Swap', '💎', 'Swap neighbouring gems to make rows of three. Cascades pay big.', 1, 1),
  ('gemheart', 'rails', 'Rail Switch', '🛤️', 'Flip the points so every cart rolls into the bin of its colour.', 2, 2),
  ('gemheart', 'geode', 'Geode Crack', '🪨', 'Strike just as the ring closes on the weak spot to crack the geode open.', 3, 4),
  ('gemheart', 'lamp', 'Lamp in the Dark', '🔦', 'Sweep your lamp through the dark cave and grab the gems before the oil runs out.', 4, 6),
  ('skyport', 'cloudhop', 'Cloud Hop', '☁️', 'Bounce up from cloud to cloud — some puff away under you.', 1, 1),
  ('skyport', 'cargo', 'Cargo Drop', '📦', 'Drop crates from the airship onto the moving landing pads. Mind the wind.', 2, 2),
  ('skyport', 'windswipe', 'Wind Swipe', '🧭', 'Swipe the way the wind blows — and watch for the gold vane that points the other way.', 3, 4),
  ('skyport', 'postbird', 'Postbird', '🕊️', 'Flap your letter through the gaps in the cloud walls.', 4, 6),
  ('foundry', 'pour', 'Hot Pour', '🫗', 'Fill each mould on the belt to the line — overflow and it’s scrap.', 1, 1),
  ('foundry', 'gears', 'Gear Train', '⚙️', 'Pick gears to make the last one spin at exactly the target speed.', 2, 2),
  ('foundry', 'rivets', 'Rivet Rush', '🔨', 'Hammer each rivet while it glows orange — not too cold, not too hot.', 3, 4),
  ('foundry', 'bellows', 'Bellows', '🔥', 'Pump the bellows to keep the furnace inside the drifting heat band.', 4, 6),
  ('foodhall', 'noodles', 'Noodle Pull', '🍜', 'Pull up and down on the beat to stretch the noodles thinner and thinner.', 1, 1),
  ('foodhall', 'dumpling', 'Dumpling Pleat', '🥟', 'Pinch the pleats in order round the dumpling before it goes cold.', 2, 2),
  ('foodhall', 'bubbletea', 'Bubble Tea', '🧋', 'Build each drink layer by layer, exactly as the ticket says.', 3, 4),
  ('foodhall', 'spices', 'Spice Pairs', '🌶️', 'Flip the spice jars and match the pairs from memory.', 4, 6),
  ('citadel', 'traprun', 'Trap Run', '🏃', 'Jump the spikes and slide under the blades in the citadel’s trap corridor.', 1, 1),
  ('citadel', 'torchmaze', 'Torch Maze', '🕯️', 'Find the door out of the dark maze before your torch burns out.', 2, 2),
  ('citadel', 'potions', 'Potion Mix', '🧪', 'Drip red, yellow and blue until your cauldron matches the potion.', 3, 4),
  ('citadel', 'volley', 'Arrow Volley', '🏹', 'Loose arrows at the goblins storming the wall — lead your shots.', 4, 6),
  ('colosseum', 'parry', 'Parry', '🛡️', 'Blades strike from every side — swipe toward each one as it lands.', 1, 1),
  ('colosseum', 'chariot', 'Chariot Race', '🐎', 'Switch lanes to dodge rocks and rivals, and grab the laurels.', 2, 2),
  ('colosseum', 'crowdwave', 'Crowd Wave', '🙌', 'Tap each stand just as the wave reaches it to get the crowd on their feet.', 3, 4),
  ('colosseum', 'shieldwall', 'Shield Wall', '🪖', 'Raise the shields under the falling spears — but shields tire.', 4, 6)
  ) t(kind, id, name, emoji, blurb, ord, lvl) loop
    -- copy the signature game's payout rules, then give it its own name and place in the order
    select value into sig from jsonb_each(v -> 'kinds' -> k.kind -> 'games') where coalesce((value ->> 'order')::int, 0) = 0 limit 1;
    if sig is null then raise exception 'estate games: % has no signature game', k.kind; end if;
    v := jsonb_set(v, array['kinds', k.kind, 'games', k.id],
      sig || jsonb_build_object('name', k.name, 'emoji', k.emoji, 'blurb', k.blurb, 'order', k.ord, 'level', k.lvl, 'min_seconds', 12, 'max_score', 1200, 'per_second', 40));
  end loop;
  update public.game_config set value = v, updated_at = now() where key = 'realms';
end $$;
