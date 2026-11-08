// 🎨 Paintbrawl — the card set. Every card is original to LANDVAS: painted creatures, lane totems and spells from six
// terrains (Meadow, Ember, Frost, Bog, Sugar, Neon) plus a few wanderers that fit any deck. The rules for what each
// card does live in engine.ts (keyed by card id); this file is the data both the server and the app read.

export const TERRAINS = ['meadow', 'ember', 'frost', 'bog', 'sugar', 'neon'] as const;
export type Terrain = (typeof TERRAINS)[number];
export type Kind = 'creature' | 'totem' | 'spell';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
/** What a spell (or an on-play ability) needs you to point at. */
export type Target = 'none' | 'enemy_unit' | 'any_unit' | 'my_unit' | 'my_lane' | 'enemy_lane' | 'my_empty_lane' | 'any_lane';
/** The big board-changing scenes (cataclysm spells, and the moments wonders go off). */
export type Fx = 'eruption' | 'avalanche' | 'tidalwave' | 'earthquake' | 'thunderstorm' | 'cyclone' | 'overgrowth' | 'bogrise' | 'meteors' | 'eclipse' | 'blackhole' | 'peakblast' | 'rift';

export type Card = {
  id: string; name: string; kind: Kind; terrain: Terrain | 'neutral'; rarity: Rarity; cost: number;
  atk?: number; hp?: number;
  /** creatures: the Flourish ability (instead of attacking this turn) and what it costs */
  flourish?: { cost: number; text: string; target?: Target };
  /** spells: what to aim at */
  target?: Target;
  /** cataclysms: spells that change the whole board, each with its own big scene */
  fx?: Fx;
  /** wonders: totems that are landmarks — a big structure beside the lane that keeps doing something */
  wonder?: boolean;
  text: string; flavor: string;
  /** the painted creature (see genome() below) or the emblem for totems and spells */
  art: string;
  /** keywords shown as chips */
  tags?: ('shield' | 'stun' | 'poison' | 'tough' | 'pierce' | 'draw' | 'heal' | 'burn')[];
};

export const TERRAIN_INFO: Record<Terrain, { name: string; emoji: string; color: string; dark: string; glow: string; blurb: string }> = {
  meadow: { name: 'Meadow', emoji: '🌿', color: '#5FCB6A', dark: '#1F6B33', glow: '#B8FFB0', blurb: 'Sturdy creatures that heal and outlast.' },
  ember: { name: 'Ember', emoji: '🔥', color: '#FF7A3D', dark: '#8A2A10', glow: '#FFD08A', blurb: 'Hit hard, hit fast, burn the enemy hero.' },
  frost: { name: 'Frost', emoji: '❄️', color: '#6FD3FF', dark: '#1D5A8A', glow: '#DDF6FF', blurb: 'Freeze foes in place and shrug off blows.' },
  bog: { name: 'Bog', emoji: '🍄', color: '#9B6BFF', dark: '#3D2470', glow: '#E0C8FF', blurb: 'Poison, rot, and creatures that come back.' },
  sugar: { name: 'Sugar', emoji: '🍭', color: '#FF6FB5', dark: '#8A2058', glow: '#FFD6EE', blurb: 'Tricks, extra paint and cards, sweet chaos.' },
  neon: { name: 'Neon', emoji: '⚡', color: '#F5E14A', dark: '#6E5A0A', glow: '#FFF7B0', blurb: 'Zaps, shields and machines that overclock.' },
};
export const RARITY_INFO: Record<Rarity, { name: string; color: string; weight: number; dust: number; craft: number; max: number }> = {
  common: { name: 'Common', color: '#C9C4DA', weight: 70, dust: 5, craft: 40, max: 2 },
  rare: { name: 'Rare', color: '#4FB7FF', weight: 22, dust: 20, craft: 100, max: 2 },
  epic: { name: 'Epic', color: '#B57BFF', weight: 7, dust: 100, craft: 400, max: 2 },
  legendary: { name: 'Legendary', color: '#FFB13D', weight: 1, dust: 400, craft: 1600, max: 1 },
};

// art: for creatures, a compact genome "body color belly accent pattern eyes ears horns tail wings legs eyes# gait size"
const C = (o: Omit<Card, 'kind'>): Card => ({ ...o, kind: 'creature' });
const T = (o: Omit<Card, 'kind'>): Card => ({ ...o, kind: 'totem' });
const S = (o: Omit<Card, 'kind'>): Card => ({ ...o, kind: 'spell' });

