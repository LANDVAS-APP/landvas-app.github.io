-- v0.6 Five new plot types, each with its own world, progression, collection and signature minigame, all running on
-- one shared engine ("realms"):
--   ⛏️ Crystal Mine       dig down through six cave zones for ore, gems and fossils        (game: Deep Dig)
--   ☁️ Sky Island          grow a floating island and spot sky creatures                    (game: Sky Glide)
--   🛠️ Inventor's Workshop machines, parts and gadgets to invent                            (game: Assembly Line)
--   🍳 Restaurant          suppliers, dishes and a food cart that grows into a rooftop place (game: Order Up!)
--   ⚔️ Dungeon             minions, loot and six floors down to the dragon                  (game: Dungeon Dash)
-- Every one works the same way underneath:
--   * resources (six tiers) and a currency of its own; sell resources at the market for the currency
--   * producers (a crew and machines) that make resources every minute, even while you're away (up to a few hours)
--   * upgrades (better minigame hauls, more rare finds, faster producers, longer while-away time)
--   * recipes that turn resources into things worth more (bars, dishes, gadgets, potions…)
--   * a collection book of rare finds (fossils, sky creatures, blueprints, critics' awards, legendary loot) found by
--     playing; the first find of an epic or legendary one pays a little Ink
--   * levels from everything you do there: each one unlocks a new zone of the place (and new producers, resources,
--     recipes and finds), and pays a little Ink
--   * a signature minigame anyone can play (free, skill-based, with anti-cheat limits like the arcade's); visitors'
--     hauls give the owner a 10% cut; a daily bonus with a streak; Ink capped a day per plot type.
-- Switching a plot to one of these keeps everything (each plot keeps its progress for every type it's been).

insert into public.plot_kinds (id, name, description, sort) values
  ('mine', 'Crystal Mine', 'Dig down through glowing caves for ore, gems and fossils.', 5),
  ('sky', 'Sky Island', 'Grow a floating island in the clouds and spot sky creatures.', 6),
  ('workshop', 'Inventor’s Workshop', 'Build machines, make parts and invent gadgets.', 7),
  ('diner', 'Restaurant', 'Cook dishes and grow a food cart into a rooftop restaurant.', 8),
  ('dungeon', 'Dungeon', 'Delve six floors down, battle monsters and haul treasure.', 9)
on conflict (id) do nothing;

insert into public.game_config (key, value, description) values ('realms', $cfg${
 "enabled": true,
 "daily_cap": 120,
 "offline_hours": 8,
 "visitor_share": 0.1,
 "level_ink": 3,
 "level": {
  "base": 100,
  "growth": 1.28,
  "max": 40
 },
 "daily_bonus": {
  "currency": 30,
  "per_streak": 10,
  "max_streak": 7,
  "ink": 2
 },
 "rarity_weight": {
  "common": 60,
  "uncommon": 25,
  "rare": 10,
  "epic": 4,
  "legendary": 1
 },
 "kinds": {
  "mine": {
   "name": "Crystal Mine",
   "emoji": "⛏️",
   "color": "#7C5CFF",
   "currency": "gold",
   "resources": {
    "gold": {
     "name": "Gold",
     "emoji": "🪙",
     "currency": true
    },
    "stone": {
     "name": "Stone",
     "emoji": "🪨",
     "sell": 1,
     "tier": 1,
     "level": 1
    },
    "copper": {
     "name": "Copper ore",
     "emoji": "🟠",
     "sell": 3,
     "tier": 2,
     "level": 3
    },
    "iron": {
     "name": "Iron ore",
     "emoji": "⚫",
     "sell": 8,
     "tier": 3,
     "level": 6
    },
    "silver": {
     "name": "Silver ore",
     "emoji": "⚪",
     "sell": 20,
     "tier": 4,
     "level": 10
    },
    "crystal": {
     "name": "Crystal",
     "emoji": "🔮",
     "sell": 50,
     "tier": 5,
     "level": 15
    },
    "gem": {
     "name": "Rare gem",
     "emoji": "💎",
     "sell": 140,
     "tier": 6,
     "level": 22
    },
    "copperbar": {
     "name": "Copper bar",
     "emoji": "🧱",
     "sell": 26,
     "made": true,
     "level": 4
    },
    "ironbar": {
     "name": "Iron bar",
     "emoji": "🔧",
     "sell": 65,
     "made": true,
     "level": 7
    },
    "silverbar": {
     "name": "Silver bar",
     "emoji": "🥈",
     "sell": 156,
     "made": true,
     "level": 11
    },
    "lens": {
     "name": "Crystal lens",
     "emoji": "🔍",
     "sell": 323,
     "made": true,
     "level": 16
    },
    "ring": {
     "name": "Crystal ring",
     "emoji": "💍",
     "sell": 306,
     "made": true,
     "level": 16
    },
    "crown": {
     "name": "Mountain crown",
     "emoji": "👑",
     "sell": 1309,
     "made": true,
     "level": 23
    }
   },
   "zones": [
    {
     "id": "topsoil",
     "name": "Topsoil Tunnels",
     "level": 1,
     "blurb": "Roots, rubble and the first glint of copper."
    },
    {
     "id": "copper",
     "name": "Copper Caves",
     "level": 3,
     "blurb": "Rusty-orange seams and dripping stalactites."
    },
    {
     "id": "glow",
     "name": "Glowshroom Cavern",
     "level": 6,
     "blurb": "Giant mushrooms light the way with a blue glow."
    },
    {
     "id": "grotto",
     "name": "Crystal Grotto",
     "level": 10,
     "blurb": "Walls bristling with violet crystals."
    },
    {
     "id": "magma",
     "name": "Magma Depths",
     "level": 15,
     "blurb": "Lava rivers and red-hot rock. Mind your boots."
    },
    {
     "id": "core",
     "name": "Ancient Core",
     "level": 22,
     "blurb": "The glittering heart of the world."
    }
   ],
   "producers": {
    "miner": {
     "name": "Miner",
     "emoji": "👷",
     "blurb": "Chips away at the stone all day.",
     "order": 1,
     "level": 1,
     "makes": {
      "stone": 1.5
     },
     "cost": {
      "gold": 15
     },
     "growth": 1.15,
     "max": 100
    },
    "cart": {
     "name": "Mine cart",
     "emoji": "🛒",
     "blurb": "Hauls copper up the rails.",
     "order": 2,
     "level": 3,
     "makes": {
      "copper": 2
     },
     "cost": {
      "gold": 60
     },
     "growth": 1.15,
     "max": 100
    },
    "drill": {
     "name": "Drill rig",
     "emoji": "🔩",
     "blurb": "Bores through iron seams.",
     "order": 3,
     "level": 6,
     "makes": {
      "iron": 3
     },
     "cost": {
      "gold": 250
     },
     "growth": 1.15,
     "max": 100
    },
    "bore": {
     "name": "Steam bore",
     "emoji": "🚂",
     "blurb": "Thunders through silver veins.",
     "order": 4,
     "level": 10,
     "makes": {
      "silver": 4.5
     },
     "cost": {
      "gold": 900
     },
     "growth": 1.15,
     "max": 100
    },
    "harvester": {
     "name": "Crystal harvester",
     "emoji": "🔦",
     "blurb": "Gently snaps crystals free.",
     "order": 5,
     "level": 15,
     "makes": {
      "crystal": 6
     },
     "cost": {
      "gold": 3000
     },
     "growth": 1.15,
     "max": 100
    },
    "laser": {
     "name": "Gem laser",
     "emoji": "🔴",
     "blurb": "Cuts rare gems out of the core.",
     "order": 6,
     "level": 22,
     "makes": {
      "gem": 7
     },
     "cost": {
      "gold": 10000
     },
     "growth": 1.15,
     "max": 100
    }
   },
   "upgrades": {
    "pick": {
     "name": "Pickaxe",
     "emoji": "⛏️",
     "blurb": "+15% from every dig",
     "order": 1,
     "effect": {
      "game_mult": 0.15
     },
     "max": 10,
     "cost": {
      "gold": 50
     },
     "growth": 2.0
    },
    "lamp": {
     "name": "Miner’s lamp",
     "emoji": "🔦",
     "blurb": "+20% chance of fossils and relics",
     "order": 2,
     "effect": {
      "rare_mult": 0.2
     },
     "max": 10,
     "cost": {
      "gold": 80
     },
     "growth": 2.0
    },
    "rails": {
     "name": "Better rails",
     "emoji": "🛤️",
     "blurb": "+10% from your crew and machines",
     "order": 3,
     "effect": {
      "prod_mult": 0.1
     },
     "max": 15,
     "cost": {
      "gold": 100
     },
     "growth": 1.8
    },
    "pack": {
     "name": "Big backpack",
     "emoji": "🎒",
     "blurb": "+2 hours of digging while you’re away",
     "order": 4,
     "effect": {
      "offline_hours": 2
     },
     "max": 4,
     "cost": {
      "gold": 300
     },
     "growth": 3.0
    }
   },
   "recipes": {
    "copperbar": {
     "name": "Copper bar",
     "emoji": "🧱",
     "order": 1,
     "level": 4,
     "in": {
      "copper": 5
     },
     "out": {
      "copperbar": 1
     },
     "xp": 4
    },
    "ironbar": {
     "name": "Iron bar",
     "emoji": "🔧",
     "order": 2,
     "level": 7,
     "in": {
      "iron": 4,
      "stone": 6
     },
     "out": {
      "ironbar": 1
     },
     "xp": 10
    },
    "silverbar": {
     "name": "Silver bar",
     "emoji": "🥈",
     "order": 3,
     "level": 11,
     "in": {
      "silver": 4,
      "copper": 4
     },
     "out": {
      "silverbar": 1
     },
     "xp": 23
    },
    "lens": {
     "name": "Crystal lens",
     "emoji": "🔍",
     "order": 4,
     "level": 16,
     "in": {
      "crystal": 3,
      "silver": 2
     },
     "out": {
      "lens": 1
     },
     "xp": 48
    },
    "ring": {
     "name": "Crystal ring",
     "emoji": "💍",
     "order": 5,
     "level": 16,
     "in": {
      "crystal": 2,
      "silver": 4
     },
     "out": {
      "ring": 1
     },
     "xp": 45
    },
    "crown": {
     "name": "Mountain crown",
     "emoji": "👑",
     "order": 6,
     "level": 23,
     "in": {
      "gem": 3,
      "crystal": 5,
      "silver": 5
     },
     "out": {
      "crown": 1
     },
     "xp": 192
    }
   },
   "finds": {
    "ammonite": {
     "name": "Ammonite",
     "emoji": "🐚",
     "rarity": "common",
     "level": 1,
     "order": 1,
     "ink": 0
    },
    "trilobite": {
     "name": "Trilobite",
     "emoji": "🪲",
     "rarity": "common",
     "level": 1,
     "order": 2,
     "ink": 0
    },
    "coin": {
     "name": "Old miner’s coin",
     "emoji": "🪙",
     "rarity": "uncommon",
     "level": 1,
     "order": 3,
     "ink": 0
    },
    "geode": {
     "name": "Geode",
     "emoji": "🥚",
     "rarity": "uncommon",
     "level": 3,
     "order": 4,
     "ink": 0
    },
    "tooth": {
     "name": "Dino tooth",
     "emoji": "🦷",
     "rarity": "rare",
     "level": 3,
     "order": 5,
     "ink": 0
    },
    "lantern": {
     "name": "Lost lantern",
     "emoji": "🏮",
     "rarity": "uncommon",
     "level": 6,
     "order": 6,
     "ink": 0
    },
    "amber": {
     "name": "Bug in amber",
     "emoji": "🍯",
     "rarity": "rare",
     "level": 6,
     "order": 7,
     "ink": 0
    },
    "skull": {
     "name": "Crystal skull",
     "emoji": "💀",
     "rarity": "epic",
     "level": 10,
     "order": 8,
     "ink": 12
    },
    "meteor": {
     "name": "Meteorite",
     "emoji": "☄️",
     "rarity": "rare",
     "level": 10,
     "order": 9,
     "ink": 0
    },
    "idol": {
     "name": "Golden idol",
     "emoji": "🗿",
     "rarity": "epic",
     "level": 15,
     "order": 10,
     "ink": 12
    },
    "heart": {
     "name": "Magma heart",
     "emoji": "❤️‍🔥",
     "rarity": "epic",
     "level": 15,
     "order": 11,
     "ink": 12
    },
    "egg": {
     "name": "Dragon egg",
     "emoji": "🐉",
     "rarity": "legendary",
     "level": 22,
     "order": 12,
     "ink": 20
    }
   },
   "games": {
    "dig": {
     "name": "Deep Dig",
     "emoji": "⛏️",
     "blurb": "Tap your way down through the rock before your lamp runs out. Ore, gems and the odd fossil.",
     "level": 1,
     "min_seconds": 15,
     "max_score": 1500,
     "per_second": 40,
     "xp_per_point": 0.5,
     "points_per_ink": 60,
     "max_ink": 8,
     "finds_every": 100,
     "find_chance": 0.3,
     "drops": [
      {
       "res": "stone",
       "per_point": 0.3,
       "level": 1
      },
      {
       "res": "copper",
       "per_point": 0.12,
       "level": 3
      },
      {
       "res": "iron",
       "per_point": 0.05,
       "level": 6
      },
      {
       "res": "silver",
       "per_point": 0.02,
       "level": 10
      },
      {
       "res": "crystal",
       "per_point": 0.008,
       "level": 15
      },
      {
       "res": "gem",
       "per_point": 0.003,
       "level": 22
      }
     ]
    }
   }
  },
  "sky": {
   "name": "Sky Island",
   "emoji": "☁️",
   "color": "#38BDF8",
   "currency": "starlight",
   "resources": {
    "starlight": {
     "name": "Starlight",
     "emoji": "✨",
     "currency": true
    },
    "fluff": {
     "name": "Cloud fluff",
     "emoji": "☁️",
     "sell": 1,
     "tier": 1,
     "level": 1
    },
    "feather": {
     "name": "Feather",
     "emoji": "🪶",
     "sell": 3,
     "tier": 2,
     "level": 3
    },
    "wind": {
     "name": "Wind charge",
     "emoji": "🌬️",
     "sell": 8,
     "tier": 3,
     "level": 6
    },
    "rainbow": {
     "name": "Rainbow drop",
     "emoji": "🌈",
     "sell": 20,
     "tier": 4,
     "level": 10
    },
    "sunstone": {
     "name": "Sunstone",
     "emoji": "☀️",
     "sell": 50,
     "tier": 5,
     "level": 15
    },
    "moonpearl": {
     "name": "Moon pearl",
     "emoji": "🌙",
     "sell": 140,
     "tier": 6,
     "level": 22
    },
    "cushion": {
     "name": "Cloud cushion",
     "emoji": "🛋️",
     "sell": 14,
     "made": true,
     "level": 2
    },
    "kite": {
     "name": "Feather kite",
     "emoji": "🪁",
     "sell": 31,
     "made": true,
     "level": 4
    },
    "jar": {
     "name": "Wind in a jar",
     "emoji": "🫙",
     "sell": 70,
     "made": true,
     "level": 7
    },
    "glass": {
     "name": "Rainbow glass",
     "emoji": "🔷",
     "sell": 129,
     "made": true,
     "level": 11
    },
    "lamp": {
     "name": "Sun lantern",
     "emoji": "🏮",
     "sell": 272,
     "made": true,
     "level": 16
    },
    "airship": {
     "name": "Airship engine",
     "emoji": "🎈",
     "sell": 813,
     "made": true,
     "level": 23
    }
   },
   "zones": [
    {
     "id": "isle",
     "name": "Little Isle",
     "level": 1,
     "blurb": "A patch of grass floating on the clouds."
    },
    {
     "id": "meadow",
     "name": "Cloud Meadow",
     "level": 3,
     "blurb": "Puffy fields and wildflowers drift up alongside."
    },
    {
     "id": "falls",
     "name": "Rainbow Falls",
     "level": 6,
     "blurb": "Water tumbles off the edge in a rainbow."
    },
    {
     "id": "spire",
     "name": "Windspire",
     "level": 10,
     "blurb": "A tall rock spire where the winds gather."
    },
    {
     "id": "gardens",
     "name": "Sunreach Gardens",
     "level": 15,
     "blurb": "Golden gardens soaking up the sun."
    },
    {
     "id": "peak",
     "name": "Starlit Peak",
     "level": 22,
     "blurb": "The summit, close enough to touch the stars."
    }
   ],
   "producers": {
    "spinner": {
     "name": "Cloud spinner",
     "emoji": "🌀",
     "blurb": "Spins fluff out of passing clouds.",
     "order": 1,
     "level": 1,
     "makes": {
      "fluff": 1.5
     },
     "cost": {
      "starlight": 15
     },
     "growth": 1.15,
     "max": 100
    },
    "nest": {
     "name": "Bird nest",
     "emoji": "🪺",
     "blurb": "Sky birds leave feathers behind.",
     "order": 2,
     "level": 3,
     "makes": {
      "feather": 2
     },
     "cost": {
      "starlight": 60
     },
     "growth": 1.15,
     "max": 100
    },
    "windmill": {
     "name": "Windmill",
     "emoji": "🌬️",
     "blurb": "Bottles the breeze.",
     "order": 3,
     "level": 6,
     "makes": {
      "wind": 3
     },
     "cost": {
      "starlight": 250
     },
     "growth": 1.15,
     "max": 100
    },
    "fountain": {
     "name": "Rainbow fountain",
     "emoji": "⛲",
     "blurb": "Catches rainbow drops.",
     "order": 4,
     "level": 10,
     "makes": {
      "rainbow": 4.5
     },
     "cost": {
      "starlight": 900
     },
     "growth": 1.15,
     "max": 100
    },
    "mirror": {
     "name": "Sun mirror",
     "emoji": "🪞",
     "blurb": "Focuses sunlight into sunstone.",
     "order": 5,
     "level": 15,
     "makes": {
      "sunstone": 6
     },
     "cost": {
      "starlight": 3000
     },
     "growth": 1.15,
     "max": 100
    },
    "bell": {
     "name": "Moon bell",
     "emoji": "🔔",
     "blurb": "Rings down moon pearls at night.",
     "order": 6,
     "level": 22,
     "makes": {
      "moonpearl": 7
     },
     "cost": {
      "starlight": 10000
     },
     "growth": 1.15,
     "max": 100
    }
   },
   "upgrades": {
    "wings": {
     "name": "Glider wings",
     "emoji": "🪽",
     "blurb": "+15% from every glide",
     "order": 1,
     "effect": {
      "game_mult": 0.15
     },
     "max": 10,
     "cost": {
      "starlight": 50
     },
     "growth": 2.0
    },
    "scope": {
     "name": "Sky telescope",
     "emoji": "🔭",
     "blurb": "+20% chance to spot sky creatures",
     "order": 2,
     "effect": {
      "rare_mult": 0.2
     },
     "max": 10,
     "cost": {
      "starlight": 80
     },
     "growth": 2.0
    },
    "sails": {
     "name": "Breeze sails",
     "emoji": "⛵",
     "blurb": "+10% from your island",
     "order": 3,
     "effect": {
      "prod_mult": 0.1
     },
     "max": 15,
     "cost": {
      "starlight": 100
     },
     "growth": 1.8
    },
    "hammock": {
     "name": "Cloud hammock",
     "emoji": "🛌",
     "blurb": "+2 hours of island time while you’re away",
     "order": 4,
     "effect": {
      "offline_hours": 2
     },
     "max": 4,
     "cost": {
      "starlight": 300
     },
     "growth": 3.0
    }
   },
   "recipes": {
    "cushion": {
     "name": "Cloud cushion",
     "emoji": "🛋️",
     "order": 1,
     "level": 2,
     "in": {
      "fluff": 8
     },
     "out": {
      "cushion": 1
     },
     "xp": 2
    },
    "kite": {
     "name": "Feather kite",
     "emoji": "🪁",
     "order": 2,
     "level": 4,
     "in": {
      "feather": 4,
      "fluff": 6
     },
     "out": {
      "kite": 1
     },
     "xp": 4
    },
    "jar": {
     "name": "Wind in a jar",
     "emoji": "🫙",
     "order": 3,
     "level": 7,
     "in": {
      "wind": 4,
      "feather": 3
     },
     "out": {
      "jar": 1
     },
     "xp": 10
    },
    "glass": {
     "name": "Rainbow glass",
     "emoji": "🔷",
     "order": 4,
     "level": 11,
     "in": {
      "rainbow": 3,
      "wind": 2
     },
     "out": {
      "glass": 1
     },
     "xp": 19
    },
    "lamp": {
     "name": "Sun lantern",
     "emoji": "🏮",
     "order": 5,
     "level": 16,
     "in": {
      "sunstone": 2,
      "rainbow": 3
     },
     "out": {
      "lamp": 1
     },
     "xp": 40
    },
    "airship": {
     "name": "Airship engine",
     "emoji": "🎈",
     "order": 6,
     "level": 23,
     "in": {
      "moonpearl": 2,
      "sunstone": 3,
      "wind": 6
     },
     "out": {
      "airship": 1
     },
     "xp": 120
    }
   },
   "finds": {
    "puffbird": {
     "name": "Puffbird",
     "emoji": "🐦",
     "rarity": "common",
     "level": 1,
     "order": 1,
     "ink": 0
    },
    "drifter": {
     "name": "Dandelion drifter",
     "emoji": "🌼",
     "rarity": "common",
     "level": 1,
     "order": 2,
     "ink": 0
    },
    "kitecat": {
     "name": "Kite cat",
     "emoji": "🐱",
     "rarity": "uncommon",
     "level": 1,
     "order": 3,
     "ink": 0
    },
    "moth": {
     "name": "Rainbow moth",
     "emoji": "🦋",
     "rarity": "uncommon",
     "level": 3,
     "order": 4,
     "ink": 0
    },
    "jelly": {
     "name": "Sky jelly",
     "emoji": "🪼",
     "rarity": "rare",
     "level": 3,
     "order": 5,
     "ink": 0
    },
    "ram": {
     "name": "Cloud ram",
     "emoji": "🐏",
     "rarity": "uncommon",
     "level": 6,
     "order": 6,
     "ink": 0
    },
    "hawk": {
     "name": "Thunder hawk",
     "emoji": "🦅",
     "rarity": "rare",
     "level": 6,
     "order": 7,
     "ink": 0
    },
    "whale": {
     "name": "Cloud whale",
     "emoji": "🐋",
     "rarity": "epic",
     "level": 10,
     "order": 8,
     "ink": 12
    },
    "serpent": {
     "name": "Wind serpent",
     "emoji": "🐍",
     "rarity": "rare",
     "level": 10,
     "order": 9,
     "ink": 0
    },
    "fox": {
     "name": "Star fox",
     "emoji": "🦊",
     "rarity": "epic",
     "level": 15,
     "order": 10,
     "ink": 12
    },
    "turtle": {
     "name": "Sky turtle",
     "emoji": "🐢",
     "rarity": "epic",
     "level": 15,
     "order": 11,
     "ink": 12
    },
    "phoenix": {
     "name": "Sun phoenix",
     "emoji": "🔥",
     "rarity": "legendary",
     "level": 22,
     "order": 12,
     "ink": 20
    }
   },
   "games": {
    "glide": {
     "name": "Sky Glide",
     "emoji": "🪂",
     "blurb": "Glide between the clouds catching starlight. Hold to climb, let go to dive, and steer clear of the storm clouds.",
     "level": 1,
     "min_seconds": 15,
     "max_score": 1500,
     "per_second": 40,
     "xp_per_point": 0.5,
     "points_per_ink": 60,
     "max_ink": 8,
     "finds_every": 100,
     "find_chance": 0.3,
     "drops": [
      {
       "res": "fluff",
       "per_point": 0.3,
       "level": 1
      },
      {
       "res": "feather",
       "per_point": 0.12,
       "level": 3
      },
      {
       "res": "wind",
       "per_point": 0.05,
       "level": 6
      },
      {
       "res": "rainbow",
       "per_point": 0.02,
       "level": 10
      },
      {
       "res": "sunstone",
       "per_point": 0.008,
       "level": 15
      },
      {
       "res": "moonpearl",
       "per_point": 0.003,
       "level": 22
      }
     ]
    }
   }
  },
  "workshop": {
   "name": "Inventor’s Workshop",
   "emoji": "🛠️",
   "color": "#F59E0B",
   "currency": "sparks",
   "resources": {
    "sparks": {
     "name": "Sparks",
     "emoji": "⚡",
     "currency": true
    },
    "scrap": {
     "name": "Scrap metal",
     "emoji": "🥫",
     "sell": 1,
     "tier": 1,
     "level": 1
    },
    "gear": {
     "name": "Gear",
     "emoji": "⚙️",
     "sell": 3,
     "tier": 2,
     "level": 3
    },
    "spring": {
     "name": "Spring",
     "emoji": "🌀",
     "sell": 8,
     "tier": 3,
     "level": 6
    },
    "wire": {
     "name": "Copper wire",
     "emoji": "🧵",
     "sell": 20,
     "tier": 4,
     "level": 10
    },
    "chip": {
     "name": "Circuit chip",
     "emoji": "💾",
     "sell": 50,
     "tier": 5,
     "level": 15
    },
    "core": {
     "name": "Fusion core",
     "emoji": "🔋",
     "sell": 140,
     "tier": 6,
     "level": 22
    },
    "mouse": {
     "name": "Wind-up mouse",
     "emoji": "🐭",
     "sell": 22,
     "made": true,
     "level": 4
    },
    "toaster": {
     "name": "Toaster bot",
     "emoji": "🤖",
     "sell": 71,
     "made": true,
     "level": 7
    },
    "jetpack": {
     "name": "Jetpack",
     "emoji": "🚀",
     "sell": 172,
     "made": true,
     "level": 11
    },
    "robopet": {
     "name": "Robo pet",
     "emoji": "🐕",
     "sell": 292,
     "made": true,
     "level": 16
    },
    "hover": {
     "name": "Hoverboard",
     "emoji": "🛹",
     "sell": 445,
     "made": true,
     "level": 16
    },
    "clock": {
     "name": "Time machine",
     "emoji": "⏰",
     "sell": 952,
     "made": true,
     "level": 23
    }
   },
   "zones": [
    {
     "id": "garage",
     "name": "The Garage",
     "level": 1,
     "blurb": "A cluttered garage and a dream."
    },
    {
     "id": "bench",
     "name": "Tinker’s Bench",
     "level": 3,
     "blurb": "Proper tools, at last."
    },
    {
     "id": "line",
     "name": "Assembly Line",
     "level": 6,
     "blurb": "Conveyor belts clank into life."
    },
    {
     "id": "lab",
     "name": "Robotics Lab",
     "level": 10,
     "blurb": "Robot arms and blinking lights."
    },
    {
     "id": "tesla",
     "name": "Tesla Tower",
     "level": 15,
     "blurb": "Lightning crackles between the coils."
    },
    {
     "id": "vault",
     "name": "Fusion Vault",
     "level": 22,
     "blurb": "The humming heart of invention."
    }
   ],
   "producers": {
    "collector": {
     "name": "Scrap collector",
     "emoji": "🧲",
     "blurb": "Magnets in scrap from the junkyard.",
     "order": 1,
     "level": 1,
     "makes": {
      "scrap": 1.5
     },
     "cost": {
      "sparks": 15
     },
     "growth": 1.15,
     "max": 100
    },
    "press": {
     "name": "Gear press",
     "emoji": "⚙️",
     "blurb": "Stamps out gears.",
     "order": 2,
     "level": 3,
     "makes": {
      "gear": 2
     },
     "cost": {
      "sparks": 60
     },
     "growth": 1.15,
     "max": 100
    },
    "coiler": {
     "name": "Spring coiler",
     "emoji": "🌀",
     "blurb": "Winds springs tight.",
     "order": 3,
     "level": 6,
     "makes": {
      "spring": 3
     },
     "cost": {
      "sparks": 250
     },
     "growth": 1.15,
     "max": 100
    },
    "spool": {
     "name": "Wire spool",
     "emoji": "🧵",
     "blurb": "Draws copper into wire.",
     "order": 4,
     "level": 10,
     "makes": {
      "wire": 4.5
     },
     "cost": {
      "sparks": 900
     },
     "growth": 1.15,
     "max": 100
    },
    "printer": {
     "name": "Circuit printer",
     "emoji": "🖨️",
     "blurb": "Prints circuit chips.",
     "order": 5,
     "level": 15,
     "makes": {
      "chip": 6
     },
     "cost": {
      "sparks": 3000
     },
     "growth": 1.15,
     "max": 100
    },
    "reactor": {
     "name": "Mini reactor",
     "emoji": "⚛️",
     "blurb": "Charges fusion cores.",
     "order": 6,
     "level": 22,
     "makes": {
      "core": 7
     },
     "cost": {
      "sparks": 10000
     },
     "growth": 1.15,
     "max": 100
    }
   },
   "upgrades": {
    "toolbox": {
     "name": "Deluxe toolbox",
     "emoji": "🧰",
     "blurb": "+15% from every shift on the line",
     "order": 1,
     "effect": {
      "game_mult": 0.15
     },
     "max": 10,
     "cost": {
      "sparks": 50
     },
     "growth": 2.0
    },
    "loupe": {
     "name": "Inventor’s loupe",
     "emoji": "🔎",
     "blurb": "+20% chance of rare blueprints",
     "order": 2,
     "effect": {
      "rare_mult": 0.2
     },
     "max": 10,
     "cost": {
      "sparks": 80
     },
     "growth": 2.0
    },
    "belts": {
     "name": "Faster belts",
     "emoji": "🏭",
     "blurb": "+10% from your machines",
     "order": 3,
     "effect": {
      "prod_mult": 0.1
     },
     "max": 15,
     "cost": {
      "sparks": 100
     },
     "growth": 1.8
    },
    "shift": {
     "name": "Night shift",
     "emoji": "🌙",
     "blurb": "+2 hours of building while you’re away",
     "order": 4,
     "effect": {
      "offline_hours": 2
     },
     "max": 4,
     "cost": {
      "sparks": 300
     },
     "growth": 3.0
    }
   },
   "recipes": {
    "mouse": {
     "name": "Wind-up mouse",
     "emoji": "🐭",
     "order": 1,
     "level": 4,
     "in": {
      "gear": 3,
      "scrap": 4
     },
     "out": {
      "mouse": 1
     },
     "xp": 3
    },
    "toaster": {
     "name": "Toaster bot",
     "emoji": "🤖",
     "order": 2,
     "level": 7,
     "in": {
      "spring": 3,
      "gear": 4,
      "scrap": 6
     },
     "out": {
      "toaster": 1
     },
     "xp": 10
    },
    "jetpack": {
     "name": "Jetpack",
     "emoji": "🚀",
     "order": 3,
     "level": 11,
     "in": {
      "wire": 3,
      "spring": 4,
      "gear": 3
     },
     "out": {
      "jetpack": 1
     },
     "xp": 25
    },
    "robopet": {
     "name": "Robo pet",
     "emoji": "🐕",
     "order": 4,
     "level": 16,
     "in": {
      "chip": 2,
      "wire": 3,
      "gear": 4
     },
     "out": {
      "robopet": 1
     },
     "xp": 43
    },
    "hover": {
     "name": "Hoverboard",
     "emoji": "🛹",
     "order": 5,
     "level": 16,
     "in": {
      "chip": 3,
      "wire": 4,
      "spring": 4
     },
     "out": {
      "hover": 1
     },
     "xp": 66
    },
    "clock": {
     "name": "Time machine",
     "emoji": "⏰",
     "order": 6,
     "level": 23,
     "in": {
      "core": 2,
      "chip": 4,
      "wire": 4
     },
     "out": {
      "clock": 1
     },
     "xp": 140
    }
   },
   "finds": {
    "bolt": {
     "name": "Lucky bolt",
     "emoji": "🔩",
     "rarity": "common",
     "level": 1,
     "order": 1,
     "ink": 0
    },
    "sketch": {
     "name": "Napkin sketch",
     "emoji": "📝",
     "rarity": "common",
     "level": 1,
     "order": 2,
     "ink": 0
    },
    "goggles": {
     "name": "Brass goggles",
     "emoji": "🥽",
     "rarity": "uncommon",
     "level": 1,
     "order": 3,
     "ink": 0
    },
    "magnet": {
     "name": "Horseshoe magnet",
     "emoji": "🧲",
     "rarity": "uncommon",
     "level": 3,
     "order": 4,
     "ink": 0
    },
    "bulb": {
     "name": "First light bulb",
     "emoji": "💡",
     "rarity": "rare",
     "level": 3,
     "order": 5,
     "ink": 0
    },
    "cog": {
     "name": "Golden cog",
     "emoji": "🏅",
     "rarity": "uncommon",
     "level": 6,
     "order": 6,
     "ink": 0
    },
    "plans": {
     "name": "Flying-machine plans",
     "emoji": "📜",
     "rarity": "rare",
     "level": 6,
     "order": 7,
     "ink": 0
    },
    "notebook": {
     "name": "Lost notebook",
     "emoji": "📓",
     "rarity": "epic",
     "level": 10,
     "order": 8,
     "ink": 12
    },
    "crystal": {
     "name": "Radio crystal",
     "emoji": "📻",
     "rarity": "rare",
     "level": 10,
     "order": 9,
     "ink": 0
    },
    "spring": {
     "name": "Perpetual spring",
     "emoji": "♾️",
     "rarity": "epic",
     "level": 15,
     "order": 10,
     "ink": 12
    },
    "brain": {
     "name": "Robot brain",
     "emoji": "🧠",
     "rarity": "epic",
     "level": 15,
     "order": 11,
     "ink": 12
    },
    "star": {
     "name": "Bottled star",
     "emoji": "🌟",
     "rarity": "legendary",
     "level": 22,
     "order": 12,
     "ink": 20
    }
   },
   "games": {
    "line": {
     "name": "Assembly Line",
     "emoji": "🏭",
     "blurb": "Parts zoom down the conveyor: drop each one in the right bin before it falls off the end.",
     "level": 1,
     "min_seconds": 15,
     "max_score": 1500,
     "per_second": 40,
     "xp_per_point": 0.5,
     "points_per_ink": 60,
     "max_ink": 8,
     "finds_every": 100,
     "find_chance": 0.3,
     "drops": [
      {
       "res": "scrap",
       "per_point": 0.3,
       "level": 1
      },
      {
       "res": "gear",
       "per_point": 0.12,
       "level": 3
      },
      {
       "res": "spring",
       "per_point": 0.05,
       "level": 6
      },
      {
       "res": "wire",
       "per_point": 0.02,
       "level": 10
      },
      {
       "res": "chip",
       "per_point": 0.008,
       "level": 15
      },
      {
       "res": "core",
       "per_point": 0.003,
       "level": 22
      }
     ]
    }
   }
  },
  "diner": {
   "name": "Restaurant",
   "emoji": "🍳",
   "color": "#EF4444",
   "currency": "tips",
   "resources": {
    "tips": {
     "name": "Tips",
     "emoji": "💵",
     "currency": true
    },
    "flour": {
     "name": "Flour",
     "emoji": "🌾",
     "sell": 1,
     "tier": 1,
     "level": 1
    },
    "egg": {
     "name": "Eggs",
     "emoji": "🥚",
     "sell": 3,
     "tier": 2,
     "level": 3
    },
    "cheese": {
     "name": "Cheese",
     "emoji": "🧀",
     "sell": 8,
     "tier": 3,
     "level": 6
    },
    "fish": {
     "name": "Fresh fish",
     "emoji": "🐟",
     "sell": 20,
     "tier": 4,
     "level": 10
    },
    "berry": {
     "name": "Berries",
     "emoji": "🍓",
     "sell": 50,
     "tier": 5,
     "level": 15
    },
    "truffle": {
     "name": "Truffle",
     "emoji": "🍄",
     "sell": 140,
     "tier": 6,
     "level": 22
    },
    "pancakes": {
     "name": "Pancake stack",
     "emoji": "🥞",
     "sell": 17,
     "made": true,
     "level": 4
    },
    "omelette": {
     "name": "Cheese omelette",
     "emoji": "🍳",
     "sell": 42,
     "made": true,
     "level": 7
    },
    "pizza": {
     "name": "Pizza",
     "emoji": "🍕",
     "sell": 65,
     "made": true,
     "level": 7
    },
    "tacos": {
     "name": "Fish tacos",
     "emoji": "🌮",
     "sell": 122,
     "made": true,
     "level": 11
    },
    "pie": {
     "name": "Berry pie",
     "emoji": "🥧",
     "sell": 275,
     "made": true,
     "level": 16
    },
    "feast": {
     "name": "Truffle feast",
     "emoji": "🍽️",
     "sell": 748,
     "made": true,
     "level": 23
    }
   },
   "zones": [
    {
     "id": "cart",
     "name": "Food Cart",
     "level": 1,
     "blurb": "A little cart and a big dream."
    },
    {
     "id": "diner",
     "name": "Corner Diner",
     "level": 3,
     "blurb": "Red booths and a jukebox."
    },
    {
     "id": "patio",
     "name": "Sunny Patio",
     "level": 6,
     "blurb": "Tables outside under fairy lights."
    },
    {
     "id": "bistro",
     "name": "Bistro",
     "level": 10,
     "blurb": "Candles, checked tablecloths and a wine rack."
    },
    {
     "id": "hall",
     "name": "Grand Dining Hall",
     "level": 15,
     "blurb": "Chandeliers and a string quartet."
    },
    {
     "id": "rooftop",
     "name": "Rooftop Restaurant",
     "level": 22,
     "blurb": "Dinner above the city lights."
    }
   ],
   "producers": {
    "mill": {
     "name": "Flour mill",
     "emoji": "🌾",
     "blurb": "Grinds flour all day.",
     "order": 1,
     "level": 1,
     "makes": {
      "flour": 1.5
     },
     "cost": {
      "tips": 15
     },
     "growth": 1.15,
     "max": 100
    },
    "coop": {
     "name": "Hen house",
     "emoji": "🐔",
     "blurb": "Happy hens, fresh eggs.",
     "order": 2,
     "level": 3,
     "makes": {
      "egg": 2
     },
     "cost": {
      "tips": 60
     },
     "growth": 1.15,
     "max": 100
    },
    "dairy": {
     "name": "Cheese cellar",
     "emoji": "🧀",
     "blurb": "Wheels of cheese, aging nicely.",
     "order": 3,
     "level": 6,
     "makes": {
      "cheese": 3
     },
     "cost": {
      "tips": 250
     },
     "growth": 1.15,
     "max": 100
    },
    "boat": {
     "name": "Fishing boat",
     "emoji": "🛶",
     "blurb": "Back each morning with the catch.",
     "order": 4,
     "level": 10,
     "makes": {
      "fish": 4.5
     },
     "cost": {
      "tips": 900
     },
     "growth": 1.15,
     "max": 100
    },
    "garden": {
     "name": "Berry garden",
     "emoji": "🫐",
     "blurb": "Rows of ripe berries.",
     "order": 5,
     "level": 15,
     "makes": {
      "berry": 6
     },
     "cost": {
      "tips": 3000
     },
     "growth": 1.15,
     "max": 100
    },
    "pig": {
     "name": "Truffle pig",
     "emoji": "🐖",
     "blurb": "Snuffles out truffles.",
     "order": 6,
     "level": 22,
     "makes": {
      "truffle": 7
     },
     "cost": {
      "tips": 10000
     },
     "growth": 1.15,
     "max": 100
    }
   },
   "upgrades": {
    "knife": {
     "name": "Chef’s knife",
     "emoji": "🔪",
     "blurb": "+15% tips from every service",
     "order": 1,
     "effect": {
      "game_mult": 0.15
     },
     "max": 10,
     "cost": {
      "tips": 50
     },
     "growth": 2.0
    },
    "book": {
     "name": "Secret cookbook",
     "emoji": "📖",
     "blurb": "+20% chance of a food critic’s award",
     "order": 2,
     "effect": {
      "rare_mult": 0.2
     },
     "max": 10,
     "cost": {
      "tips": 80
     },
     "growth": 2.0
    },
    "staff": {
     "name": "Kitchen staff",
     "emoji": "👩‍🍳",
     "blurb": "+10% from your suppliers",
     "order": 3,
     "effect": {
      "prod_mult": 0.1
     },
     "max": 15,
     "cost": {
      "tips": 100
     },
     "growth": 1.8
    },
    "fridge": {
     "name": "Walk-in fridge",
     "emoji": "🧊",
     "blurb": "+2 hours of supplies while you’re away",
     "order": 4,
     "effect": {
      "offline_hours": 2
     },
     "max": 4,
     "cost": {
      "tips": 300
     },
     "growth": 3.0
    }
   },
   "recipes": {
    "pancakes": {
     "name": "Pancake stack",
     "emoji": "🥞",
     "order": 1,
     "level": 4,
     "in": {
      "flour": 4,
      "egg": 2
     },
     "out": {
      "pancakes": 1
     },
     "xp": 2
    },
    "omelette": {
     "name": "Cheese omelette",
     "emoji": "🍳",
     "order": 2,
     "level": 7,
     "in": {
      "egg": 3,
      "cheese": 2
     },
     "out": {
      "omelette": 1
     },
     "xp": 6
    },
    "pizza": {
     "name": "Pizza",
     "emoji": "🍕",
     "order": 3,
     "level": 7,
     "in": {
      "flour": 6,
      "cheese": 4
     },
     "out": {
      "pizza": 1
     },
     "xp": 10
    },
    "tacos": {
     "name": "Fish tacos",
     "emoji": "🌮",
     "order": 4,
     "level": 11,
     "in": {
      "fish": 3,
      "flour": 4,
      "cheese": 1
     },
     "out": {
      "tacos": 1
     },
     "xp": 18
    },
    "pie": {
     "name": "Berry pie",
     "emoji": "🥧",
     "order": 5,
     "level": 16,
     "in": {
      "berry": 3,
      "flour": 6,
      "egg": 2
     },
     "out": {
      "pie": 1
     },
     "xp": 40
    },
    "feast": {
     "name": "Truffle feast",
     "emoji": "🍽️",
     "order": 6,
     "level": 23,
     "in": {
      "truffle": 2,
      "fish": 3,
      "berry": 2
     },
     "out": {
      "feast": 1
     },
     "xp": 110
    }
   },
   "finds": {
    "napkin": {
     "name": "Signed napkin",
     "emoji": "🧻",
     "rarity": "common",
     "level": 1,
     "order": 1,
     "ink": 0
    },
    "spoon": {
     "name": "Lucky spoon",
     "emoji": "🥄",
     "rarity": "common",
     "level": 1,
     "order": 2,
     "ink": 0
    },
    "apron": {
     "name": "Vintage apron",
     "emoji": "🎽",
     "rarity": "uncommon",
     "level": 1,
     "order": 3,
     "ink": 0
    },
    "whisk": {
     "name": "Golden whisk",
     "emoji": "🥢",
     "rarity": "uncommon",
     "level": 3,
     "order": 4,
     "ink": 0
    },
    "card": {
     "name": "Grandma’s recipe card",
     "emoji": "🗂️",
     "rarity": "rare",
     "level": 3,
     "order": 5,
     "ink": 0
    },
    "pepper": {
     "name": "Ghost pepper",
     "emoji": "🌶️",
     "rarity": "uncommon",
     "level": 6,
     "order": 6,
     "ink": 0
    },
    "saffron": {
     "name": "Saffron",
     "emoji": "🌸",
     "rarity": "rare",
     "level": 6,
     "order": 7,
     "ink": 0
    },
    "star1": {
     "name": "Critic’s star",
     "emoji": "⭐",
     "rarity": "epic",
     "level": 10,
     "order": 8,
     "ink": 12
    },
    "sauce": {
     "name": "Secret sauce",
     "emoji": "🥫",
     "rarity": "rare",
     "level": 10,
     "order": 9,
     "ink": 0
    },
    "cake": {
     "name": "Wedding cake order",
     "emoji": "🎂",
     "rarity": "epic",
     "level": 15,
     "order": 10,
     "ink": 12
    },
    "pan": {
     "name": "Cast-iron heirloom",
     "emoji": "🍳",
     "rarity": "epic",
     "level": 15,
     "order": 11,
     "ink": 12
    },
    "stars3": {
     "name": "Three stars",
     "emoji": "🌟",
     "rarity": "legendary",
     "level": 22,
     "order": 12,
     "ink": 20
    }
   },
   "games": {
    "orders": {
     "name": "Order Up!",
     "emoji": "🧑‍🍳",
     "blurb": "Customers call out their orders: tap the ingredients in the right order and serve before they lose patience.",
     "level": 1,
     "min_seconds": 15,
     "max_score": 1500,
     "per_second": 40,
     "xp_per_point": 0.5,
     "points_per_ink": 60,
     "max_ink": 8,
     "finds_every": 100,
     "find_chance": 0.3,
     "drops": [
      {
       "res": "flour",
       "per_point": 0.3,
       "level": 1
      },
      {
       "res": "egg",
       "per_point": 0.12,
       "level": 3
      },
      {
       "res": "cheese",
       "per_point": 0.05,
       "level": 6
      },
      {
       "res": "fish",
       "per_point": 0.02,
       "level": 10
      },
      {
       "res": "berry",
       "per_point": 0.008,
       "level": 15
      },
      {
       "res": "truffle",
       "per_point": 0.003,
       "level": 22
      }
     ]
    }
   }
  },
  "dungeon": {
   "name": "Dungeon",
   "emoji": "⚔️",
   "color": "#A855F7",
   "currency": "loot",
   "resources": {
    "loot": {
     "name": "Treasure",
     "emoji": "💰",
     "currency": true
    },
    "bone": {
     "name": "Bones",
     "emoji": "🦴",
     "sell": 1,
     "tier": 1,
     "level": 1
    },
    "slime": {
     "name": "Slime",
     "emoji": "🟢",
     "sell": 3,
     "tier": 2,
     "level": 3
    },
    "fang": {
     "name": "Monster fang",
     "emoji": "🦷",
     "sell": 8,
     "tier": 3,
     "level": 6
    },
    "dust": {
     "name": "Magic dust",
     "emoji": "✨",
     "sell": 20,
     "tier": 4,
     "level": 10
    },
    "soul": {
     "name": "Soul shard",
     "emoji": "🔷",
     "sell": 50,
     "tier": 5,
     "level": 15
    },
    "scale": {
     "name": "Dragon scale",
     "emoji": "🐲",
     "sell": 140,
     "tier": 6,
     "level": 22
    },
    "potion": {
     "name": "Health potion",
     "emoji": "🧪",
     "sell": 20,
     "made": true,
     "level": 4
    },
    "shield": {
     "name": "Bone shield",
     "emoji": "🛡️",
     "sell": 41,
     "made": true,
     "level": 7
    },
    "bomb": {
     "name": "Slime bomb",
     "emoji": "💣",
     "sell": 94,
     "made": true,
     "level": 11
    },
    "dagger": {
     "name": "Fang dagger",
     "emoji": "🗡️",
     "sell": 156,
     "made": true,
     "level": 11
    },
    "lantern": {
     "name": "Soul lantern",
     "emoji": "🏮",
     "sell": 391,
     "made": true,
     "level": 16
    },
    "armor": {
     "name": "Dragon armour",
     "emoji": "🦺",
     "sell": 1023,
     "made": true,
     "level": 23
    }
   },
   "zones": [
    {
     "id": "crypt",
     "name": "Crypt Entrance",
     "level": 1,
     "blurb": "Cobwebs, candles and creaky doors."
    },
    {
     "id": "warrens",
     "name": "Goblin Warrens",
     "level": 3,
     "blurb": "Twisting tunnels full of goblin junk."
    },
    {
     "id": "sewers",
     "name": "Slime Sewers",
     "level": 6,
     "blurb": "Bubbling green channels. Lovely."
    },
    {
     "id": "halls",
     "name": "Haunted Halls",
     "level": 10,
     "blurb": "Ghostly torches and rattling armour."
    },
    {
     "id": "forge",
     "name": "Lava Forge",
     "level": 15,
     "blurb": "Molten metal and anvils as big as cars."
    },
    {
     "id": "lair",
     "name": "Dragon’s Lair",
     "level": 22,
     "blurb": "Mountains of gold — and something big asleep on them."
    }
   ],
   "producers": {
    "skeleton": {
     "name": "Skeleton guard",
     "emoji": "💀",
     "blurb": "Rattles about collecting bones.",
     "order": 1,
     "level": 1,
     "makes": {
      "bone": 1.5
     },
     "cost": {
      "loot": 15
     },
     "growth": 1.15,
     "max": 100
    },
    "pit": {
     "name": "Slime pit",
     "emoji": "🫧",
     "blurb": "Grows slime, unfortunately.",
     "order": 2,
     "level": 3,
     "makes": {
      "slime": 2
     },
     "cost": {
      "loot": 60
     },
     "growth": 1.15,
     "max": 100
    },
    "goblins": {
     "name": "Goblin crew",
     "emoji": "👺",
     "blurb": "Brings back fangs (don’t ask).",
     "order": 3,
     "level": 6,
     "makes": {
      "fang": 3
     },
     "cost": {
      "loot": 250
     },
     "growth": 1.15,
     "max": 100
    },
    "tower": {
     "name": "Wizard tower",
     "emoji": "🧙",
     "blurb": "Distils magic dust.",
     "order": 4,
     "level": 10,
     "makes": {
      "dust": 4.5
     },
     "cost": {
      "loot": 900
     },
     "growth": 1.15,
     "max": 100
    },
    "altar": {
     "name": "Soul altar",
     "emoji": "🕯️",
     "blurb": "Gathers wandering soul shards.",
     "order": 5,
     "level": 15,
     "makes": {
      "soul": 6
     },
     "cost": {
      "loot": 3000
     },
     "growth": 1.15,
     "max": 100
    },
    "nest": {
     "name": "Dragon nest",
     "emoji": "🥚",
     "blurb": "Sheds dragon scales.",
     "order": 6,
     "level": 22,
     "makes": {
      "scale": 7
     },
     "cost": {
      "loot": 10000
     },
     "growth": 1.15,
     "max": 100
    }
   },
   "upgrades": {
    "sword": {
     "name": "Enchanted sword",
     "emoji": "🗡️",
     "blurb": "+15% loot from every delve",
     "order": 1,
     "effect": {
      "game_mult": 0.15
     },
     "max": 10,
     "cost": {
      "loot": 50
     },
     "growth": 2.0
    },
    "charm": {
     "name": "Lucky charm",
     "emoji": "🍀",
     "blurb": "+20% chance of legendary loot",
     "order": 2,
     "effect": {
      "rare_mult": 0.2
     },
     "max": 10,
     "cost": {
      "loot": 80
     },
     "growth": 2.0
    },
    "drums": {
     "name": "War drums",
     "emoji": "🥁",
     "blurb": "+10% from your minions",
     "order": 3,
     "effect": {
      "prod_mult": 0.1
     },
     "max": 15,
     "cost": {
      "loot": 100
     },
     "growth": 1.8
    },
    "torches": {
     "name": "Torch supply",
     "emoji": "🔥",
     "blurb": "+2 hours of dungeon work while you’re away",
     "order": 4,
     "effect": {
      "offline_hours": 2
     },
     "max": 4,
     "cost": {
      "loot": 300
     },
     "growth": 3.0
    }
   },
   "recipes": {
    "potion": {
     "name": "Health potion",
     "emoji": "🧪",
     "order": 1,
     "level": 4,
     "in": {
      "slime": 3,
      "bone": 3
     },
     "out": {
      "potion": 1
     },
     "xp": 3
    },
    "shield": {
     "name": "Bone shield",
     "emoji": "🛡️",
     "order": 2,
     "level": 7,
     "in": {
      "bone": 8,
      "fang": 2
     },
     "out": {
      "shield": 1
     },
     "xp": 6
    },
    "bomb": {
     "name": "Slime bomb",
     "emoji": "💣",
     "order": 3,
     "level": 11,
     "in": {
      "slime": 5,
      "dust": 2
     },
     "out": {
      "bomb": 1
     },
     "xp": 14
    },
    "dagger": {
     "name": "Fang dagger",
     "emoji": "🗡️",
     "order": 4,
     "level": 11,
     "in": {
      "fang": 4,
      "dust": 3
     },
     "out": {
      "dagger": 1
     },
     "xp": 23
    },
    "lantern": {
     "name": "Soul lantern",
     "emoji": "🏮",
     "order": 5,
     "level": 16,
     "in": {
      "soul": 3,
      "dust": 4
     },
     "out": {
      "lantern": 1
     },
     "xp": 58
    },
    "armor": {
     "name": "Dragon armour",
     "emoji": "🦺",
     "order": 6,
     "level": 23,
     "in": {
      "scale": 3,
      "soul": 3,
      "fang": 4
     },
     "out": {
      "armor": 1
     },
     "xp": 150
    }
   },
   "finds": {
    "key": {
     "name": "Rusty key",
     "emoji": "🗝️",
     "rarity": "common",
     "level": 1,
     "order": 1,
     "ink": 0
    },
    "candle": {
     "name": "Black candle",
     "emoji": "🕯️",
     "rarity": "common",
     "level": 1,
     "order": 2,
     "ink": 0
    },
    "helm": {
     "name": "Dented helm",
     "emoji": "⛑️",
     "rarity": "uncommon",
     "level": 1,
     "order": 3,
     "ink": 0
    },
    "ring": {
     "name": "Goblin king’s ring",
     "emoji": "💍",
     "rarity": "uncommon",
     "level": 3,
     "order": 4,
     "ink": 0
    },
    "map": {
     "name": "Treasure map",
     "emoji": "🗺️",
     "rarity": "rare",
     "level": 3,
     "order": 5,
     "ink": 0
    },
    "cloak": {
     "name": "Phantom cloak",
     "emoji": "🧥",
     "rarity": "uncommon",
     "level": 6,
     "order": 6,
     "ink": 0
    },
    "orb": {
     "name": "Seeing orb",
     "emoji": "🔮",
     "rarity": "rare",
     "level": 6,
     "order": 7,
     "ink": 0
    },
    "blade": {
     "name": "Ember blade",
     "emoji": "⚔️",
     "rarity": "epic",
     "level": 10,
     "order": 8,
     "ink": 12
    },
    "tome": {
     "name": "Forbidden tome",
     "emoji": "📕",
     "rarity": "rare",
     "level": 10,
     "order": 9,
     "ink": 0
    },
    "crown": {
     "name": "Lich crown",
     "emoji": "👑",
     "rarity": "epic",
     "level": 15,
     "order": 10,
     "ink": 12
    },
    "hammer": {
     "name": "Forge hammer",
     "emoji": "🔨",
     "rarity": "epic",
     "level": 15,
     "order": 11,
     "ink": 12
    },
    "egg": {
     "name": "Dragon’s egg",
     "emoji": "🥚",
     "rarity": "legendary",
     "level": 22,
     "order": 12,
     "ink": 20
    }
   },
   "games": {
    "delve": {
     "name": "Dungeon Dash",
     "emoji": "🗡️",
     "blurb": "Run the dungeon lanes: dodge the traps, slash the monsters and grab the treasure.",
     "level": 1,
     "min_seconds": 15,
     "max_score": 1500,
     "per_second": 40,
     "xp_per_point": 0.5,
     "points_per_ink": 60,
     "max_ink": 8,
     "finds_every": 100,
     "find_chance": 0.3,
     "drops": [
      {
       "res": "bone",
       "per_point": 0.3,
       "level": 1
      },
      {
       "res": "slime",
       "per_point": 0.12,
       "level": 3
      },
      {
       "res": "fang",
       "per_point": 0.05,
       "level": 6
      },
      {
       "res": "dust",
       "per_point": 0.02,
       "level": 10
      },
      {
       "res": "soul",
       "per_point": 0.008,
       "level": 15
      },
      {
       "res": "scale",
       "per_point": 0.003,
       "level": 22
      }
     ]
    }
   }
  }
 }
}$cfg$::jsonb,
  'The five realm plot types (mine, sky, workshop, diner, dungeon): resources, zones, producers, upgrades, recipes, finds and minigames for each, plus levels, the daily bonus and the daily Ink cap.')
on conflict (key) do nothing;

create table if not exists public.realms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players (id) on delete cascade,
  group_id uuid references public.canvas_groups (id) on delete set null,
  kind text not null references public.plot_kinds (id),
  xp bigint not null default 0,
  plays bigint not null default 0,
  producers jsonb not null default '{}'::jsonb,   -- producer -> level
  upgrades jsonb not null default '{}'::jsonb,    -- upgrade -> level
  collected_at timestamptz not null default now(),
  seed int not null default floor(random() * 2147483646)::int,
  created_at timestamptz not null default now(),
  unique (group_id, kind)
);
create index if not exists realms_owner_idx on public.realms (owner_id, kind);
alter table public.realms enable row level security;
revoke all on public.realms from anon, authenticated;

create table if not exists public.realm_players (
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null,
  wallet jsonb not null default '{}'::jsonb,      -- resource -> amount (fractions from producers are kept)
  lifetime jsonb not null default '{}'::jsonb,
  finds jsonb not null default '{}'::jsonb,       -- find -> how many
  made jsonb not null default '{}'::jsonb,        -- recipe -> how many
  bonus_day timestamptz, streak int not null default 0,
  primary key (player_id, kind)
);
alter table public.realm_players enable row level security;
revoke all on public.realm_players from anon, authenticated;

create table if not exists public.realm_ink_days (
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null, day timestamptz not null, ink int not null default 0,
  primary key (player_id, kind, day)
);
alter table public.realm_ink_days enable row level security;
revoke all on public.realm_ink_days from anon, authenticated;

create table if not exists public.realm_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  realm_id uuid references public.realms (id) on delete cascade,
  kind text not null, game text not null, seed int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz, score int, loot jsonb
);
create index if not exists realm_runs_board_idx on public.realm_runs (realm_id, game, score desc) where finished_at is not null;
create index if not exists realm_runs_player_idx on public.realm_runs (player_id, started_at desc);
alter table public.realm_runs enable row level security;
revoke all on public.realm_runs from anon, authenticated;

create or replace function private.grant(p_player uuid, p_reward jsonb, p_reason text, p_ref_type text, p_ref_id text, p_idem text)
returns void language plpgsql as $$
declare r record;
begin
  for r in select key, value::bigint as amount from jsonb_each_text(coalesce(p_reward, '{}'::jsonb)) loop
    if r.key in ('ink', 'pigments', 'brush_points', 'gallery_tokens') and r.amount > 0 then
      if r.key = 'ink' and p_reason not in ('minigame', 'referral', 'referral_welcome', 'usd_conversion', 'duel_win', 'duel_refund', 'pvp',
                                            'wheel', 'room_visit', 'room_host', 'inspire', 'inspire_given', 'challenge', 'craft', 'featured',
                                            'sketch', 'doodle', 'duet', 'stamp_sale', 'inkborn', 'ad_reward', 'space', 'farm', 'business', 'arcade', 'realm') then
        raise exception 'ink_minigame_only' using errcode = 'P0001', detail = p_reason;
      end if;
      perform private.ledger_apply(p_player, r.key, r.amount, p_reason, p_ref_type, p_ref_id, p_idem);
      if r.key = 'ink' and p_reason <> 'ad_reward' then perform private.referral_share(p_player, r.amount, p_reason); end if;
    end if;
  end loop;
end $$;

-- ---- bags of resources ---------------------------------------------------------------------------------------------
/** a + b*k, key by key (amounts keep 3 decimals) */
create or replace function private.jadd(a jsonb, b jsonb, k numeric default 1) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(key, round(coalesce((a ->> key)::numeric, 0) + coalesce((b ->> key)::numeric, 0) * k, 3)), '{}'::jsonb)
  from (select jsonb_object_keys(coalesce(a, '{}'::jsonb)) key union select jsonb_object_keys(coalesce(b, '{}'::jsonb))) s