export const CARDS: Card[] = [
  // ---- 🌿 Meadow ----------------------------------------------------------------------------------------------------
  C({ id: 'sproutling', name: 'Sproutling', terrain: 'meadow', rarity: 'common', cost: 1, atk: 1, hp: 3, tags: ['heal'],
    flourish: { cost: 1, text: 'Heal itself 3.' }, text: '', flavor: 'Plant it anywhere. It will grow on you.', art: 'bean #7BD957 #E9FFD0 #3E9A44 spots happy round none leaf leaf 2 2 walk 0.85' }),
  C({ id: 'thornhare', name: 'Thornhare', terrain: 'meadow', rarity: 'common', cost: 2, atk: 3, hp: 2,
    text: 'On play: deal 1 damage to the creature opposite.', flavor: 'All ears, all thorns.', art: 'tall #8FD16A #F4FFE4 #2F7A3A stripes big bunny nubs fluffy none 2 2 bounce 0.9' }),
  C({ id: 'mossback', name: 'Mossback Tortoise', terrain: 'meadow', rarity: 'rare', cost: 3, atk: 1, hp: 7, tags: ['tough'],
    flourish: { cost: 1, text: 'Give the creatures beside it +2 health.' }, text: 'Takes 1 less damage.', flavor: 'Slow and steady wins the lane.', art: 'round #5C9A4A #CFE8B0 #2E5A28 patches sleepy none nubs none none 4 2 walk 1.15' }),
  C({ id: 'blossomstag', name: 'Blossom Stag', terrain: 'meadow', rarity: 'rare', cost: 3, atk: 3, hp: 4, tags: ['heal'],
    flourish: { cost: 1, text: 'Heal your hero 4.' }, text: '', flavor: 'Where it walks, spring follows.', art: 'tall #E9B4D0 #FFF2F8 #5FCB6A spots happy cat antlers fluffy none 4 2 walk 1.05' }),
  C({ id: 'oakheart', name: 'Elder Oakheart', terrain: 'meadow', rarity: 'legendary', cost: 5, atk: 4, hp: 9, tags: ['heal'],
    text: 'On play: your other Meadow creatures get +1/+1. At the start of your turn, heal every friendly creature 1.', flavor: 'It remembers when the world was a sketch.', art: 'pear #6B4A2A #A3D977 #2F7A3A stripes sleepy floppy antlers long leaf 2 2 walk 1.25' }),
  T({ id: 'bloomwell', name: 'Bloomwell', terrain: 'meadow', rarity: 'common', cost: 1, tags: ['heal'],
    text: 'Totem. At the start of your turn, heal the creature in this lane 2.', flavor: 'Drink deep.', art: '⛲' }),
  S({ id: 'rejuvenate', name: 'Rejuvenate', terrain: 'meadow', rarity: 'common', cost: 1, target: 'my_unit', tags: ['heal'],
    text: 'Fully heal a friendly creature and give it +1 health.', flavor: 'Good as new. Better, actually.', art: '🌱' }),

  // ---- 🔥 Ember -----------------------------------------------------------------------------------------------------
  C({ id: 'cinderpup', name: 'Cinderpup', terrain: 'ember', rarity: 'common', cost: 1, atk: 2, hp: 1, tags: ['burn'],
    flourish: { cost: 1, text: 'Deal 1 damage to the enemy hero.' }, text: '', flavor: 'Fetch! No, not the couch.', art: 'round #FF7A3D #FFD9A8 #C23B10 spots happy floppy none flame none 4 2 walk 0.85' }),
  C({ id: 'lavaling', name: 'Lavaling', terrain: 'ember', rarity: 'common', cost: 2, atk: 3, hp: 2,
    text: 'When it dies, deal 2 damage to the creature opposite.', flavor: 'It doesn’t go quietly.', art: 'blob #FF5A1F #FFB347 #8A1E05 spots one none nubs flame none 0 1 bounce 0.9' }),
  C({ id: 'blazefox', name: 'Blaze Fox', terrain: 'ember', rarity: 'rare', cost: 3, atk: 4, hp: 3, tags: ['burn'],
    text: 'On play: deal 2 damage to the enemy hero.', flavor: 'Nine tails, all on fire.', art: 'long #FF8A2C #FFF0D8 #D9480F stripes star cat none flame none 4 2 walk 1' }),
  C({ id: 'pyredrake', name: 'Pyre Drake', terrain: 'ember', rarity: 'epic', cost: 4, atk: 5, hp: 4,
    flourish: { cost: 2, text: 'Deal 3 damage to any enemy creature.', target: 'enemy_unit' }, text: '', flavor: 'It breathes in smoke and breathes out trouble.', art: 'long #D9361F #FFC86B #5A0E05 stripes star fins curly flame tiny 4 2 hover 1.1' }),
  C({ id: 'volcanotitan', name: 'Volcano Titan', terrain: 'ember', rarity: 'legendary', cost: 6, atk: 7, hp: 7, tags: ['burn'],
    text: 'On play: deal 2 damage to every enemy creature.', flavor: 'When it wakes, the map changes colour.', art: 'pear #5A2A20 #FF7A3D #FFD23F patches one none curly flame none 2 1 walk 1.25' }),
  T({ id: 'kindleshrine', name: 'Kindle Shrine', terrain: 'ember', rarity: 'common', cost: 1,
    text: 'Totem. The creature in this lane has +2 attack.', flavor: 'Keep it fed.', art: '🏮' }),
  S({ id: 'fireburst', name: 'Fireburst', terrain: 'ember', rarity: 'common', cost: 2, target: 'enemy_unit', tags: ['burn'],
    text: 'Deal 4 damage to an enemy creature.', flavor: 'Paint it red.', art: '💥' }),

  // ---- ❄️ Frost -----------------------------------------------------------------------------------------------------
  C({ id: 'snowpip', name: 'Snowpip', terrain: 'frost', rarity: 'common', cost: 1, atk: 1, hp: 2, tags: ['stun'],
    flourish: { cost: 1, text: 'Freeze the creature opposite (it skips its next attack).' }, text: '', flavor: 'Small. Cold. Smug.', art: 'round #EAF6FF #FFFFFF #6FD3FF none happy round none fluffy tiny 2 2 hover 0.8' }),
  C({ id: 'icicleram', name: 'Icicle Ram', terrain: 'frost', rarity: 'common', cost: 2, atk: 2, hp: 4, tags: ['stun'],
    text: 'Creatures it hits are frozen.', flavor: 'Head first, every time.', art: 'bean #BFE8FF #FFFFFF #2F7FBF patches sleepy floppy curly fluffy none 4 2 walk 1' }),
  C({ id: 'glacierowl', name: 'Glacier Owl', terrain: 'frost', rarity: 'rare', cost: 3, atk: 2, hp: 5, tags: ['draw'],
    text: 'On play: draw a card.', flavor: 'It has seen every winter.', art: 'round #9FD8F5 #F2FBFF #1D5A8A stars big cat none fin leaf 2 2 hover 1' }),
  C({ id: 'frostmaw', name: 'Frostmaw Yeti', terrain: 'frost', rarity: 'epic', cost: 4, atk: 4, hp: 6, tags: ['tough'],
    text: 'Takes 1 less damage. On play: lets out a frozen roar that freezes the creature opposite.', flavor: 'The avalanche is just it sneezing.', art: 'tall #F4FBFF #CFE9FF #5AA9E6 none sleepy round nubs none none 2 2 walk 1.2' }),
  C({ id: 'aurorawyrm', name: 'Aurora Wyrm', terrain: 'frost', rarity: 'legendary', cost: 6, atk: 6, hp: 6, tags: ['stun'],
    text: 'On play: freeze every enemy creature.', flavor: 'The sky’s own brushstroke.', art: 'long #7FE0FF #E8FFF8 #B57BFF stripes star fins unicorn long leaf 0 2 slither 1.2' }),
  T({ id: 'hoarfrost', name: 'Hoarfrost Pillar', terrain: 'frost', rarity: 'common', cost: 1, tags: ['tough'],
    text: 'Totem. The creature in this lane takes 1 less damage.', flavor: 'Lean on it. Briefly.', art: '🧊' }),
  S({ id: 'deepfreeze', name: 'Deep Freeze', terrain: 'frost', rarity: 'common', cost: 1, target: 'enemy_unit', tags: ['stun'],
    text: 'Deal 1 damage to an enemy creature and freeze it.', flavor: 'Hold that thought. Forever.', art: '❄️' }),

  // ---- 🍄 Bog -------------------------------------------------------------------------------------------------------
  C({ id: 'sporemite', name: 'Spore Mite', terrain: 'bog', rarity: 'common', cost: 1, atk: 1, hp: 1, tags: ['poison'],
    text: 'When it dies, poison the creature opposite (2).', flavor: 'Pop goes the problem.', art: 'blob #B58BFF #F0E4FF #6A3DBF spots big none nubs none none 6 2 walk 0.75' }),
  C({ id: 'mudslug', name: 'Mudslug', terrain: 'bog', rarity: 'common', cost: 2, atk: 2, hp: 3, tags: ['poison'],
    text: 'Creatures it hits are poisoned (1).', flavor: 'Leaves a trail. And a grudge.', art: 'long #7A5A3A #C9A87A #3D2470 spots sleepy none nubs long none 0 2 slither 0.95' }),
  C({ id: 'fungalshaman', name: 'Fungal Shaman', terrain: 'bog', rarity: 'rare', cost: 3, atk: 2, hp: 4,
    flourish: { cost: 1, text: 'Return the last creature of yours that died to your hand.' }, text: '', flavor: 'Death is just a long nap in the dirt.', art: 'pear #8A5ACF #EBD8FF #FF6FB5 spots sleepy floppy unicorn curl none 2 2 walk 1' }),
  C({ id: 'swamplurker', name: 'Swamp Lurker', terrain: 'bog', rarity: 'epic', cost: 4, atk: 4, hp: 5,
    text: 'Whenever any creature dies, it gets +1/+1.', flavor: 'It eats what the bog leaves behind.', art: 'blob #3D5A3A #8AA87A #9B6BFF patches one fins horns long none 4 3 slither 1.1' }),
  C({ id: 'rotqueen', name: 'Rot Queen', terrain: 'bog', rarity: 'legendary', cost: 5, atk: 4, hp: 7, tags: ['poison'],
    text: 'At the end of your turn, every enemy creature takes 1 damage.', flavor: 'Long live the rot.', art: 'tall #4A2A6A #C8A8FF #E8C8FF stars star floppy curly curl leaf 2 4 hover 1.2' }),
  T({ id: 'mirecauldron', name: 'Mire Cauldron', terrain: 'bog', rarity: 'common', cost: 1, tags: ['poison'],
    text: 'Totem. The creature in this lane poisons what it hits (1).', flavor: 'Stir counter-clockwise.', art: '🫕' }),
  S({ id: 'toxiccloud', name: 'Toxic Cloud', terrain: 'bog', rarity: 'rare', cost: 3, target: 'enemy_lane', tags: ['poison'],
    text: 'Deal 2 damage to the enemy creature in a lane and the ones beside it, and poison them (1).', flavor: 'Hold your breath. Longer.', art: '☁️' }),

  // ---- 🍭 Sugar -----------------------------------------------------------------------------------------------------
  C({ id: 'gumdropimp', name: 'Gumdrop Imp', terrain: 'sugar', rarity: 'common', cost: 1, atk: 1, hp: 2,
    text: 'On play: gain 1 paint this turn.', flavor: 'Sticky fingers, sweeter tricks.', art: 'round #FF6FB5 #FFE0F0 #FFD23F spots happy cat nubs curl tiny 2 2 bounce 0.8' }),
  C({ id: 'jellyfright', name: 'Jellyfright', terrain: 'sugar', rarity: 'common', cost: 2, atk: 2, hp: 3,
    flourish: { cost: 1, text: 'Swap places with a friendly creature next to it (or move into an empty lane next to it).', target: 'my_lane' }, text: '', flavor: 'Wibble. Wobble. Boo.', art: 'blob #8AE0FF #E8FAFF #FF6FB5 none big none none none none 0 2 bounce 0.95' }),
  C({ id: 'taffytwister', name: 'Taffy Twister', terrain: 'sugar', rarity: 'rare', cost: 3, atk: 3, hp: 3,
    text: 'On play: send the creature opposite back to its owner’s hand.', flavor: 'Stretched to the limit. Then further.', art: 'long #FFB3D9 #FFFFFF #7B5CFF stripes star bunny curly curl none 2 2 slither 1' }),
  C({ id: 'candiedknight', name: 'Candied Knight', terrain: 'sugar', rarity: 'epic', cost: 4, atk: 4, hp: 4, tags: ['shield'],
    text: 'Shield (the first damage it takes is blocked). On play: raises its lollipop shield over a friendly creature next to it, giving it a Shield too.', flavor: 'Hard candy shell, soft gooey courage.', art: 'tall #FF8AC2 #FFF0F8 #FFD23F stripes happy round unicorn fluffy none 2 2 walk 1.1' }),
  C({ id: 'sugarcolossus', name: 'Sugar Colossus', terrain: 'sugar', rarity: 'legendary', cost: 6, atk: 6, hp: 8, tags: ['draw'],
    text: 'On play: draw 2 cards.', flavor: 'Made from every birthday ever.', art: 'round #FF9AD0 #FFFFFF #8AE0FF stars star cat curly curl tiny 2 2 walk 1.25' }),
  T({ id: 'sprinklefountain', name: 'Sprinkle Fountain', terrain: 'sugar', rarity: 'rare', cost: 2,
    text: 'Totem. At the start of your turn, gain 1 extra paint.', flavor: 'It never runs dry. It never stops being loud.', art: '🍬' }),
  S({ id: 'sweettooth', name: 'Sweet Tooth', terrain: 'sugar', rarity: 'common', cost: 0, target: 'none', tags: ['draw'],
    text: 'Draw 2 cards. Your hero takes 2 damage.', flavor: 'Worth it.', art: '🍩' }),

  // ---- ⚡ Neon ------------------------------------------------------------------------------------------------------
  C({ id: 'voltbug', name: 'Volt Bug', terrain: 'neon', rarity: 'common', cost: 1, atk: 2, hp: 1,
    flourish: { cost: 1, text: 'Deal 1 damage to a random enemy creature.' }, text: '', flavor: 'Bzzt.', art: 'bean #F5E14A #FFFBD0 #22E3FF stripes star none antlers none tiny 6 2 hover 0.75' }),
  C({ id: 'circuitcat', name: 'Circuit Cat', terrain: 'neon', rarity: 'common', cost: 2, atk: 2, hp: 3, tags: ['pierce'],
    text: 'When it attacks, the enemy hero also takes 1 damage.', flavor: 'Nine lives, all backed up.', art: 'tall #2A2A40 #22E3FF #F5E14A stripes star cat nubs long none 4 2 walk 0.95' }),
  C({ id: 'laserlynx', name: 'Laser Lynx', terrain: 'neon', rarity: 'rare', cost: 3, atk: 3, hp: 4, tags: ['pierce'],
    text: 'Its attacks also deal 1 damage to the enemy creatures beside its target.', flavor: 'Sees in 4K.', art: 'long #3A2A6A #FF4FD8 #22E3FF stripes star cat none long none 4 2 walk 1.05' }),
  C({ id: 'mechamantis', name: 'Mecha Mantis', terrain: 'neon', rarity: 'epic', cost: 4, atk: 3, hp: 3, tags: ['shield'],
    text: 'Shield. Twin scythes: it strikes twice every time it attacks.', flavor: 'Firmware: hungry.', art: 'tall #8AFF6A #E8FFE0 #22E3FF stripes one none antlers none leaf 6 2 walk 1.05' }),
  C({ id: 'gridoverlord', name: 'Grid Overlord', terrain: 'neon', rarity: 'legendary', cost: 6, atk: 6, hp: 6,
    text: 'Your other creatures have +1 attack.', flavor: 'It runs the board. Literally.', art: 'pear #1A1A30 #F5E14A #FF4FD8 stars star fins unicorn fin leaf 0 6 hover 1.2' }),
  T({ id: 'teslacoil', name: 'Tesla Coil', terrain: 'neon', rarity: 'rare', cost: 2, tags: ['burn'],
    text: 'Totem. At the end of your turn, deal 1 damage to the enemy creature opposite this lane.', flavor: 'Do not lick.', art: '🗼' }),
  S({ id: 'overcharge', name: 'Overcharge', terrain: 'neon', rarity: 'common', cost: 1, target: 'my_unit',
    text: 'Give a friendly creature +3 attack this turn.', flavor: 'Unlimited power (for about a minute).', art: '🔋' }),

  // ---- wanderers (any deck) -----------------------------------------------------------------------------------------
  C({ id: 'pebblegolem', name: 'Pebble Golem', terrain: 'neutral', rarity: 'common', cost: 1, atk: 1, hp: 3,
    text: 'At the start of your turn, it stacks another pebble on itself: +1 health (up to 6).', flavor: 'It’s doing its best.', art: 'round #A8A0B8 #D8D2E4 #6A6278 patches sleepy none nubs none none 2 2 walk 0.9' }),
  C({ id: 'wanderingbard', name: 'Wandering Bard', terrain: 'neutral', rarity: 'common', cost: 2, atk: 2, hp: 2, tags: ['heal'],
    text: 'On play: heal your hero 3.', flavor: 'Knows a song for every scrape.', art: 'bean #FFC86B #FFF4D8 #B57BFF patches happy floppy none fluffy none 2 2 walk 0.95' }),
  C({ id: 'mimicchest', name: 'Mimic Chest', terrain: 'neutral', rarity: 'epic', cost: 3, atk: 3, hp: 3,
    text: 'On play: copy a random card from your opponent’s hand into yours.', flavor: 'Open it. Go on.', art: 'round #B07A42 #FFD23F #5A3A1A stripes one none nubs none none 4 1 bounce 1' }),
  S({ id: 'terraform', name: 'Terraform', terrain: 'neutral', rarity: 'rare', cost: 1, target: 'my_lane',
    text: 'Change one of your lanes to the terrain of the creature in it (or its neighbour’s), and draw a card.', flavor: 'Redecorating, aggressively.', art: '🗺️' }),
  S({ id: 'secondwind', name: 'Second Wind', terrain: 'neutral', rarity: 'epic', cost: 3, target: 'my_empty_lane',
    text: 'Bring back the last creature of yours that died, into an empty lane, with 2 health.', flavor: 'Not today.', art: '🌬️' }),
  S({ id: 'luckycoin', name: 'Lucky Coin', terrain: 'neutral', rarity: 'common', cost: 0, target: 'none',
    text: 'Gain 1 paint. If it lands heads (50%), draw a card too.', flavor: 'Call it in the air.', art: '🪙' }),

  // ---- 🌋 cataclysms: spells that change the whole board -------------------------------------------------------------
  S({ id: 'eruption', name: 'Eruption', terrain: 'ember', rarity: 'legendary', cost: 6, target: 'none', fx: 'eruption', tags: ['burn'],
    text: 'Cataclysm. A volcano bursts up through the board and erupts: lava destroys every creature and totem on both sides, and every lane becomes Ember. Draw a card.', flavor: 'Clean slate. Very, very hot slate.', art: '🌋' }),
  S({ id: 'avalanche', name: 'Avalanche', terrain: 'frost', rarity: 'epic', cost: 5, target: 'none', fx: 'avalanche', tags: ['stun'],
    text: 'Cataclysm. Snow thunders down the enemy side: 3 damage to every enemy creature, the survivors are frozen, and enemy lanes turn Frost.', flavor: 'Somebody sneezed.', art: '🏔️' }),
  S({ id: 'overgrowth', name: 'Overgrowth', terrain: 'meadow', rarity: 'epic', cost: 4, target: 'none', fx: 'overgrowth', tags: ['stun'],
    text: 'Cataclysm. Giant vines burst out of the table: all your lanes become Meadow, your creatures get +1/+1 and enemy creatures are tangled (frozen).', flavor: 'Nature finds a way. Through the floor.', art: '🌿' }),
  S({ id: 'bogrise', name: 'Rising Bog', terrain: 'bog', rarity: 'epic', cost: 4, target: 'none', fx: 'bogrise', tags: ['poison'],
    text: 'Cataclysm. The swamp floods the enemy side: enemy lanes turn Bog, and every enemy creature takes 1 damage and is poisoned (2).', flavor: 'It came up through the drains.', art: '🫧' }),
  S({ id: 'cyclone', name: 'Candy Cyclone', terrain: 'sugar', rarity: 'epic', cost: 4, target: 'none', fx: 'cyclone', tags: ['stun'],
    text: 'Cataclysm. A candy tornado sweeps up every enemy creature and drops them back in random lanes, dizzy: 1 damage and frozen.', flavor: 'Sweet. Spinning. Sick.', art: '🌪️' }),
  S({ id: 'thunderstorm', name: 'Thunderstorm', terrain: 'neon', rarity: 'epic', cost: 4, target: 'none', fx: 'thunderstorm', tags: ['burn'],
    text: 'Cataclysm. Storm clouds roll over the board and 4 lightning bolts strike random enemies — creatures or the hero — for 2 each.', flavor: 'Ka-BZZT.', art: '🌩️' }),
  S({ id: 'blackhole', name: 'Black Hole', terrain: 'neon', rarity: 'legendary', cost: 6, target: 'any_lane', fx: 'blackhole',
    text: 'Cataclysm. Tear open a black hole in any lane: everything in it on both sides — creatures and totems — is swallowed.', flavor: 'Don’t look directly at it. Or indirectly.', art: '🕳️' }),
  S({ id: 'earthquake', name: 'Earthquake', terrain: 'neutral', rarity: 'rare', cost: 4, target: 'none', fx: 'earthquake',
    text: 'Cataclysm. The board cracks apart: every creature takes 2 damage and every totem crumbles.', flavor: 'The table had it coming.', art: '🪨' }),
  S({ id: 'tidalwave', name: 'Tidal Wave', terrain: 'neutral', rarity: 'epic', cost: 5, target: 'none', fx: 'tidalwave',
    text: 'Cataclysm. A giant wave crashes across the board and washes every creature back into its owner’s hand.', flavor: 'Surf’s up. Everything else is down.', art: '🌊' }),
  S({ id: 'eclipse', name: 'Eclipse', terrain: 'neutral', rarity: 'rare', cost: 3, target: 'none', fx: 'eclipse',
    text: 'Cataclysm. The sun goes dark: every creature on the board swaps its attack and health.', flavor: 'Everything looks different in the dark.', art: '🌑' }),
  S({ id: 'meteors', name: 'Meteor Shower', terrain: 'neutral', rarity: 'legendary', cost: 5, target: 'none', fx: 'meteors', tags: ['burn'],
    text: 'Cataclysm. 6 meteors rain down on random spots — any creature on the board, or the enemy hero — for 3 damage each.', flavor: 'Make a wish. Then duck.', art: '☄️' }),

  // ---- 🏰 wonders: landmarks that stand beside a lane and keep doing something ---------------------------------------------
  T({ id: 'smolderpeak', name: 'Smoldering Peak', terrain: 'ember', rarity: 'epic', cost: 3, wonder: true, tags: ['burn'],
    text: 'Wonder. A volcano that wakes up: on your 3rd turn after it’s built, it erupts — 3 damage to every enemy creature and the enemy hero.', flavor: 'Tick. Tick. Boom.', art: '🌋' }),
  T({ id: 'beanstalk', name: 'Sky Beanstalk', terrain: 'meadow', rarity: 'rare', cost: 2, wonder: true,
    text: 'Wonder. At the start of your turn, the creature in this lane gets +1/+1.', flavor: 'It doesn’t stop at the clouds.', art: '🌱' }),
  T({ id: 'mirrorlake', name: 'Mirror Lake', terrain: 'frost', rarity: 'rare', cost: 2, wonder: true, tags: ['stun'],
    text: 'Wonder. Any enemy creature played opposite this lane is frozen solid.', flavor: 'Look closer. Closer.', art: '🪞' }),
  T({ id: 'toadstoolhut', name: 'Toadstool Hut', terrain: 'bog', rarity: 'epic', cost: 3, wonder: true,
    text: 'Wonder. At the start of your turn, if this lane has no creature, a Spore Mite crawls out of the hut.', flavor: 'Somebody’s always home.', art: '🍄' }),
  T({ id: 'gumballmachine', name: 'Gumball Machine', terrain: 'sugar', rarity: 'rare', cost: 2, wonder: true, tags: ['draw'],
    text: 'Wonder. At the start of your turn, a random card that costs 0 or 1 rolls out into your hand.', flavor: 'One coin. Infinite flavours.', art: '🍬' }),
  T({ id: 'stormspire', name: 'Storm Spire', terrain: 'neon', rarity: 'epic', cost: 4, wonder: true, tags: ['burn'],
    text: 'Wonder. At the end of your turn, lightning strikes a random enemy creature for 2.', flavor: 'It hums a little louder each night.', art: '🗼' }),
  T({ id: 'riftgate', name: 'Rift Gate', terrain: 'neutral', rarity: 'legendary', cost: 5, wonder: true,
    text: 'Wonder. At the start of your turn, if this lane has no creature, the next creature in your deck steps through the gate.', flavor: 'Where do they come from? Don’t ask.', art: '🌀' }),
];
/** What a card is called on its type line. */
/** How each kind of card looks, so you can tell them apart at a glance */
export const KIND_STYLE = {
  Creature: { color: '#3DDC97', dark: '#0E5A3A', icon: '🐾', tip: 'Stays in a lane and fights' },
  Spell: { color: '#B57BFF', dark: '#3A1A6A', icon: '✨', tip: 'Happens once, then it’s gone' },
  Totem: { color: '#FFB13D', dark: '#6A3A0A', icon: '🗿', tip: 'Sits behind a lane and keeps working' },
  Cataclysm: { color: '#FF5A2A', dark: '#6A1A08', icon: '🌋', tip: 'Changes the whole board' },
  Wonder: { color: '#FFE14D', dark: '#6A5208', icon: '🏰', tip: 'A landmark that works every turn' },
} as const;
export const kindStyle = (c: Card) => KIND_STYLE[kindName(c)];
export const kindName = (c: Card): keyof typeof KIND_STYLE => (c.fx ? 'Cataclysm' : c.wonder ? 'Wonder' : c.kind === 'creature' ? 'Creature' : c.kind === 'totem' ? 'Totem' : 'Spell');
export const CARD: Record<string, Card> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/** The match-wide twists: one is drawn at random each match, so no two games play the same. */
export const EVENTS = [
  { id: 'none', name: 'Clear skies', emoji: '🌤️', text: 'A fair fight. No tricks.' },
  { id: 'bloodmoon', name: 'Blood Moon', emoji: '🌕', text: 'Every creature has +1 attack.' },
  { id: 'rain', name: 'Painters’ Rain', emoji: '🌧️', text: 'Both players start with 1 extra paint each turn.' },
  { id: 'rumble', name: 'Rumbling Ground', emoji: '🌋', text: 'At the end of every round, every creature takes 1 damage.' },
  { id: 'bounty', name: 'Bountiful Harvest', emoji: '🌾', text: 'Draw 2 cards at the start of each turn instead of 1.' },
  { id: 'giants', name: 'Age of Giants', emoji: '🗿', text: 'Every creature has +2 health.' },
  { id: 'homesick', name: 'Homecoming', emoji: '🏡', text: 'Creatures on their own terrain get +1/+1 instead of +1 attack.' },
  { id: 'duststorm', name: 'Dust Storm', emoji: '🌪️', text: 'At the start of each round, one random lane on each side changes terrain.' },
  { id: 'heroes', name: 'Heroes’ Day', emoji: '🛡️', text: 'Heroes start with 32 health.' },
] as const;
export type EventId = (typeof EVENTS)[number]['id'];