$$;
/** whole amounts: a cost scaled up (rounded up) */
create or replace function private.jcost(a jsonb, k numeric) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(key, ceil(value::numeric * k)::bigint), '{}'::jsonb) from jsonb_each_text(coalesce(a, '{}'::jsonb))
$$;
create or replace function private.jcovers(w jsonb, cost jsonb) returns boolean language sql immutable as $$
  select coalesce(bool_and(coalesce((w ->> key)::numeric, 0) >= value::numeric), true) from jsonb_each_text(coalesce(cost, '{}'::jsonb))
$$;
/** drop anything under one whole unit's worth of nothing (and zeros) */
create or replace function private.jclean(a jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(coalesce(a, '{}'::jsonb)) where (value::text)::numeric > 0
$$;

-- ---- helpers ----------------------------------------------------------------------------------------------------------
create or replace function private.rlm_all() returns jsonb language sql stable as $$ select coalesce(private.cfg('realms'), '{}'::jsonb) $$;
create or replace function private.rlm_cfg(p_kind text) returns jsonb language sql stable as $$ select coalesce(private.cfg('realms') -> 'kinds' -> p_kind, '{}'::jsonb) $$;
create or replace function private.rlm_kinds() returns text[] language sql stable as $$ select array(select jsonb_object_keys(private.cfg('realms') -> 'kinds')) $$;
create or replace function private.rlm_level(p_xp bigint) returns jsonb language plpgsql stable as $$
declare c jsonb := coalesce(private.cfg('realms') -> 'level', '{}'::jsonb); v_lv int := 1; v_need numeric; v_at numeric := 0;
  v_max int := coalesce((c ->> 'max')::int, 40); v_base numeric := coalesce((c ->> 'base')::numeric, 100); v_g numeric := coalesce((c ->> 'growth')::numeric, 1.28);
begin
  loop
    v_need := round(v_base * power(v_g, v_lv - 1));
    exit when v_lv >= v_max or p_xp < v_at + v_need;
    v_at := v_at + v_need; v_lv := v_lv + 1;
  end loop;
  return jsonb_build_object('level', v_lv, 'xp', p_xp, 'into', p_xp - v_at, 'need', case when v_lv >= v_max then 0 else v_need end, 'max', v_lv >= v_max);
end $$;
create or replace function private.rlm_lv(p_xp bigint) returns int language sql stable as $$ select (private.rlm_level(p_xp) ->> 'level')::int $$;
create or replace function private.rlm_player(p_uid uuid, p_kind text) returns public.realm_players language plpgsql as $$
declare r public.realm_players%rowtype;
begin
  insert into public.realm_players (player_id, kind) values (p_uid, p_kind) on conflict do nothing;
  select * into r from public.realm_players where player_id = p_uid and kind = p_kind for update;
  return r;
end $$;
create or replace function private.rlm_ink_today(p_uid uuid, p_kind text) returns int language sql stable as $$
  select coalesce((select ink from public.realm_ink_days where player_id = p_uid and kind = p_kind and day = private.day_start(now())), 0)
$$;
/** Pay realm Ink, up to the day's cap for that plot type. Returns what was paid. */
create or replace function private.rlm_pay(p_uid uuid, p_kind text, p_amount int, p_ref text, p_idem text) returns int language plpgsql as $$
declare v_day timestamptz := private.day_start(now()); v_had int; v_pay int;
begin
  if coalesce(p_amount, 0) <= 0 then return 0; end if;
  insert into public.realm_ink_days (player_id, kind, day) values (p_uid, p_kind, v_day) on conflict do nothing;
  select ink into v_had from public.realm_ink_days where player_id = p_uid and kind = p_kind and day = v_day for update;
  v_pay := least(p_amount, greatest(0, coalesce((private.rlm_all() ->> 'daily_cap')::int, 120) - v_had));
  if v_pay > 0 then
    update public.realm_ink_days set ink = ink + v_pay where player_id = p_uid and kind = p_kind and day = v_day;
    perform private.grant(p_uid, jsonb_build_object('ink', v_pay), 'realm', 'realm', p_ref, p_idem);
  end if;
  return v_pay;
end $$;
/** what an upgrade effect adds up to across this realm's upgrades */
create or replace function private.rlm_eff(p_kind text, p_upgrades jsonb, p_key text) returns numeric language sql stable as $$
  select coalesce(sum(u.value::numeric * coalesce((private.rlm_cfg(p_kind) -> 'upgrades' -> u.key -> 'effect' ->> p_key)::numeric, 0)), 0)
  from jsonb_each_text(coalesce(p_upgrades, '{}'::jsonb)) u
$$;
/** resources a minute from the producers */
create or replace function private.rlm_rates(p_kind text, p_producers jsonb, p_upgrades jsonb) returns jsonb language plpgsql stable as $$
declare c jsonb := private.rlm_cfg(p_kind); v_out jsonb := '{}'::jsonb; r record; m numeric := 1 + private.rlm_eff(p_kind, p_upgrades, 'prod_mult');
begin
  for r in select key, value::int lv from jsonb_each_text(coalesce(p_producers, '{}'::jsonb)) loop
    if r.lv > 0 then v_out := private.jadd(v_out, c -> 'producers' -> r.key -> 'makes', r.lv * m); end if;
  end loop;
  return v_out;
end $$;
create or replace function private.rlm_away_hours(p_kind text, p_upgrades jsonb) returns numeric language sql stable as $$
  select coalesce((private.rlm_all() ->> 'offline_hours')::numeric, 8) + private.rlm_eff(p_kind, p_upgrades, 'offline_hours')
$$;
/** made since the last collect (up to the while-away limit) */
create or replace function private.rlm_pending(p_r public.realms) returns jsonb language sql stable as $$
  select private.jadd('{}'::jsonb, private.rlm_rates(p_r.kind, p_r.producers, p_r.upgrades),
    least(extract(epoch from now() - p_r.collected_at) / 60.0, private.rlm_away_hours(p_r.kind, p_r.upgrades) * 60))
$$;
/** what a bag is worth at the market */
create or replace function private.rlm_value(p_kind text, p_bag jsonb) returns numeric language sql stable as $$
  select coalesce(sum(b.value::numeric * coalesce((private.rlm_cfg(p_kind) -> 'resources' -> b.key ->> 'sell')::numeric, 0)), 0) from jsonb_each_text(coalesce(p_bag, '{}'::jsonb)) b
$$;
create or replace function private.rlm_next_cost(p_kind text, p_type text, p_item text, p_lv int) returns jsonb language sql stable as $$
  select private.jcost(private.rlm_cfg(p_kind) -> p_type -> p_item -> 'cost', power(coalesce((private.rlm_cfg(p_kind) -> p_type -> p_item ->> 'growth')::numeric, 1.15), p_lv))
$$;
/** XP for a realm; a level up pays its owner a little Ink. Returns the new level if it went up. */
create or replace function private.rlm_xp(p_realm uuid, p_xp bigint) returns int language plpgsql as $$
declare r public.realms%rowtype; v_lv0 int; v_lv1 int;
begin
  if coalesce(p_xp, 0) <= 0 then return null; end if;
  update public.realms set xp = xp + p_xp where id = p_realm returning * into r;
  v_lv1 := private.rlm_lv(r.xp); v_lv0 := private.rlm_lv(r.xp - p_xp);
  if v_lv1 > v_lv0 then
    perform private.rlm_pay(r.owner_id, r.kind, (v_lv1 - v_lv0) * coalesce((private.rlm_all() ->> 'level_ink')::int, 3), 'level', 'realm-level:' || r.id || ':' || v_lv1);
    return v_lv1;
  end if;
  return null;
end $$;
create or replace function private.rlm_board(p_realm uuid, p_game text, p_n int) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('player', private.profile_json(q.player_id), 'score', q.score) order by q.score desc), '[]'::jsonb)
  from (select player_id, max(score) score from public.realm_runs where realm_id = p_realm and game = p_game and finished_at is not null and score > 0
        group by player_id order by max(score) desc limit p_n) q