export const DECK_SIZE = 20;
/** How many cards a hand can hold (the engine burns draws past this). */
export const HAND_MAX_UI = 10;
export const LANES = 4;
export const HERO_HP = 25;

/** Is a deck legal? (20 cards, owned, copy limits, 4 terrains) */
export function checkDeck(cards: string[], terrains: string[], owned?: Record<string, number>): string | null {
  if (cards.length !== DECK_SIZE) return `A deck needs exactly ${DECK_SIZE} cards`;
  if (terrains.length !== LANES || terrains.some((t) => !(TERRAINS as readonly string[]).includes(t))) return 'Pick 4 lane terrains';
  const n: Record<string, number> = {};
  for (const id of cards) {
    const c = CARD[id]; if (!c) return 'Unknown card';
    n[id] = (n[id] ?? 0) + 1;
    if (n[id] > RARITY_INFO[c.rarity].max) return `Only ${RARITY_INFO[c.rarity].max} ${c.name} per deck`;
    if (owned && n[id] > (owned[id] ?? 0)) return `You don’t own enough ${c.name}`;
  }
  return null;
}

/** The two starter decks everyone gets: Meadow + Ember, Frost + Sugar (and their cards). */
export const STARTERS: { name: string; terrains: string[]; cards: string[] }[] = [
  { name: 'Wildfire', terrains: ['meadow', 'ember', 'meadow', 'ember'],
    cards: ['sproutling', 'sproutling', 'thornhare', 'thornhare', 'bloomwell', 'rejuvenate', 'cinderpup', 'cinderpup', 'lavaling', 'lavaling', 'kindleshrine', 'kindleshrine', 'fireburst', 'fireburst', 'blossomstag', 'blazefox', 'eruption', 'smolderpeak', 'wanderingbard', 'earthquake'] },
  { name: 'Sugar Frost', terrains: ['frost', 'sugar', 'frost', 'sugar'],
    cards: ['snowpip', 'snowpip', 'icicleram', 'icicleram', 'hoarfrost', 'deepfreeze', 'deepfreeze', 'gumdropimp', 'gumdropimp', 'jellyfright', 'jellyfright', 'sweettooth', 'glacierowl', 'taffytwister', 'avalanche', 'wanderingbard', 'wanderingbard', 'cyclone', 'gumballmachine', 'mirrorlake'] },
];