$$;
create or replace function private.rlm_me(p_uid uuid, p_kind text) returns jsonb language plpgsql as $$
declare p public.realm_players%rowtype := private.rlm_player(p_uid, p_kind);
begin
  return jsonb_build_object('wallet', p.wallet, 'lifetime', p.lifetime, 'finds', p.finds, 'made', p.made,
    'bonus_ready', p.bonus_day is distinct from private.day_start(now()),
    'streak', case when p.bonus_day >= private.day_start(now()) - interval '1 day' then p.streak else 0 end,
    'ink_today', private.rlm_ink_today(p_uid, p_kind), 'daily_cap', coalesce((private.rlm_all() ->> 'daily_cap')::int, 120),
    'best', coalesce((select jsonb_object_agg(game, s) from (select game, max(score) s from public.realm_runs where player_id = p_uid and kind = p_kind and finished_at is not null group by game) q), '{}'::jsonb));
end $$;
create or replace function private.rlm_view(p_realm uuid, p_viewer uuid) returns jsonb language plpgsql as $$
declare r public.realms%rowtype; g public.canvas_groups%rowtype; c jsonb; v_mine boolean;
begin
  select * into r from public.realms where id = p_realm;
  select * into g from public.canvas_groups where id = r.group_id;
  c := private.rlm_cfg(r.kind); v_mine := r.owner_id = p_viewer;
  return jsonb_build_object('id', r.id, 'kind', r.kind, 'group_id', r.group_id, 'seed', r.seed,
    'name', case when g.name is null or btrim(g.name) = '' or g.name ~* '^untitled' then (c ->> 'name') else g.name end, 'plots', coalesce(g.plot_count, 1),
    'owner', private.profile_json(r.owner_id), 'mine', v_mine, 'level', private.rlm_level(r.xp), 'plays', r.plays,
    'producers', r.producers, 'upgrades', r.upgrades, 'rates', private.rlm_rates(r.kind, r.producers, r.upgrades),
    'pending', case when v_mine then private.rlm_pending(r) end, 'collected_at', r.collected_at, 'away_hours', private.rlm_away_hours(r.kind, r.upgrades),
    'effects', jsonb_build_object('game_mult', private.rlm_eff(r.kind, r.upgrades, 'game_mult'), 'rare_mult', private.rlm_eff(r.kind, r.upgrades, 'rare_mult'), 'prod_mult', private.rlm_eff(r.kind, r.upgrades, 'prod_mult')),
    'costs', jsonb_build_object(
      'producers', coalesce((select jsonb_object_agg(k, private.rlm_next_cost(r.kind, 'producers', k, coalesce((r.producers ->> k)::int, 0))) from jsonb_object_keys(c -> 'producers') k), '{}'::jsonb),
      'upgrades', coalesce((select jsonb_object_agg(k, private.rlm_next_cost(r.kind, 'upgrades', k, coalesce((r.upgrades ->> k)::int, 0))) from jsonb_object_keys(c -> 'upgrades') k), '{}'::jsonb)),
    'cfg', c, 'rarity_weight', private.rlm_all() -> 'rarity_weight',
    'boards', coalesce((select jsonb_object_agg(k, private.rlm_board(r.id, k, 5)) from jsonb_object_keys(c -> 'games') k), '{}'::jsonb),
    'me', private.rlm_me(p_viewer, r.kind), 'server_time', now());
end $$;
create or replace function private.rlm_owned(p_realm uuid, p_uid uuid) returns public.realms language plpgsql as $$
declare r public.realms%rowtype;
begin
  select * into r from public.realms where id = p_realm for update;
  if not found or r.owner_id <> p_uid then raise exception 'not_owner' using errcode = 'P0001'; end if;
  return r;
end $$;
/** move what the producers made into the owner's wallet */
create or replace function private.rlm_collect(p_realm uuid) returns jsonb language plpgsql as $$
declare r public.realms%rowtype; v_got jsonb; v_whole jsonb;
begin
  select * into r from public.realms where id = p_realm for update;
  v_got := private.rlm_pending(r);
  perform private.rlm_player(r.owner_id, r.kind);
  update public.realm_players set wallet = private.jadd(wallet, v_got), lifetime = private.jadd(lifetime, v_got) where player_id = r.owner_id and kind = r.kind;
  update public.realms set collected_at = now() where id = r.id;
  return v_got;
end $$;

-- ---- the realm --------------------------------------------------------------------------------------------------------
create or replace function public.realm_for_plot(p_gx int, p_gy int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('realm_id', r.id, 'kind', r.kind, 'name', g.name, 'owner', private.profile_json(g.owner_id), 'plots', g.plot_count,
           'level', private.rlm_lv(r.xp), 'plays', r.plays)
  from public.canvas_group_members m join public.canvas_groups g on g.id = m.group_id
  join public.realms r on r.group_id = g.id and r.kind = g.kind
  where m.gx = p_gx and m.gy = p_gy
$$;

create or replace function public.realm_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype;
begin
  select * into r from public.realms where id = p_id;
  if not found or not private.visible_to(r.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  return private.rlm_view(r.id, v_uid);
end $$;

/** Owner: bring in what the crew and machines made (and a little XP for it). */
create or replace function public.realm_collect(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype; v_got jsonb; v_lvup int;
begin
  perform private.rate_limit('realm_act', 900, 3600);
  r := private.rlm_owned(p_id, v_uid);
  v_got := private.rlm_collect(r.id);
  v_lvup := private.rlm_xp(r.id, floor(private.rlm_value(r.kind, v_got) / 10)::bigint);
  return jsonb_build_object('got', v_got, 'level_up', v_lvup, 'view', private.rlm_view(r.id, v_uid), 'balances', private.balances(v_uid));
end $$;

/** Owner: buy a producer level or an upgrade level. */
create or replace function public.realm_buy(p_id uuid, p_type text, p_item text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype; c jsonb; it jsonb; v_lv int; v_cost jsonb; p public.realm_players%rowtype; v_col text;
begin
  perform private.rate_limit('realm_act', 900, 3600);
  if p_type not in ('producers', 'upgrades') then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  r := private.rlm_owned(p_id, v_uid); c := private.rlm_cfg(r.kind); it := c -> p_type -> p_item;
  if it is null then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  if private.rlm_lv(r.xp) < coalesce((it ->> 'level')::int, 1) then raise exception 'level_too_low' using errcode = 'P0001'; end if;
  v_col := case when p_type = 'producers' then 'producers' else 'upgrades' end;
  v_lv := coalesce(((case when p_type = 'producers' then r.producers else r.upgrades end) ->> p_item)::int, 0);
  if v_lv >= coalesce((it ->> 'max')::int, 100) then raise exception 'maxed' using errcode = 'P0001'; end if;
  v_cost := private.rlm_next_cost(r.kind, p_type, p_item, v_lv);
  -- what's been made so far comes in first, at the old rate
  perform private.rlm_collect(r.id);
  p := private.rlm_player(v_uid, r.kind);
  if not private.jcovers(p.wallet, v_cost) then raise exception 'not_enough' using errcode = 'P0001'; end if;
  update public.realm_players set wallet = private.jclean(private.jadd(wallet, v_cost, -1)) where player_id = v_uid and kind = r.kind;
  if p_type = 'producers' then update public.realms set producers = producers || jsonb_build_object(p_item, v_lv + 1) where id = r.id;
  else update public.realms set upgrades = upgrades || jsonb_build_object(p_item, v_lv + 1) where id = r.id; end if;
  perform private.rlm_xp(r.id, greatest(1, floor(private.rlm_value(r.kind, v_cost) / 20))::bigint);
  return jsonb_build_object('view', private.rlm_view(r.id, v_uid), 'balances', private.balances(v_uid));
end $$;

/** Owner: make something from a recipe (n at a time). */
create or replace function public.realm_make(p_id uuid, p_recipe text, p_n int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype; c jsonb; rc jsonb; v_n int := greatest(1, least(coalesce(p_n, 1), 100)); v_in jsonb; v_out jsonb; p public.realm_players%rowtype; v_lvup int; v_first boolean;
begin
  perform private.rate_limit('realm_act', 900, 3600);
  r := private.rlm_owned(p_id, v_uid); c := private.rlm_cfg(r.kind); rc := c -> 'recipes' -> p_recipe;
  if rc is null then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  if private.rlm_lv(r.xp) < coalesce((rc ->> 'level')::int, 1) then raise exception 'level_too_low' using errcode = 'P0001'; end if;
  v_in := private.jcost(rc -> 'in', v_n); v_out := private.jcost(rc -> 'out', v_n);
  p := private.rlm_player(v_uid, r.kind);
  if not private.jcovers(p.wallet, v_in) then raise exception 'not_enough' using errcode = 'P0001'; end if;
  v_first := coalesce((p.made ->> p_recipe)::int, 0) = 0;
  update public.realm_players set wallet = private.jclean(private.jadd(private.jadd(wallet, v_in, -1), v_out)), lifetime = private.jadd(lifetime, v_out),
         made = made || jsonb_build_object(p_recipe, coalesce((made ->> p_recipe)::int, 0) + v_n) where player_id = v_uid and kind = r.kind;
  v_lvup := private.rlm_xp(r.id, (coalesce((rc ->> 'xp')::int, 2) * v_n)::bigint);
  return jsonb_build_object('made', v_out, 'first', v_first, 'level_up', v_lvup, 'view', private.rlm_view(r.id, v_uid), 'balances', private.balances(v_uid));
end $$;

/** Sell resources at the market for the place's currency. */
create or replace function public.realm_sell(p_kind text, p_res text, p_n numeric default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); c jsonb := private.rlm_cfg(p_kind); rs jsonb; p public.realm_players%rowtype; v_n bigint; v_got bigint;
begin
  perform private.rate_limit('realm_act', 900, 3600);
  rs := c -> 'resources' -> p_res;
  if rs is null or (rs ->> 'sell') is null then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  p := private.rlm_player(v_uid, p_kind);
  v_n := floor(least(coalesce(p_n, 1e15), coalesce((p.wallet ->> p_res)::numeric, 0)));
  if v_n <= 0 then raise exception 'not_enough' using errcode = 'P0001'; end if;
  v_got := v_n * (rs ->> 'sell')::bigint;
  update public.realm_players set wallet = private.jclean(private.jadd(private.jadd(wallet, jsonb_build_object(p_res, v_n), -1), jsonb_build_object(c ->> 'currency', v_got))),
         lifetime = private.jadd(lifetime, jsonb_build_object(c ->> 'currency', v_got)) where player_id = v_uid and kind = p_kind;
  return jsonb_build_object('sold', v_n, 'got', v_got, 'me', private.rlm_me(v_uid, p_kind));
end $$;

/** Start a round of a realm's minigame (free; anyone who can see the place can play). */
create or replace function public.realm_start(p_id uuid, p_game text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); r public.realms%rowtype; g jsonb; s public.realm_runs%rowtype;
begin
  perform private.rate_limit('realm_play', 300, 3600);
  select * into r from public.realms where id = p_id;
  if not found or not private.visible_to(r.owner_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  g := private.rlm_cfg(r.kind) -> 'games' -> p_game;
  if g is null then raise exception 'invalid_game' using errcode = 'P0001'; end if;
  if private.rlm_lv(r.xp) < coalesce((g ->> 'level')::int, 1) then raise exception 'level_too_low' using errcode = 'P0001'; end if;
  insert into public.realm_runs (player_id, realm_id, kind, game, seed) values (v_uid, r.id, r.kind, p_game, floor(random() * 2147483646)::int) returning * into s;
  return jsonb_build_object('session', s.id, 'seed', s.seed, 'game', p_game, 'level', private.rlm_lv(r.xp),
    'best', (select max(score) from public.realm_runs where player_id = v_uid and realm_id = r.id and game = p_game and finished_at is not null),
    'record', (select max(score) from public.realm_runs where realm_id = r.id and game = p_game and finished_at is not null));
end $$;

/** Round over: resources for the score (deeper zones' ones once the place is high enough), maybe a rare find or two,
    XP for the place, a little Ink (capped a day), and the owner's cut of a visitor's haul. */
create or replace function public.realm_finish(p_session uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); s public.realm_runs%rowtype; r public.realms%rowtype; c jsonb; g jsonb; d jsonb; f record;
  v_secs numeric; v_score int; v_lv int; v_mult numeric; v_loot jsonb := '{}'::jsonb; v_amt int; v_tries int; v_chance numeric; v_total numeric; v_pick numeric;
  v_found jsonb := '[]'::jsonb; v_fid text; p public.realm_players%rowtype; v_new boolean; v_ink int; v_paid int := 0; v_find_ink int := 0; v_owner jsonb; v_lvup int; v_prev_best int; v_rec int;
begin
  select * into s from public.realm_runs where id = p_session for update;
  if not found or s.player_id <> v_uid then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.finished_at is not null then return jsonb_build_object('score', s.score, 'loot', s.loot, 'repeat', true); end if;
  select * into r from public.realms where id = s.realm_id for update;
  c := private.rlm_cfg(s.kind); g := c -> 'games' -> s.game;
  v_secs := extract(epoch from now() - s.started_at);
  if v_secs < coalesce((g ->> 'min_seconds')::numeric, 10) then raise exception 'game_too_fast' using errcode = 'P0001'; end if;
  v_score := greatest(0, least(coalesce(p_score, 0), coalesce((g ->> 'max_score')::int, 1500), ceil(v_secs * coalesce((g ->> 'per_second')::numeric, 40))::int));
  v_prev_best := (select max(score) from public.realm_runs where player_id = v_uid and realm_id = s.realm_id and game = s.game and finished_at is not null);
  v_rec := (select max(score) from public.realm_runs where realm_id = s.realm_id and game = s.game and finished_at is not null);
  if r.id is not null and v_secs <= 1800 and v_score > 0 then
    v_lv := private.rlm_lv(r.xp);
    v_mult := 1 + private.rlm_eff(r.kind, r.upgrades, 'game_mult');
    for d in select * from jsonb_array_elements(g -> 'drops') loop
      if v_lv >= coalesce((d ->> 'level')::int, 1) then
        v_amt := floor(v_score * (d ->> 'per_point')::numeric * v_mult)::int;
        if v_amt > 0 then v_loot := v_loot || jsonb_build_object(d ->> 'res', v_amt); end if;
      end if;
    end loop;
    -- rare finds: a chance every so many points
    v_tries := floor(v_score / greatest(1, coalesce((g ->> 'finds_every')::numeric, 100)))::int;
    v_chance := least(0.9, coalesce((g ->> 'find_chance')::numeric, 0.3) * (1 + private.rlm_eff(r.kind, r.upgrades, 'rare_mult')));
    select coalesce(sum(coalesce((private.rlm_all() -> 'rarity_weight' ->> (x.value ->> 'rarity'))::numeric, 1)), 0) into v_total
      from jsonb_each(c -> 'finds') x where coalesce((x.value ->> 'level')::int, 1) <= v_lv;
    p := private.rlm_player(v_uid, s.kind);
    for i in 1 .. least(v_tries, 15) loop
      exit when v_total <= 0;
      if random() < v_chance then
        v_pick := random() * v_total; v_fid := null;
        for f in select x.key, x.value from jsonb_each(c -> 'finds') x where coalesce((x.value ->> 'level')::int, 1) <= v_lv order by (x.value ->> 'order')::int loop
          v_pick := v_pick - coalesce((private.rlm_all() -> 'rarity_weight' ->> (f.value ->> 'rarity'))::numeric, 1);
          if v_pick <= 0 then v_fid := f.key; exit; end if;
        end loop;
        if v_fid is not null then
          select coalesce((finds ->> v_fid)::int, 0) = 0 into v_new from public.realm_players where player_id = v_uid and kind = s.kind;
          update public.realm_players set finds = finds || jsonb_build_object(v_fid, coalesce((finds ->> v_fid)::int, 0) + 1) where player_id = v_uid and kind = s.kind;
          if v_new and coalesce((c -> 'finds' -> v_fid ->> 'ink')::int, 0) > 0 then
            v_find_ink := v_find_ink + private.rlm_pay(v_uid, s.kind, (c -> 'finds' -> v_fid ->> 'ink')::int, 'find:' || v_fid, 'realm-find:' || v_uid || ':' || s.kind || ':' || v_fid);
          end if;
          v_found := v_found || jsonb_build_array(jsonb_build_object('id', v_fid, 'new', v_new));
        end if;
      end if;
    end loop;
    update public.realm_players set wallet = private.jadd(wallet, v_loot), lifetime = private.jadd(lifetime, v_loot) where player_id = v_uid and kind = s.kind;
    v_ink := least(coalesce((g ->> 'max_ink')::int, 8), floor(v_score / greatest(1, coalesce((g ->> 'points_per_ink')::numeric, 60))))::int;
    v_paid := private.rlm_pay(v_uid, s.kind, v_ink, 'realm:' || s.id, 'realm-run:' || s.id);
    update public.realms set plays = plays + 1 where id = r.id;
    v_lvup := private.rlm_xp(r.id, floor(v_score * coalesce((g ->> 'xp_per_point')::numeric, 0.5))::bigint);
    if r.owner_id <> v_uid then
      v_owner := private.jcost(v_loot, coalesce((private.rlm_all() ->> 'visitor_share')::numeric, 0.1));
      perform private.rlm_player(r.owner_id, r.kind);
      update public.realm_players set wallet = private.jadd(wallet, v_owner), lifetime = private.jadd(lifetime, v_owner) where player_id = r.owner_id and kind = r.kind;
    end if;
  end if;
  update public.realm_runs set finished_at = now(), score = v_score, loot = jsonb_build_object('res', v_loot, 'finds', v_found) where id = s.id;
  return jsonb_build_object('score', v_score, 'loot', v_loot, 'finds', v_found, 'paid', v_paid + v_find_ink, 'earned', v_ink,
    'best', greatest(coalesce(v_prev_best, 0), v_score), 'new_best', v_score > coalesce(v_prev_best, 0) and v_score > 0,
    'record', greatest(coalesce(v_rec, 0), v_score), 'new_record', v_score > coalesce(v_rec, 0) and v_score > 0,
    'owner_cut', v_owner, 'level_up', v_lvup, 'me', private.rlm_me(v_uid, s.kind), 'balances', private.balances(v_uid));
end $$;

/** Today's bonus (more for every day in a row, up to a week) and a drop of Ink. */
create or replace function public.realm_daily(p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); b jsonb := private.rlm_all() -> 'daily_bonus'; c jsonb := private.rlm_cfg(p_kind); p public.realm_players%rowtype;
  v_day timestamptz := private.day_start(now()); v_streak int; v_amt int; v_paid int;
begin
  if c = '{}'::jsonb then raise exception 'invalid_item' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.realms where owner_id = v_uid and kind = p_kind) then raise exception 'not_found' using errcode = 'P0001'; end if;
  p := private.rlm_player(v_uid, p_kind);
  if p.bonus_day = v_day then raise exception 'already_done' using errcode = 'P0001'; end if;
  v_streak := least(coalesce((b ->> 'max_streak')::int, 7), case when p.bonus_day = v_day - interval '1 day' then p.streak + 1 else 1 end);
  v_amt := coalesce((b ->> 'currency')::int, 30) + coalesce((b ->> 'per_streak')::int, 10) * (v_streak - 1);
  update public.realm_players set bonus_day = v_day, streak = v_streak, wallet = private.jadd(wallet, jsonb_build_object(c ->> 'currency', v_amt)) where player_id = v_uid and kind = p_kind;
  v_paid := private.rlm_pay(v_uid, p_kind, coalesce((b ->> 'ink')::int, 2), 'daily', 'realm-daily:' || v_uid || ':' || p_kind || ':' || v_day::date);
  return jsonb_build_object('amount', v_amt, 'streak', v_streak, 'paid', v_paid, 'me', private.rlm_me(v_uid, p_kind), 'balances', private.balances(v_uid));
end $$;

-- ---- a plot can be one of these --------------------------------------------------------------------------------------
create or replace function private.no_art_on_habitat_trg() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.canvas_groups where id = new.group_id and kind in ('habitat', 'farm', 'business', 'arcade', 'mine', 'sky', 'workshop', 'diner', 'dungeon')) then
    raise exception 'habitat_plot' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.group_json(p_group uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', g.id, 'name', g.name, 'status', g.status, 'plot_count', g.plot_count, 'kind', g.kind,
    'habitat_id', (select h.id from public.habitats h where h.group_id = g.id),
    'farm_id', (select f.id from public.farms f where f.group_id = g.id),
    'business_id', (select b.id from public.businesses b where b.group_id = g.id),
    'arcade_id', (select a.id from public.arcades a where a.group_id = g.id),
    'realm_id', (select r.id from public.realms r where r.group_id = g.id and r.kind = g.kind),
    'min_gx', g.min_gx, 'min_gy', g.min_gy, 'max_gx', g.max_gx, 'max_gy', g.max_gy,
    'project_id', g.project_id, 'created_at', g.created_at, 'updated_at', g.updated_at,
    'cells', (
      select coalesce(jsonb_agg(jsonb_build_array(m.gx, m.gy, wp.plot_type, wp.level, wp.art_rev is not null) order by m.gy, m.gx), '[]'::jsonb)
      from public.canvas_group_members m join public.world_plots wp on wp.gx = m.gx and wp.gy = m.gy
      where m.group_id = g.id),
    'project', (
      select jsonb_build_object('id', p.id, 'title', p.title, 'description', p.description,
                                'current_version_id', p.current_version_id, 'version_count', p.version_count,
                                'tile_count', v.tile_count, 'layer_count', v.layer_count, 'updated_at', p.updated_at)
      from public.artwork_projects p left join public.artwork_versions v on v.id = p.current_version_id
      where p.id = g.project_id),
    'latest_publication', (
      select jsonb_build_object('id', a.id, 'status', a.status, 'title', a.title, 'created_at', a.created_at,
                                'published_at', a.published_at, 'decision_reason', a.decision_reason,
                                'thumb_path', a.thumb_path, 'plot_count', a.plot_count)
      from public.artwork_publications a
      where a.group_id = g.id and a.status not in ('cancelled')
      order by a.created_at desc limit 1),
    'adjacent_groups', (
      select coalesce(jsonb_agg(distinct m2.group_id), '[]'::jsonb)
      from public.canvas_group_members m1
      join private.neighbors(m1.gx, m1.gy) n on true
      join public.canvas_group_members m2 on m2.gx = n.gx and m2.gy = n.gy
      join public.canvas_groups g2 on g2.id = m2.group_id
      where m1.group_id = g.id and m2.group_id <> g.id and g2.owner_id = g.owner_id and g2.status = 'active'))
  from public.canvas_groups g where g.id = p_group
$$;

create or replace function public.set_group_kind(p_group_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); g public.canvas_groups%rowtype; h public.habitats%rowtype; v_starter uuid; v_fee int := 0;
begin
  perform private.rate_limit('set_group_kind', 60, 3600);
  select * into g from public.canvas_groups where id = p_group_id for update;
  if not found or g.owner_id <> v_uid or g.status <> 'active' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.plot_kinds where id = p_kind and enabled) then raise exception 'invalid_plot_kind' using errcode = 'P0001'; end if;
  if g.kind = p_kind then return private.group_json(g.id); end if;
  -- choosing what a brand-new plot becomes is free; after that, switching costs a little Ink
  if g.kind_changed_at is not null or g.created_at < now() - make_interval(mins => coalesce((private.cfg('plot_switch') ->> 'free_minutes')::int, 15)) then
    v_fee := coalesce((private.cfg('plot_switch') ->> 'fee')::int, 20);
    if v_fee > 0 then perform private.charge(v_uid, jsonb_build_object('ink', v_fee), 'plot_switch', 'group', g.id::text, 'plot-switch:' || g.id || ':' || gen_random_uuid()); end if;
  end if;
  if exists (select 1 from public.artwork_publications where group_id = g.id and status in ('processing', 'pending_review', 'approved', 'uploading')) then
    raise exception 'publication_in_progress' using errcode = 'P0001';
  end if;
  select * into h from public.habitats where group_id = g.id;
  if p_kind = 'farm' then
    insert into public.farms (owner_id, group_id) values (v_uid, g.id) on conflict (group_id) do update set owner_id = excluded.owner_id;
  end if;
  if p_kind = 'business' then
    insert into public.businesses (owner_id, group_id) values (v_uid, g.id) on conflict (group_id) do update set owner_id = excluded.owner_id;
    perform private.biz_lock(v_uid);
  end if;
  if p_kind = 'arcade' then
    insert into public.arcades (owner_id, group_id) values (v_uid, g.id) on conflict (group_id) do update set owner_id = excluded.owner_id;
    perform private.arc_player(v_uid);
  end if;
  if p_kind in ('mine', 'sky', 'workshop', 'diner', 'dungeon') then
    insert into public.realms (owner_id, group_id, kind) values (v_uid, g.id, p_kind) on conflict (group_id, kind) do update set owner_id = excluded.owner_id;
    perform private.rlm_player(v_uid, p_kind);
  end if;
  if p_kind = 'habitat' then
    if h.id is null then insert into public.habitats (owner_id, group_id, kind) values (v_uid, g.id, 'plot') returning * into h; end if;
    -- creatures that lived here before come home
    update public.inkborn set habitat_id = h.id, prev_habitat_id = null where owner_id = v_uid and prev_habitat_id = h.id;
  elsif h.id is not null then
    -- the habitat (layout + who lived here) is kept; its creatures wait in the starter sanctuary
    v_starter := private.starter_habitat(v_uid);
    update public.inkborn set prev_habitat_id = h.id, habitat_id = v_starter where habitat_id = h.id;
  end if;
  update public.canvas_groups set kind = p_kind, kind_changed_at = now(), updated_at = now() where id = g.id;
  perform private.audit('group.kind', 'group', g.id::text, jsonb_build_object('from', g.kind, 'to', p_kind));
  return private.group_json(g.id) || jsonb_build_object('fee', v_fee, 'balances', private.balances(v_uid));
end $$;

-- ---- and they get doors at home ------------------------------------------------------------------------------------
create or replace function private.home_places(p_owner uuid, p_viewer uuid, p_un text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'arcade', coalesce((select jsonb_agg(x order by (x ->> 'score')::numeric desc) from (
        select jsonb_build_object('id', a.id, 'name', private.place_name(g.name, p_un, 'Arcade'), 'plots', coalesce(g.plot_count, 1),
                                  'level', (private.arc_level(a.xp) ->> 'level')::int, 'score', a.plays, 'rarity', private.group_rarity(a.group_id),
                                  'here', (select count(*) from public.arcade_presence ap where ap.arcade_id = a.id and ap.seen_at > now() - interval '12 seconds')) x
          from public.arcades a join public.canvas_groups g on g.id = a.group_id and g.kind = 'arcade' and g.status = 'active'
         where a.owner_id = p_owner) t), '[]'::jsonb),
    'habitat', coalesce((select jsonb_agg(x order by (x ->> 'score')::numeric desc) from (
        select jsonb_build_object('id', h.id, 'name', case when h.kind = 'starter' then p_un || '’s home sanctuary' else private.place_name(g.name, p_un, 'Sanctuary') end,
                                  'plots', coalesce(g.plot_count, 0), 'starter', h.kind = 'starter', 'rarity', private.group_rarity(h.group_id),
                                  'score', (select count(*) from public.inkborn c where c.habitat_id = h.id) * 100 + coalesce(g.plot_count, 0)) x
          from public.habitats h left join public.canvas_groups g on g.id = h.group_id
         where h.owner_id = p_owner and (h.kind = 'starter' or (g.kind = 'habitat' and g.status = 'active'))) t), '[]'::jsonb),
    'farm', coalesce((select jsonb_agg(x order by (x ->> 'score')::numeric desc) from (
        select jsonb_build_object('id', f.id, 'name', private.place_name(g.name, p_un, 'Farm'), 'plots', g.plot_count, 'score', f.harvests,
                                  'rarity', private.group_rarity(f.group_id)) x
          from public.farms f join public.canvas_groups g on g.id = f.group_id and g.kind = 'farm' and g.status = 'active'
         where f.owner_id = p_owner) t), '[]'::jsonb),
    'business', coalesce((select jsonb_agg(x order by (x ->> 'score')::numeric desc) from (
        select jsonb_build_object('id', b.id, 'name', private.place_name(g.name, p_un, 'Business'), 'plots', g.plot_count, 'score', b.tips,
                                  'rarity', private.group_rarity(b.group_id)) x
          from public.businesses b join public.canvas_groups g on g.id = b.group_id and g.kind = 'business' and g.status = 'active'
         where b.owner_id = p_owner) t), '[]'::jsonb))
    || coalesce((select jsonb_object_agg(k, coalesce((select jsonb_agg(x order by (x ->> 'score')::numeric desc) from (
        select jsonb_build_object('id', r.id, 'name', private.place_name(g.name, p_un, private.rlm_cfg(k) ->> 'name'), 'plots', coalesce(g.plot_count, 1),
                                  'level', (private.rlm_level(r.xp) ->> 'level')::int, 'score', r.xp, 'rarity', private.group_rarity(r.group_id)) x
          from public.realms r join public.canvas_groups g on g.id = r.group_id and g.kind = k and g.status = 'active'
         where r.owner_id = p_owner and r.kind = k) t), '[]'::jsonb))
      from unnest(array['mine', 'sky', 'workshop', 'diner', 'dungeon']) k), '{}'::jsonb)
$$;

create or replace function public.home_doors(p_doors jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v jsonb := '{}'::jsonb; r record;
begin
  perform private.rate_limit('home_save', 240, 3600);
  perform private.home_row(v_uid);
  for r in select key, value from jsonb_each_text(coalesce(p_doors, '{}'::jsonb)) loop
    if r.key not in ('arcade', 'habitat', 'farm', 'business', 'mine', 'sky', 'workshop', 'diner', 'dungeon') or r.value not in ('public', 'friends', 'hidden') then raise exception 'invalid_style' using errcode = 'P0001'; end if;
    v := v || jsonb_build_object(r.key, r.value);
  end loop;
  update public.homes set doors = doors || v, updated_at = now() where player_id = v_uid;
  return public.home_get((select username from public.profiles where id = v_uid));
end $$;

create or replace function public.home_get(p_username text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_active_player(); v_id uuid; v_un text; h public.homes%rowtype; v_own boolean; v_places jsonb; k text; v_doors jsonb := '{}'::jsonb;
begin
  perform private.rate_limit('home_get', 1200, 3600);
  select id, username into v_id, v_un from public.profiles where lower(username) = lower(btrim(coalesce(p_username, '')));
  if v_id is null or not private.visible_to(v_id, v_uid) then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_own := v_id = v_uid;
  if v_own then h := private.home_row(v_id);
  else
    select * into h from public.homes where player_id = v_id;
    if not found then h.player_id := v_id; h.style := '{}'::jsonb; h.layout := '[]'::jsonb; h.doors := '{}'::jsonb; end if;
  end if;
  v_places := private.home_places(v_id, v_uid, v_un);
  for k in select jsonb_object_keys(v_places) loop
    v_doors := v_doors || jsonb_build_object(k, jsonb_build_object(
      'privacy', coalesce(h.doors ->> k, 'public'),
      'open', private.home_door_ok(h.doors, k, v_id, v_uid),
      'count', jsonb_array_length(v_places -> k),
      'places', case when not private.home_door_ok(h.doors, k, v_id, v_uid) then '[]'::jsonb
                     when v_own then v_places -> k
                     when jsonb_array_length(v_places -> k) > 0 then jsonb_build_array(v_places -> k -> 0) else '[]'::jsonb end));
  end loop;
  return jsonb_build_object(
    'host', private.profile_json(v_id) || jsonb_build_object('explorer_style', (select explorer_style from public.profiles where id = v_id)),
    'own', v_own, 'name', h.name, 'style', h.style, 'layout', h.layout, 'doors', v_doors,
    'careers', jsonb_build_object(
      'arcade', coalesce((select max((private.arc_level(a.xp) ->> 'level')::int) from public.arcades a where a.owner_id = v_id), 0),
      'keeper', coalesce((select private.keeper_level_of(xp) from public.keeper_state where player_id = v_id), 0),
      'farmer', coalesce((select private.farm_level_of(xp) from public.farm_progress where player_id = v_id), 0),
      'merchant', coalesce((select alltime from public.biz_state where player_id = v_id), 0),
      'creatures', (select count(*) from public.inkborn where owner_id = v_id),
      'plots', (select count(*) from public.world_plots where owner_id = v_id),
      'realms', coalesce((select jsonb_object_agg(kind, lv) from (select kind, max((private.rlm_level(xp) ->> 'level')::int) lv from public.realms where owner_id = v_id group by kind) q), '{}'::jsonb)),
    'inkborn', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'genome', c.genome, 'companion', c.id = kp.companion_id) order by c.id = kp.companion_id desc, c.bond desc)
                        from (select * from public.inkborn where owner_id = v_id order by bond desc, created_at limit 6) c
                        left join public.inkborn_keepers kp on kp.owner_id = v_id), '[]'::jsonb),
    'items', case when v_own then coalesce((select jsonb_object_agg(item, qty) from public.home_items where player_id = v_id and qty > 0), '{}'::jsonb) end,
    'tickets', case when v_own then coalesce((select tickets from public.arcade_players where player_id = v_id), 0) end,
    'catalog', private.home_cfg() - 'room_size' - 'stale_seconds');
end $$;

do $$
declare f text;
begin
  foreach f in array array['private.jadd(jsonb, jsonb, numeric)', 'private.jcost(jsonb, numeric)', 'private.jcovers(jsonb, jsonb)', 'private.jclean(jsonb)',
    'private.rlm_all()', 'private.rlm_cfg(text)', 'private.rlm_kinds()', 'private.rlm_level(bigint)', 'private.rlm_lv(bigint)', 'private.rlm_player(uuid, text)',
    'private.rlm_ink_today(uuid, text)', 'private.rlm_pay(uuid, text, int, text, text)', 'private.rlm_eff(text, jsonb, text)', 'private.rlm_rates(text, jsonb, jsonb)',
    'private.rlm_away_hours(text, jsonb)', 'private.rlm_pending(public.realms)', 'private.rlm_value(text, jsonb)', 'private.rlm_next_cost(text, text, text, int)',
    'private.rlm_xp(uuid, bigint)', 'private.rlm_board(uuid, text, int)', 'private.rlm_me(uuid, text)', 'private.rlm_view(uuid, uuid)', 'private.rlm_owned(uuid, uuid)',
    'private.rlm_collect(uuid)'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
  foreach f in array array['public.realm_get(uuid)', 'public.realm_collect(uuid)', 'public.realm_buy(uuid, text, text)', 'public.realm_make(uuid, text, int)',
    'public.realm_sell(text, text, numeric)', 'public.realm_start(uuid, text)', 'public.realm_finish(uuid, int)', 'public.realm_daily(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.realm_for_plot(int, int) from public';
  execute 'grant execute on function public.realm_for_plot(int, int) to anon, authenticated, service_role';
end $$;
