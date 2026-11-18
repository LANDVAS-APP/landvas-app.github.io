// The twenty-one enchantments, their splice Traits, the 190 hybrids and the seven evils — a client mirror of the server's
// private.ench_info / private.ench_hybrid / private.pandora_evils (the server is authoritative).
//
// Plain words everywhere: a splice "gene" is a Trait, a "resonant" pair is a Perfect Match, and every hybrid card says
// what each side actually gets, with numbers.
export type EnchantKind = 'goose' | 'genie' | 'map' | 'parasite' | 'cuckoo' | 'pandora' | 'splice' | 'clockwork' | 'sizeray' | 'shard' | 'wormhole' | 'oracle'
  | 'stormcoil' | 'spyglass' | 'origami' | 'crucible' | 'puppeteer' | 'deck' | 'glyph' | 'sun' | 'rod' | 'dejavu';

export type KindInfo = {
  id: EnchantKind; name: string; emoji: string; a: string; b: string; ink: string;
  tagline: string; how: string[]; gene: string | null; geneName: string | null; geneText: string | null;
  /** what its rewards are, for "Best for: …" */
  noun: string;
};

export const KINDS: Record<EnchantKind, KindInfo> = {
  goose: { id: 'goose', name: 'Golden Goose', emoji: '🪿', a: '#FFD23F', b: '#FF9F1C', ink: '#3A2600', noun: 'egg harvests',
    tagline: 'Lays a golden egg that grows the longer you dare to wait.',
    how: ['The egg grows for hours — collect it whenever you like (3% are Platinum, worth ×3).', 'Rub the egg to polish it every 10 minutes for extra Ink.', 'A fox sneaks in at secret times. Catch it in its window or it bites a chunk out of the egg.', 'Every egg the fox never touched builds a golden streak (+5% each).'],
    gene: 'golden', geneName: 'Golden', geneText: 'earns 1.5× Ink' },
  genie: { id: 'genie', name: 'Genie', emoji: '🧞', a: '#8B5CFF', b: '#22E3FF', ink: '#14082E', noun: 'wishes',
    tagline: 'Rub the lamp. Three wishes — and one that is forbidden.',
    how: ['A wish recharges every 8 hours; hold up to three.', 'Wish for Ink, Luck, Enchanted Luck, or a Golden Hour (your next 3 minigame wins pay ×2).', 'With three stored, the Forbidden Wish: seven wishes… or a twisted fortune and a cold lamp… or the Genie goes free, leaving a Mythic+ roll ticket.'],
    gene: 'wish', geneName: 'Wishing', geneText: 'keeps a charge it spends 30% of the time (one with no charges earns +25% Ink instead)' },
  map: { id: 'map', name: 'Treasure Map', emoji: '🗺️', a: '#E9C46A', b: '#8B5E34', ink: '#2B1A08', noun: 'treasure hunts',
    tagline: 'Four torn pieces hidden on other players’ land. X marks the spot.',
    how: ['Draw a map: four pieces are hidden on other players’ plots nearby (or buried in the wild).', 'Walk your explorer to each piece to pick it up — the plot’s owner gets a finder’s tip.', 'With all four, an X appears. Stand on it and dig for the chest: Ink, and sometimes an Epic+ or Legendary+ roll ticket.'],
    gene: 'seek', geneName: 'Seeking', geneText: 'buries a chest by its plot with 1 in 4 of its rewards — dig it up for +50 Ink' },
  parasite: { id: 'parasite', name: 'Parasite', emoji: '🦠', a: '#7CFF6B', b: '#B026FF', ink: '#0B1F08', noun: 'feeding',
    tagline: 'Wraps itself around a stranger’s plot and feeds — until it becomes something more.',
    how: ['Release it: it wraps around a random player’s plot — you can see it there on the map. They can peel it off (and get paid for it).', 'If it’s still there after 20 hours, harvest it for Ink.', '3 feeds: a Parasite. 10 feeds: a Symbiote — its hosts can’t peel it off, they share the meal, and can welcome it for more.'],
    gene: 'spread', geneName: 'Spreading', geneText: 'earns 15% more Ink and drops a gift of Ink on a random player' },
  cuckoo: { id: 'cuckoo', name: 'Cuckoo Egg', emoji: '🥚', a: '#4CC9F0', b: '#F72585', ink: '#06222C', noun: 'hatching',
    tagline: 'The Cuckoo flew away and left you an egg. You choose what hatches.',
    how: ['Pick what hatches: the Spyglass, the Origami Pocket, the Crucible, the Puppeteer, the Fated Deck, the Glyphcaster, the Pocket Sun, the Dowsing Rod or Déjà Vu.', 'It keeps your Cuckoo’s level, XP, Stars, nickname and chronicle.'],
    gene: null, geneName: null, geneText: null },
  pandora: { id: 'pandora', name: 'Pandora’s Box', emoji: '🏺', a: '#FF4D6D', b: '#2A0A3D', ink: '#1A0410', noun: 'opening the box',
    tagline: 'Lift the lid. Gifts — or one of seven evils.',
    how: ['Once a day, lift the lid one, two or three notches. Wider means bigger gifts — and likelier evils.', 'Each evil that escapes curses you for a while, and can only escape once.', 'When all seven are out, Hope rises from the bottom: a Legendary+ roll ticket and a fortune. The box closes again, richer.'],
    gene: 'chaos', geneName: 'Chaos', geneText: 'every reward is a gamble: 0.5× to 2.5× Ink' },
  splice: { id: 'splice', name: 'Splice', emoji: '🧪', a: '#00F5D4', b: '#9B5DE5', ink: '#04211D', noun: 'splicing',
    tagline: 'Fuse enchantments into living hybrids.',
    how: ['Swap: two of your enchantments trade Traits for 24 hours. Graft: one lends its Trait at double strength, and sleeps. Chimera: both doubled, with a roar every 3 hours (sometimes unstable).',
      'Trinity: three at once (two charges). Or splice with a friend’s enchantment, or with one of your plots.',
      '190 hybrids, 36 of them Perfect Matches (Traits doubled) — and a few secret Aberrations. Charges come back over time (more plots, more charges).'],
    gene: null, geneName: null, geneText: null },
  clockwork: { id: 'clockwork', name: 'Clockwork', emoji: '⚙️', a: '#D4A373', b: '#6C584C', ink: '#20170E', noun: 'bending time',
    tagline: 'Wind it up. Then bend time.',
    how: ['Wind the key (15 turns a day, 8 minutes each); it also ticks up on its own. Wind the day’s last turn and it chimes: 30–50 Ink.', 'Spend the minutes to fast-forward any enchantment: grow an egg, hatch a chick, recharge a wish.', 'Or freeze one — a frozen spliced hybrid stays fused for longer.'],
    gene: 'tempo', geneName: 'Tempo', geneText: 'its timers run 3× as fast' },
  sizeray: { id: 'sizeray', name: 'Size Ray', emoji: '📡', a: '#39FF14', b: '#FF00E5', ink: '#071F05', noun: 'zapping',
    tagline: 'Pick any plot on the map. Make it 100× bigger — or 100× smaller.',
    how: ['Pick any plot on the map, choose GROW or SHRINK, and fire as the needle hits its peak. Its drawing goes 100× bigger — or 100× smaller — on everyone’s map. A PERFECT shot lasts 12 hours; a total miss backfires.',
      'Your own plot, GIANT: its drawing towers 100 plots wide over the neighbourhood, its minigames pay ×1.5–2, and other players can visit and tip it — but Parasites and the Leviathan go for giants first.',
      'Your own plot, TINY: shrunk to a hundredth (bring a magnifying glass) — nobody can find it (Parasites, foxes), its enchantment’s timers run twice as fast and three micro-gems hide in it — but its minigames pay less.',
      'Someone else’s plot: a prank! It goes giant or tiny on everyone’s map for up to 3 hours — only for show, nothing about their game changes. They’re told it was you and can undo it. One prank per player every 12 hours, and a prank that misses bounces back onto your own plot.',
      'Quick shots too: grow an enchantment’s next reward, shrink a goose’s fox, or shrink a parasite off your land. 3 charges; one returns every 8 hours.'],
    gene: 'grow', geneName: 'Giant', geneText: 'earns 2× Ink' },
  shard: { id: 'shard', name: 'Mirror Shard', emoji: '🪞', a: '#C0F5FF', b: '#7DD3FC', ink: '#05202A', noun: 'reflections',
    tagline: 'Look into it, and become what you see.',
    how: ['Gaze: three of other players’ enchantments are reflected in the glass.', 'Step through one and for 24 hours your shard becomes it — its owner is told, and tipped.', 'Every reflection cracks the glass. At seven cracks it shatters into +20 Luck and Enchanted Luck, and mends.'],
    gene: 'echo', geneName: 'Echo', geneText: '35% of its rewards are paid twice' },
  wormhole: { id: 'wormhole', name: 'Wormhole', emoji: '🌀', a: '#7B5CFF', b: '#00E0FF', ink: '#0A0630', noun: 'linked plots',
    tagline: 'Fold the map. Link two of your plots across the world.',
    how: ['Trace the spiral to open it — quicker and smoother is more stable (6 to 18 hours). Then pick the far end: a plot of yours within 100 miles (anywhere on Earth from level 5; a third plot at level 10).',
      'While it’s open, minigame wins at either end pay 30% more, and Giant or Tiny at one end reaches the other.',
      'Tap it on the map to fly through. Every few hours something shoots out of the far end — catch it before it’s gone. Recharges in a day.'],
    gene: 'linked', geneName: 'Linked', geneText: 'works as if on a second plot: +40% Ink' },
  oracle: { id: 'oracle', name: 'Oracle Eye', emoji: '👁️', a: '#FF5CDB', b: '#5B2BFF', ink: '#1C0730', noun: 'prophecies',
    tagline: 'It sees what’s coming. And it is never wrong.',
    how: ['Once a day, gaze at your next plot rolls (minigame rewards from level 3; Pandora’s lid and the Goose’s eggs from level 5). The cards show the next 3 outcomes — the server locks them in.',
      'Rewrite fate: swap two cards, or burn one for a new draw (it might come out worse).',
      'Every card that comes true pays the Eye 8 Ink. Seal a prophecy about a friend’s next roll: when it comes true, you both get Ink. At level 10 it sees 5 cards and you can rewrite twice.'],
    gene: 'foresight', geneName: 'Foresight', geneText: 'earns 20% more Ink and sees 35% of bad luck coming (and dodges it)' },
  stormcoil: { id: 'stormcoil', name: 'Storm Coil', emoji: '⚡', a: '#7DF9FF', b: '#3D5AFE', ink: '#04102E', noun: 'lightning',
    tagline: 'Crank it up. Call down a storm on your hybrids.',
    how: ['Crank it full, then call a 3-minute thunderstorm over your plots — live, on the map too. Bolts gather and strike: tap them as they land.',
      'A bolt on a spliced enchantment mutates it: +6 hours, a surge (its Traits doubled), an overcharge (its next reward ×2) — or, 1 in 6, a secret Aberration.',
      'Bolts on your plots pay Ink; ones nobody catches can scorch the plot (its minigames −20% for an hour). Stray bolts land on neighbours’ plots — anyone can catch those.',
      'One storm a day (two at level 10).'],
    gene: 'charged', geneName: 'Charged', geneText: 'earns 25% more Ink, and a splice with it is 3× as likely to mutate into an Aberration' },
  spyglass: { id: 'spyglass', name: 'Spyglass', emoji: '🔭', a: '#F4C95D', b: '#3A86FF', ink: '#1B1405', noun: 'sightings',
    tagline: 'See what an unclaimed plot holds — before anyone else.',
    how: ['Three looks a day. Pick an unclaimed plot on the map within 1 km of your explorer or any of your plots, and the glass shows its rarity.',
      'Each reading is a roll made for you alone, kept on the server. Claim the plot within 24 hours and that reading is your roll.',
      'Anyone else who claims it gets their own roll — so a tip is worth nothing to them. If someone claims it first, your look comes back.',
      'An Enchanted reading only says ✨ something stirs — what it is waits for the claim. Ultras show; once in a great while, so does a free Crown.',
      'Claiming a plot you sighted pays the Spyglass.'],
    gene: 'farsight', geneName: 'Farsight', geneText: 'reaches twice as far on the map (one that reaches for nothing scouts you a private reading a day)' },
  origami: { id: 'origami', name: 'Origami Pocket', emoji: '🦢', a: '#FFF3E0', b: '#FF6F91', ink: '#2A1420', noun: 'folded plots',
    tagline: 'Fold a plot into a paper crane. Unfold it anywhere you can stand.',
    how: ['Fold one of your plots: it folds itself up crease by crease and slips into your pocket. It stays yours and keeps earning rent.',
      'Unfold it on any free spot you could claim. It brings its rarity, shine, type, level, game progress, name — and its drawing.',
      'The spot it leaves takes the rarity the new spot would have had — folding never leaves a copy behind. A fresh crease pays +25% in its minigames for a day.',
      'One fold a day (two at level 5, three at level 10). Crowns and enchanted plots can’t be folded (until ★3).'],
    gene: 'folded', geneName: 'Folded', geneText: 'gets a fold once a day: tap it and its longest wait is cut in half' },
  crucible: { id: 'crucible', name: 'Crucible', emoji: '🔥', a: '#FF7A00', b: '#FFD23F', ink: '#2B0A00', noun: 'forged plots',
    tagline: 'Melt plots down. Strike one up a rarity.',
    how: ['Melt any of your plots — no limit. Each one becomes Heat (rarer plots, far more) and metal, and goes back to the world at its spot’s own roll.',
      'Strike one of your plots on the anvil: its chance to rise a tier grows with the Heat, a little at a time. Higher tiers need far more. A miss keeps half the Heat.',
      'Past Mythic it can strike an Ultra — and past an Ultra, a Crown (while that spot’s crown is free). Both are very, very hard. Pump the bellows for a little more.',
      'Metal makes temper runes, eight artifacts (a horseshoe, a bell, a lantern, an anchor, a Golden Nest for your goose, a Lodestone, a Phoenix Feather and an Ink Amphora — one of each is the Grand Set), inlays for your plots and monuments everyone can see.'],
    gene: 'trick', geneName: 'Tempered', geneText: 'dodges half its bad luck, and its plot is tempered: no tramples, no Parasites, no pranks' },
  puppeteer: { id: 'puppeteer', name: 'Puppeteer', emoji: '🎭', a: '#E63946', b: '#FFB703', ink: '#2A0509', noun: 'puppet shows',
    tagline: 'A puppet that plays your plots’ minigames by itself — ten levels a string.',
    how: ['Put plots on its playlist — yours, or anyone’s within 25 km (100 km from level 5, anywhere at ★2) — and start the show. The puppet plays every level itself, live on its stage: you just watch.',
      'Each string is ten levels in a row on one plot (three tangles and it snaps). Strings stack to 10; one comes back every hour (every half hour at ★1). The show plays on while you’re away.',
      'A cleared level brings in that minigame’s win — what the level pays you by hand there, your plot’s level and rarity multiplying it (an ultra’s too) — at 75% (all of it at ★5), and it’s on the live feed. Your plots climb their own levels; anyone else’s plot climbs your puppet’s own ladder there and its owner is tipped. ★3: the day’s first string is free, its first three levels ×3.'],
    gene: 'strings', geneName: 'Strings', geneText: 'gets a puppet: once a day it does one of its chores for you (polishes the egg, winds the key…)' },
  deck: { id: 'deck', name: 'Fated Deck', emoji: '🃏', a: '#B388FF', b: '#FFD166', ink: '#14062A', noun: 'fortunes',
    tagline: 'Turn a card. Let it shape your day.',
    how: ['Once a day, three cards lie face down. Turn one of the 22 great cards: upright, or reversed — a bigger effect with a catch.',
      'Ink, Luck, wins that pay double, enchantments that glow, a Leviathan you hit harder, a plot reborn as another kind, a roll ticket.',
      'Level 4: the table is a Past–Present–Future spread — turn all three, and each upright card strengthens the next. Level 8: a five-card Grand Spread once a week.',
      'Every card goes into your deck. Gilded ones are rare. Collect all 22 for an Epic-or-better ticket and the title Fate-Weaver.'],
    gene: 'fated', geneName: 'Fated', geneText: 'draws a card with 1 in 10 of its rewards — and the card comes true' },
  glyph: { id: 'glyph', name: 'Glyphcaster', emoji: '✍️', a: '#4DD0E1', b: '#7C4DFF', ink: '#04161C', noun: 'spells',
    tagline: 'Trace a glyph with your finger. Cast it.',
    how: ['Draw a glyph you know and it casts — the neater the drawing, the stronger the spell. Mana refills through the day.',
      '24 glyphs, 4 of them secret. You start with three; the rest turn up as you cast and study — and in minigame wins, Leviathan loot, chests and rare plots.',
      'The Spellbook shows every glyph you’ve found: its shape, what it does, its cost, your best drawing and its mastery (10 casts and it costs less).'],
    gene: 'inscribed', geneName: 'Inscribed', geneText: 'gets a rune: trace it once a day and it casts that glyph’s spell for free' },
  sun: { id: 'sun', name: 'Pocket Sun', emoji: '☀️', a: '#FFB703', b: '#FF5E3A', ink: '#2B1200', noun: 'your own Hot Zone',
    tagline: 'A newborn star in a glass orb. Throw it onto the map: your own private Hot Zone.',
    how: ['Flick the orb onto any spot within 2 km of you or your plots. It blooms into your own Hot Zone — 150 m across at level 1, up to 400 m at level 10 — and burns for 6 hours. One a day.',
      'Inside it, for you alone: ultras ×2, shinies ×2, and three sunspots that roll a tier higher.',
      'Rub the orb to stoke it: Hot is ×3 (a quarter smaller), White-hot ×4 (half the size, burning twice as fast). Past 95 heat, a rub can snuff it out.',
      'Once a day, a Solar Flare: a ring sweeps out — tap as it peaks for up to 2 minutes where every claim inside keeps the better of two rolls.',
      'Or park it in orbit over your plots: their minigames pay ×1.25 and your enchantments there tick 10% faster. Overlap the daily Hot Zone for a Conjunction; share it with your party.'],
    gene: 'radiant', geneName: 'Radiant', geneText: 'carries a tiny sun of its own: claims near its plot roll hotter, and its timers run faster' },
  rod: { id: 'rod', name: 'Dowsing Rod', emoji: '🪄', a: '#7FE0C3', b: '#2F80ED', ink: '#04201A', noun: 'aimed rolls',
    tagline: 'Tell it what you want to roll. It will find it — eventually.',
    how: ['Tune it to a target: a rarity (Uncommon to Mythic), Shiny, any Ultra, one Ultra, Enchanted, or one kind of enchantment.',
      'While it’s tuned, that target is harder to roll — half the natural chance (a third for one Ultra or one kind). But every roll that misses pushes the rod deeper.',
      'At full depth the next roll IS the target. Full depth is 3× the target’s natural wait (4× for a specific pick) — shown on the dial before you choose.',
      'Anything better than the target is still yours. A natural hit the rod holds back pushes it 10% deeper. Only your most recently tuned rod dowses.'],
    gene: 'divining', geneName: 'Divining', geneText: 'divines one outcome of its own luck: harder each time, certain in the end' },
  dejavu: { id: 'dejavu', name: 'Déjà Vu', emoji: '🫙', a: '#C4B5FD', b: '#38BDF8', ink: '#0F0A2A', noun: 'moments that happen twice',
    tagline: 'Catch a moment in a jar. Let it happen again — whenever you like.',
    how: ['While something special is happening near you — the day’s Hot Zone, a Solar Flare, the Leviathan’s Weak Spot, a storm’s lightning, a falling star, your Golden Hour — swipe the jar through it and twist the lid shut.',
      'Uncork it later, anywhere: the Hot Zone becomes your own Déjà Vu zone (ultras ×2.5 for 15 minutes), a Flare a zone where claims keep the better of two rolls, a Weak Spot hits everyone again, a bolt mutates one of your hybrids, a star falls into your hand, a Golden Hour starts again.',
      'The jar holds 3 moments. Each fades as it waits — full strength to half over 7 days, then it’s gone — and each Hot Zone, storm, shower or weak moment can be caught once.'],
    gene: 'preserved', geneName: 'Preserved', geneText: 'the good it makes lasts 1.5× longer, and the bad on it passes 1.5× sooner' },
};
export const KIND_ORDER: EnchantKind[] = ['goose', 'genie', 'map', 'parasite', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle', 'stormcoil',
  'spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph', 'sun', 'rod', 'dejavu'];
/** what a Cuckoo Egg can hatch into */
export const HATCHABLE: EnchantKind[] = ['spyglass', 'origami', 'crucible', 'puppeteer', 'deck', 'glyph', 'sun', 'rod', 'dejavu'];
export const kindInfo = (k: string | null | undefined): KindInfo => KINDS[(k ?? 'goose') as EnchantKind] ?? KINDS.goose;

/** the 190 hybrids: [name, Perfect Match] (mirrors private.ench_hybrids) */
export const HYBRIDS: Record<string, [string, boolean]> = {
  'dejavu+goose': ['Preserved Egg', false], 'dejavu+genie': ['Wish in a Jar', false], 'dejavu+map': ['Jarred Map', false],
  'dejavu+parasite': ['Specimen Jar', false], 'dejavu+pandora': ['Bottled Evil', true], 'clockwork+dejavu': ['Time in a Bottle', true],
  'dejavu+sizeray': ['Jarred Giant', false], 'dejavu+shard': ['Bottled Reflection', false], 'dejavu+wormhole': ['Bottleneck', false],
  'dejavu+oracle': ['Jar of Omens', false], 'dejavu+sun': ['Sunjar', false], 'dejavu+rod': ['Deep Jar', false],
  'dejavu+stormcoil': ['Lightning in a Bottle', true], 'dejavu+spyglass': ['Ship in a Bottle', false], 'dejavu+origami': ['Folded Moment', false],
  'crucible+dejavu': ['Jar of Embers', false], 'dejavu+puppeteer': ['Encore Jar', false], 'deck+dejavu': ['Card in a Jar', false],
  'dejavu+glyph': ['Bottled Spell', false],
  'map+rod': ['Divining Map', true], 'map+sun': ['Sunstone Map', false], 'rod+sun': ['Sunwell', true],
  'deck+map': ['Fortune’s Map', false], 'deck+rod': ['Wand Card', false], 'deck+sun': ['The Sun Card', true],
  'genie+map': ['Cartographer Djinn', false], 'genie+rod': ['Djinn of Wells', false], 'genie+sun': ['Djinn of Noon', false],
  'glyph+map': ['Rune Map', false], 'glyph+rod': ['Rune Wand', false], 'glyph+sun': ['Sun Rune', false],
  'goose+map': ['Treasure Goose', false], 'goose+rod': ['Water-Witch Goose', false], 'goose+sun': ['Sunrise Goose', false],
  'map+shard': ['Looking-Glass Map', true], 'rod+shard': ['Scrying Pool', false], 'shard+sun': ['Burning Glass', false],
  'deck+genie': ['Djinn’s Gamble', false], 'deck+glyph': ['Tarot Sigil', false], 'deck+goose': ['Fortune Goose', false],
  'deck+shard': ['Mirror Hand', false], 'map+oracle': ['Seer’s Map', false], 'oracle+rod': ['Oracle’s Well', false],
  'oracle+sun': ['Eye of Dawn', false], 'deck+oracle': ['Book of Fates', true], 'genie+glyph': ['Lamp Script', false],
  'genie+goose': ['Wishing Goose', false], 'genie+shard': ['Mirror Djinn', false], 'glyph+goose': ['Rune Goose', false],
  'glyph+shard': ['Mirror Script', false], 'goose+shard': ['Mirror Goose', false], 'map+origami': ['Folded Atlas', true],
  'map+pandora': ['Map of Woe', false], 'map+sizeray': ['Atlas Map', false], 'origami+rod': ['Paper Compass', false],
  'origami+sun': ['Paper Lantern', false], 'pandora+rod': ['Wishing-Well Box', false], 'pandora+sun': ['Box of Dawn', false],
  'rod+sizeray': ['Giant’s Staff', false], 'sizeray+sun': ['Solar Lens', false], 'crucible+map': ['Smelter’s Map', false],
  'crucible+rod': ['Ore Finder', false], 'crucible+sun': ['Sunforge', true], 'deck+origami': ['House of Cards', true],
  'deck+pandora': ['Wild Card', false], 'deck+sizeray': ['Giant’s Hand', false], 'genie+oracle': ['Djinn of Fate', true],
  'glyph+oracle': ['Eye of Runes', false], 'goose+oracle': ['Augur Goose', false], 'map+parasite': ['Blight Map', false],
  'map+spyglass': ['Pirate’s Glass', true], 'map+wormhole': ['Shortcut Map', true], 'oracle+shard': ['Scrying Glass', false],
  'parasite+rod': ['Root Worm', false], 'parasite+sun': ['Sunworm', false], 'rod+spyglass': ['Prospector’s Glass', false],
  'rod+wormhole': ['Deep Gate', false], 'spyglass+sun': ['Heliograph', false], 'sun+wormhole': ['Solar Gate', false],
  'clockwork+map': ['Chronomap', false], 'clockwork+rod': ['Water Clock', false], 'clockwork+sun': ['Sundial', true],
  'crucible+deck': ['Forged Fortune', false], 'deck+parasite': ['Card Leech', false], 'deck+spyglass': ['Fortune Glass', false],
  'deck+wormhole': ['Card From Nowhere', false], 'genie+origami': ['Paper Lamp', false], 'genie+pandora': ['Forbidden Djinn', true],
  'genie+sizeray': ['Colossal Djinn', false], 'glyph+origami': ['Folded Script', false], 'glyph+pandora': ['Sealed Box', true],
  'glyph+sizeray': ['Giant Script', false], 'goose+origami': ['Thousand-Crane Goose', false], 'goose+pandora': ['Cursed Goose', false],
  'goose+sizeray': ['Giant Goose', true], 'map+puppeteer': ['Puppet’s Path', false], 'map+stormcoil': ['Map of Storms', false],
  'origami+shard': ['Mirror Fold', false], 'pandora+shard': ['Box of Mirrors', false], 'puppeteer+rod': ['Marionette Cross', false],
  'puppeteer+sun': ['Shadow Play', false], 'rod+stormcoil': ['Lightning Rod', true], 'shard+sizeray': ['Funhouse Mirror', true],
  'stormcoil+sun': ['Solar Storm', true], 'clockwork+deck': ['Hour of Fate', false], 'crucible+genie': ['Brass Lamp', false],
  'crucible+glyph': ['Rune Forge', true], 'crucible+goose': ['Gilded Forge', true], 'crucible+shard': ['Glassblower', true],
  'deck+puppeteer': ['Card Trick', false], 'deck+stormcoil': ['Storm Card', false], 'genie+parasite': ['Possessing Djinn', false],
  'genie+spyglass': ['Djinn’s Eye', false], 'genie+wormhole': ['Djinn of Doors', false], 'glyph+parasite': ['Ink Worm', false],
  'glyph+spyglass': ['Rune Glass', false], 'glyph+wormhole': ['Gate Rune', false], 'goose+parasite': ['Leech Goose', false],
  'goose+spyglass': ['Lookout Goose', false], 'goose+wormhole': ['Warp Goose', false], 'oracle+origami': ['Fortune Teller', true],
  'oracle+pandora': ['Pandora’s Prophecy', true], 'oracle+sizeray': ['Far-Sight Ray', false], 'parasite+shard': ['Doppel-Leech', false],
  'shard+spyglass': ['Periscope', false], 'shard+wormhole': ['Glass Gate', false], 'clockwork+genie': ['Hourglass Djinn', false],
  'clockwork+glyph': ['Rune Clock', false], 'clockwork+goose': ['Clockwork Goose', false], 'clockwork+shard': ['Reverse Clock', false],
  'crucible+oracle': ['Molten Eye', false], 'genie+puppeteer': ['Djinn on Strings', false], 'genie+stormcoil': ['Storm Djinn', false],
  'glyph+puppeteer': ['Spell Strings', false], 'glyph+stormcoil': ['Thunder Script', true], 'goose+puppeteer': ['Puppet Goose', false],
  'goose+stormcoil': ['Thunder Goose', false], 'oracle+parasite': ['Mind Leech', false], 'oracle+spyglass': ['Seer’s Scope', false],
  'oracle+wormhole': ['Eye of the Rift', false], 'origami+pandora': ['Paper Box', false], 'origami+sizeray': ['Pop-Up Titan', false],
  'pandora+sizeray': ['Titan’s Box', false], 'puppeteer+shard': ['Mirror Dancer', false], 'shard+stormcoil': ['Fulgurite', false],
  'clockwork+oracle': ['Clock of Ages', false], 'crucible+origami': ['Tempered Fold', false], 'crucible+pandora': ['Furnace of Woes', false],
  'crucible+sizeray': ['Titan’s Anvil', false], 'oracle+puppeteer': ['Fate’s Hand', false], 'oracle+stormcoil': ['Eye of the Storm', true],
  'origami+parasite': ['Paper Wasp', false], 'origami+spyglass': ['Paper Telescope', false], 'origami+wormhole': ['Paper Portal', true],
  'pandora+parasite': ['Plague Bearer', false], 'pandora+spyglass': ['Peeking Box', false], 'pandora+wormhole': ['Box of Elsewhere', false],
  'parasite+sizeray': ['Behemoth Worm', false], 'sizeray+spyglass': ['Telescopic Ray', true], 'sizeray+wormhole': ['Spacefold Ray', false],
  'clockwork+origami': ['Paper Clock', false], 'clockwork+pandora': ['Doomsday Clock', true], 'clockwork+sizeray': ['Grandfather Clock', false],
  'crucible+parasite': ['Slag Worm', false], 'crucible+spyglass': ['Brass Spyglass', false], 'crucible+wormhole': ['Lava Gate', false],
  'origami+puppeteer': ['Paper Puppet', false], 'origami+stormcoil': ['Kite of Storms', true], 'pandora+puppeteer': ['Jack-in-the-Box', true],
  'pandora+stormcoil': ['Box of Thunder', false], 'parasite+spyglass': ['Stalker Worm', false], 'parasite+wormhole': ['Burrow Worm', false],
  'puppeteer+sizeray': ['Giant Puppet', false], 'sizeray+stormcoil': ['Plasma Ray', false], 'spyglass+wormhole': ['Far Glass', false],
  'clockwork+crucible': ['Forged Gears', false], 'clockwork+parasite': ['Tick', false], 'clockwork+spyglass': ['Chronoscope', false],
  'clockwork+wormhole': ['Time Tunnel', true], 'crucible+puppeteer': ['Iron Marionette', false], 'crucible+stormcoil': ['Thunder Forge', true],
  'parasite+puppeteer': ['Mind Worm', false], 'parasite+stormcoil': ['Galvanic Leech', false], 'puppeteer+spyglass': ['Stage Glass', false],
  'puppeteer+wormhole': ['Strings Across', false], 'spyglass+stormcoil': ['Storm Watcher', false], 'stormcoil+wormhole': ['Storm Gate', false],
  'clockwork+puppeteer': ['Automaton', true], 'clockwork+stormcoil': ['Dynamo Clock', false], 'puppeteer+stormcoil': ['Galvanic Puppet', false],
};
export const HYBRID_COUNT = Object.keys(HYBRIDS).length;
export const PERFECT_COUNT = Object.values(HYBRIDS).filter(([, p]) => p).length;
export const hybridKey = (a: string, b: string) => (a < b ? `${a}+${b}` : `${b}+${a}`);
export const hybridOf = (a: string, b: string) => HYBRIDS[hybridKey(a, b)] ?? ['Chimera', false];
/** what the special Perfect Matches do on top of doubling */
export const PERFECT_EXTRA: Record<string, string> = {
  'map+wormhole': 'Treasure Map pieces can be picked up through the wormhole, from anywhere.',
  'clockwork+wormhole': 'The wormhole’s clock runs fast: what comes through arrives hours early.',
  'genie+oracle': 'See how the Forbidden Wish will turn out before you make it.',
  'oracle+pandora': 'See what every notch of the lid will let out before you lift it.',
};

// ---- Traits, in plain words ----------------------------------------------------------------------------------------
export type TraitInfo = { name: string; emoji: string; text: (k: number) => string; mult?: (k: number) => number };
const x = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')}×`;
/** k: 1 normal, 2 a Perfect Match / Graft / Chimera, 3 an Aberration (mirrors private.ench_pay) */
export const TRAITS: Record<string, TraitInfo> = {
  golden: { name: 'Golden', emoji: '🪿', text: (k) => `lays ${k === 1 ? 'a golden egg' : `${k} golden eggs`} a day: crack one for a free charge of what it does` },
  grow: { name: 'Giant', emoji: '📡', text: (k) => `its plot stands giant every day for ${3 + 3 * k} hours: its minigames ×1.5, and visitors tip it` },
  chaos: { name: 'Chaos', emoji: '🏺', text: (k) => `${k === 1 ? 'a chaos box' : `${k} chaos boxes`} a day: 70% one of its chores is done free, 30% a one-hour hiccup` },
  seek: { name: 'Seeking', emoji: '🗺️', text: (k) => `${[25, 50, 75][k - 1]}% of its rewards bury a chest by its plot — dig it up for +50 Ink` },
  spread: { name: 'Spreading', emoji: '🦠', text: (k) => `sends ${k === 1 ? 'a spore' : `${k} spores`} a day to neighbours’ plots: their wins there pay them +10% and feed you 10%` },
  echo: { name: 'Echo', emoji: '🪞', text: (k) => `${k === 1 ? 'once' : k === 2 ? 'twice' : 'three times'} a day its last action repeats by itself a minute later — free` },
  wish: { name: 'Wishing', emoji: '🧞', text: (k) => `${[30, 55, 75][k - 1]}% of the time, using a charge doesn’t use it up (no charges: once a day its next reward is wished ×2)` },
  trick: { name: 'Tempered', emoji: '🔥', text: (k) => `dodges ${[50, 75, 90][k - 1]}% of its bad luck, and its plot is tempered: the Leviathan can’t trample it, Parasites can’t latch on, pranks and scorches bounce off` },
  farsight: { name: 'Farsight', emoji: '🔭', text: (k) => `reaches ${k + 1}× as far for anything it does on the map` },
  folded: { name: 'Folded', emoji: '🦢', text: (k) => `${k === 1 ? 'once' : k === 2 ? 'twice' : 'three times'} a day, a tap folds its longest wait in half` },
  strings: { name: 'Strings', emoji: '🎭', text: (k) => `${k === 1 ? 'once' : k === 2 ? 'twice' : 'three times'} a day a puppet does one of its chores for you` },
  fated: { name: 'Fated', emoji: '🃏', text: (k) => `${[10, 18, 25][k - 1]}% of its rewards draw one of the 22 cards — and the card comes true` },
  inscribed: { name: 'Inscribed', emoji: '✍️', text: (k) => `has a rune: trace it once a day and it casts that glyph for free${k > 1 ? ` (×${1 + 0.5 * (k - 1)} strength)` : ''}` },
  tempo: { name: 'Tempo', emoji: '⚙️', text: (k) => `its timers run ${k + 2}× as fast` },
  linked: { name: 'Linked', emoji: '🌀', text: (k) => `works from a second plot of yours too: that plot’s minigames ×${(1 + 0.2 * k).toFixed(1)}, tempered when it is` },
  foresight: { name: 'Foresight', emoji: '👁️', text: (k) => `sees its bad luck coming and dodges ${[35, 60, 80][k - 1]}% of it — and shows what’s next` },
  charged: { name: 'Charged', emoji: '⚡', text: (k) => `builds static with every use; at ${[12, 9, 6][k - 1]} it arcs to ${3 * k} of your plots nearby: their minigames ×1.25 for an hour` },
  radiant: { name: 'Radiant', emoji: '☀️', text: (k) => `carries a tiny sun (${40 * k} m): your claims near its plot roll ultras ×${1 + 0.5 * k}, and its timers run ${10 * k}% faster` },
  divining: { name: 'Divining', emoji: '🪄', text: () => 'divines one outcome of its own luck — harder each time, certain at full depth' },
  preserved: { name: 'Preserved', emoji: '🫙', text: (k) => `the good it makes lasts ${1 + 0.5 * k}× longer, and the bad on it passes ${1 + 0.5 * k}× sooner` },
  // what a plot lends the enchantment spliced with it
  inspired: { name: 'Inspired', emoji: '🎨', text: () => 'earns 20% more Ink (your canvas inspires it)', mult: () => 1.2 },
  wild: { name: 'Wild', emoji: '🐾', text: () => 'earns 10% more Ink and levels up twice as fast', mult: () => 1.1 },
  fertile: { name: 'Fertile', emoji: '🌾', text: () => 'earns 25% more Ink (your farm feeds it)', mult: () => 1.25 },
  invested: { name: 'Invested', emoji: '💼', text: () => 'every reward gets +10 Ink from your shop' },
  streak: { name: 'Arcade Streak', emoji: '🕹️', text: () => '1 in 5 rewards pays double' },
  homely: { name: 'At Home', emoji: '🏡', text: () => 'earns 15% more Ink', mult: () => 1.15 },
};
export const traitOf = (gene: string | null | undefined) => (gene ? TRAITS[gene] : undefined);
export const traitText = (gene: string | null | undefined, k = 1) => traitOf(gene)?.text(Math.min(3, Math.max(1, k))) ?? '';

/** where each kind's Ink comes from */
export const PAYS_FROM: Record<EnchantKind, string> = {
  goose: 'its golden eggs and chased foxes', genie: 'its Ink wishes', map: 'its treasure chests', parasite: 'its feeds', cuckoo: 'nothing yet (it’s an egg)',
  pandora: 'gifts from the box, and Hope', splice: 'the Chimera’s roars', clockwork: 'its daily chime (wind the day’s last turn)',
  sizeray: 'micro-gems and parasites it shrinks', shard: 'whatever it reflects', wormhole: 'what you catch coming through it', oracle: 'each prophecy that comes true',
  stormcoil: 'the bolts you catch in its storms', spyglass: 'the sighted plots you claim', origami: 'every plot it unfolds', crucible: 'every plot it forges up a tier',
  puppeteer: 'its puppet shows', deck: 'the cards that pay Ink', glyph: 'the glyphs that pay Ink', sun: 'the plots claimed in its light', rod: 'the sightings it walks you to',
  dejavu: 'the falling stars it lets out of the jar',
};
/** what Farsight stretches on each kind that reaches for something on the map */
const REACHES: Partial<Record<EnchantKind, string>> = {
  map: 'it picks up pieces and digs from twice as far', wormhole: 'its far end can be twice as far away', puppeteer: 'its strings reach plots twice as far away',
  spyglass: 'it looks twice as far', origami: 'it unfolds plots twice as far from you', stormcoil: 'its storms reach neighbours twice as far', glyph: 'its Vortex pulls chests in from twice as far',
  sun: 'it lights suns twice as far from you', rod: 'its Divining Walk goes twice as far',
  dejavu: 'it catches moments and uncorks zones twice as far from you',
};
/** the chores a Strings puppet does on each kind */
const CHORES: Partial<Record<EnchantKind, string>> = {
  goose: 'collects the egg when it’s ready, chases off the fox, or polishes the egg', clockwork: 'winds the key five turns', pandora: 'lifts the lid a notch',
  parasite: 'harvests its feed', stormcoil: 'cranks the handle three turns', oracle: 'gazes at your next rolls', crucible: 'collects its artifacts’ gifts',
  glyph: 'studies the Spellbook', spyglass: 'looks through the glass at a spot nearby', deck: 'turns a card and lets it come true',
};
/** what a golden egg gives each kind (mirrors private.ench_refill) */
const GOLD_GIVES: Partial<Record<EnchantKind, string>> = {
  genie: 'a wish', oracle: 'a gaze', spyglass: 'a look', puppeteer: 'a string', glyph: '2 mana', origami: 'a fold', sizeray: 'a shot', splice: 'a spare Splice charge',
  deck: 'another card today', goose: '2 hours of egg', wormhole: 'an opening now', map: 'a new map now', sun: 'another sun today', shard: 'a gaze now',
  clockwork: '30 wound minutes', stormcoil: '30% charge', crucible: '20 Heat', pandora: 'another opening today', parasite: '4 hours of feeding', rod: 'a little depth',
  dejavu: 'every moment in the jar a day fresher',
};
/** what repeats by itself with Echo (mirrors private.echo_acts) */
const ECHOES: Partial<Record<EnchantKind, string>> = {
  goose: 'collecting the egg happens', genie: 'its wish is made', oracle: 'its gaze happens', spyglass: 'a look is taken nearby', glyph: 'its last spell is cast',
  deck: 'another card is turned', stormcoil: 'its crank turns', clockwork: 'its key winds', sun: 'its stoke happens', pandora: 'the lid lifts',
};
/** what Preserved keeps longer (and lets pass sooner) on each kind (mirrors private.dv_preserve_buff) */
const PRESERVES: Partial<Record<EnchantKind, { good?: string; bad?: string }>> = {
  sizeray: { good: 'the giant and tiny plots it makes' }, origami: { good: 'its creases and its Paper Shield' }, deck: { good: 'its glows and the Tower' },
  glyph: { good: 'its wards, Leaf spells, glows and Bolts' }, puppeteer: { good: 'its Grand Show' }, stormcoil: { good: 'the charge its bolts leave on your plots' },
  pandora: { bad: 'the curses it lets out' },
};
/** what Divining can aim at on each kind (mirrors private.div_targets) */
const DIVINES: Partial<Record<EnchantKind, string>> = { goose: 'a Platinum egg', splice: 'an Aberration', crucible: 'a strike that lands', deck: 'The World' };
/** what a kind's charge is called, where Wishing keeps one */
const KEEPS: Partial<Record<EnchantKind, string>> = { genie: 'wish', sizeray: 'shot', oracle: 'gaze' };
/** the bad luck a kind can dodge, where Trickster and Foresight dodge it */
const DODGES: Partial<Record<EnchantKind, (pct: number) => string>> = {
  goose: () => 'foxes miss its egg half the time (from its next egg on)',
  genie: (p) => `the Forbidden Wish’s twist misses ${p}% of the time`,
  pandora: (p) => `${p}% of the curses that escape miss you`,
  stormcoil: (p) => `${p}% of the plots a missed bolt would scorch are spared`,
};
const INK_GENES = new Set(['seek', 'inspired', 'wild', 'fertile', 'invested', 'streak', 'homely']);
/** what a reward's chip says when a Trait worked (mirrors the labels private.ench_pay writes) */
export const TRAIT_CHIP: Record<string, string> = {
  golden: 'Golden', grow: 'Giant', chaos: 'Chaos', seek: 'Seeking', spread: 'Spreading', echo: 'Echo', linked: 'Linked', foresight: 'Foresight',
  wish: 'Wished', trick: 'Tempered', farsight: 'Farsight', folded: 'Folded', strings: 'Strings', fated: 'Fated', inscribed: 'Inscribed', inspired: 'Inspired', wild: 'Wild', fertile: 'Fertile', invested: 'Invested', streak: 'Arcade streak', homely: 'At home',
  charged: 'Charged', radiant: 'Radiant', divining: 'Divining', preserved: 'Preserved',
};
export type TraitHere = { gene: string; k: number; name: string; emoji: string; text: string;
  /** what you have to do for it (null: it works by itself) */ you: string | null;
  /** what it works on, for a Trait that boosts Ink */ on: string | null };
/** a Trait as it works on one particular kind, in plain words (mirrors private.ench_pay, ench_keep_charge and ench_dodge) */
export function traitHere(gene: string | null | undefined, k: number, kind: string): TraitHere | null {
  const t = traitOf(gene);
  if (!gene || !t) return null;
  const s = Math.min(3, Math.max(1, k || 1)), me = kind as EnchantKind, pct = [50, 75, 90][s - 1];
  let text = t.text(s), on: string | null = INK_GENES.has(gene) ? PAYS_FROM[me] ?? null : null, you: string | null = null;
  if (gene === 'seek') { text = `${[25, 50, 75][s - 1]}% of its rewards bury a chest by its plot (+50 Ink each, keeps 7 days)`; you = 'Dig its chests up — tap them here or on the map'; }
  if (gene === 'wish') {
    if (KEEPS[me]) text = `${[30, 55, 75][s - 1]}% of the time a ${KEEPS[me]} doesn’t use up its charge`;
    else { text = `it has no charges to keep, so once a day its next reward is wished: ×2`; on = PAYS_FROM[me] ?? null; }
  }
  if (gene === 'trick') {
    const d = DODGES[me];
    text = `${d ? `${d(pct)}, and its` : 'its'} plot is tempered: the Leviathan can’t trample it, Parasites can’t latch on, pranks and storm scorches bounce off`;
  }
  if (gene === 'farsight') {
    const r = REACHES[me];
    text = r ? `reaches ${s + 1}× as far: ${r}` : `it reaches for nothing on the map, so it scouts: ${s === 1 ? 'a private Spyglass reading' : `${s} private Spyglass readings`} of unclaimed plots near it every day`;
  }
  if (gene === 'folded') { text = `${['once', 'twice', 'three times'][s - 1]} a day, fold its longest wait in half (with nothing to wait for, the fold goes to your enchantment that waits longest)`; you = 'Tap “Fold its wait” below'; }
  if (gene === 'strings') text = `${['once', 'twice', 'three times'][s - 1]} a day a puppet does a chore for you: ${CHORES[me] ?? 'one of your other enchantments’ chores (it has none of its own)'}`;
  if (gene === 'inscribed') { text = `its rune is a glyph: trace it once a day and it casts that spell for free, as strong as you drew it${s > 1 ? ` (×${1 + 0.5 * (s - 1)})` : ''}`; you = 'Trace its rune below, once a day'; }
  if (gene === 'foresight') {
    const d = DODGES[me];
    text = `sees its bad luck coming${d ? `: ${d([35, 60, 80][s - 1])}` : ` and dodges ${[35, 60, 80][s - 1]}% of it`}${me === 'genie' ? ', and you see how the Forbidden Wish will turn out' : me === 'goose' ? ', and you see whether the egg is Platinum' : me === 'pandora' ? ', and you see which evils are still inside' : ''}`;
  }
  if (gene === 'linked') { text = `works from a second plot of yours too: that plot’s minigames pay ×${(1 + 0.2 * s).toFixed(1)}, and it’s tempered when this one is`; you = 'Pick its second plot on the map'; }
  if (gene === 'tempo') text = `its timers run ${s + 2}× as fast — eggs, wishes, charges and cooldowns all come sooner`;
  if (gene === 'golden') { text = `${s === 1 ? 'a golden egg' : `${s} golden eggs`} a day on its page: crack one for ${GOLD_GIVES[me] ?? 'a little Ink'} — and 1 in 5 carries a Splice spark`; you = 'Crack its golden eggs below'; }
  if (gene === 'chaos') { text = `${s === 1 ? 'a chaos box' : `${s} chaos boxes`} a day: 70% it ${CHORES[me] ?? 'gets a free charge'}, 30% a one-hour hiccup (its clock stops)`; you = 'Open its chaos boxes below'; }
  if (gene === 'echo') text = ECHOES[me] ? `${['once', 'twice', 'three times'][s - 1]} a day, ${ECHOES[me]} again by itself a minute later — free` : `${['once', 'twice', 'three times'][s - 1]} a day a mirror ghost pays its last reward again, a minute later`;
  if (gene === 'radiant') text = `its plot carries a tiny sun, ${40 * s} m across: your claims there roll ultras ×${1 + 0.5 * s}, and its timers run ${10 * s}% faster in the warmth`;
  if (gene === 'divining') { text = `pick one outcome of its luck — ${DIVINES[me] ?? 'a Splice spark from its rewards'}: harder each time, certain at full depth`; you = 'Choose what it divines below'; }
  if (gene === 'preserved') {
    const f = `${1 + 0.5 * s}×`, g = PRESERVES[me];
    text = g ? `${g.good ? `${g.good} last ${f} longer` : ''}${g.good && g.bad ? ', and ' : ''}${g.bad ? `${g.bad} pass ${f} sooner` : ''} — and the Leviathan’s trample and storm scorches on its plot wash off ${f} sooner`
      : `nothing it makes needs to last, so it guards its plot: the Leviathan’s trample and storm scorches there wash off ${f} sooner`;
  }
  return { gene, k: s, name: t.name, emoji: t.emoji, text, you, on };
}
/** what a plot's minigames get when an enchantment is spliced into it (mirrors private.ench_minigame_mult) */
export const PLOT_GETS: Record<string, string> = {
  golden: 'its minigames pay 1.5× Ink', grow: 'its minigames pay 2× Ink', chaos: 'its minigame wins are a gamble: 0.5× to 2.5×', seek: '1 in 4 wins pays 1.5×',
  spread: 'its minigames pay 15% more', echo: '35% of wins pay double', wish: 'its minigames pay 25% more', trick: 'its minigames pay 20% more',
  tempo: 'its minigames pay 30% more', linked: 'its minigames pay 40% more', foresight: 'its minigames pay 20% more',
  radiant: 'its minigames pay 20% more', divining: '15% of wins are divined: ×2', charged: 'its minigames pay 25% more', preserved: 'its minigames pay 15% more',
  farsight: 'its minigames pay 15% more', folded: 'its minigames pay 10% more', strings: 'its minigames pay 15% more', fated: '1 in 10 wins pays double', inscribed: 'its minigames pay 10% more',
};
export const PLOT_TRAIT: Record<string, string> = { canvas: 'inspired', habitat: 'wild', farm: 'fertile', business: 'invested', arcade: 'streak' };
export const plotTrait = (kind: string | null | undefined) => PLOT_TRAIT[kind ?? 'canvas'] ?? 'homely';
const ADJ: Record<string, [string, string]> = { goose: ['Golden', 'Hen'], genie: ['Wishing', 'Djinn'], map: ['Treasure', 'Atlas'], parasite: ['Hungering', 'Worm'],
  cuckoo: ['Hatching', 'Egg'], pandora: ['Cursed', 'Box'], clockwork: ['Ticking', 'Engine'], sizeray: ['Giant', 'Titan'], shard: ['Mirrored', 'Glass'],
  wormhole: ['Warped', 'Gate'], oracle: ['All-Seeing', 'Eye'], splice: ['Spliced', 'Chimera'],
  stormcoil: ['Charged', 'Storm'], sun: ['Radiant', 'Sun'], rod: ['Divining', 'Wand'], dejavu: ['Twice-Lived', 'Jar'],
  spyglass: ['Far-Seeing', 'Spyglass'], origami: ['Folded', 'Crane'], crucible: ['Molten', 'Anvil'], puppeteer: ['Strung', 'Marionette'], deck: ['Fated', 'Card'], glyph: ['Runic', 'Glyph'] };
const PLOT_NOUN: Record<string, string> = { canvas: 'Canvas', habitat: 'Habitat', farm: 'Farm', business: 'Shop', arcade: 'Arcade', home: 'House', landlord: 'Manor', train: 'Station',
  plane: 'Airfield', base: 'Plot', mine: 'Mine', sky: 'Sky Isle', workshop: 'Workshop', diner: 'Diner', dungeon: 'Dungeon', brawl: 'Arena' };
export const plotHybridName = (kind: string, plotKind: string | null | undefined) => `${ADJ[kind]?.[0] ?? 'Spliced'} ${PLOT_NOUN[plotKind ?? 'canvas'] ?? 'Realm'}`;
export const trinityName = (a: string, b: string, c: string) => { const k = [a, b, c].sort(); return `The ${ADJ[k[0]][0]} ${ADJ[k[1]][0]} ${ADJ[k[2]][1]}`; };
/** a ★3 Splice's Quad: three adjectives and a noun */
export const quadName = (a: string, b: string, c: string, d: string) => { const k = [a, b, c, d].sort(); return `The ${ADJ[k[0]][0]} ${ADJ[k[1]][0]} ${ADJ[k[2]][0]} ${ADJ[k[3]][1]}`; };
export const ABERRATION_COUNT = 6;
export const ABERRATIONS: Record<string, { emoji: string; secret: string }> = {
  'The Hollow King': { emoji: '👑', secret: 'Traits tripled, and triple XP' }, Glitchwing: { emoji: '🦋', secret: 'Traits tripled, and 1 in 10 rewards brings Enchanted Luck' },
  'Many-Mouth': { emoji: '👄', secret: 'Traits tripled, and every reward feeds you +3 Luck' }, 'The Unwritten': { emoji: '📜', secret: 'Traits tripled, and +25 Ink on every reward' },
  Starspawn: { emoji: '🌟', secret: 'Traits tripled, and 1 in 5 rewards is paid twice' }, Ninefold: { emoji: '🐍', secret: 'Traits tripled, and every reward ×1.5' },
};

export const SPLICE_MODES = {
  swap: { name: 'Swap', emoji: '🔁', hours: 24, cost: 1, text: 'Two of yours trade Traits for 24 hours.' },
  graft: { name: 'Graft', emoji: '🌿', hours: 12, cost: 1, text: 'One-way: the donor lends its Trait at double strength, and sleeps for 12 hours.' },
  chimera: { name: 'Chimera', emoji: '🐉', hours: 12, cost: 1, text: 'Both Traits doubled for 12 hours, and it roars every 3 hours. 1 in 8 is unstable and rejects early.' },
  trinity: { name: 'Trinity', emoji: '🔺', hours: 18, cost: 2, text: 'Three at once: each wears both other Traits for 18 hours. Costs both charges.' },
  quad: { name: 'Quad', emoji: '✳️', hours: 18, cost: 3, text: '★3 Splice only: four at once — each wears all three other Traits for 18 hours. Costs 3 charges.' },
  friend: { name: 'With a friend', emoji: '🤝', hours: 24, cost: 1, text: 'One of yours + one of a friend’s. When they say yes, both wear each other’s Trait.' },
  plot: { name: 'With a plot', emoji: '🏞️', hours: 24, cost: 1, text: 'Splice an enchantment into one of your plots: the plot’s minigames wear its Trait, and it wears the plot’s.' },
} as const;
export type SpliceMode = keyof typeof SPLICE_MODES;

/** a hybrid card, in plain words: what each side gets */
export function hybridCard(a: EnchantKind, b: EnchantKind, opts: { mode?: SpliceMode; levels?: [number, number]; aberration?: string | null } = {}) {
  const [name, perfect] = hybridOf(a, b);
  const mode = opts.mode ?? 'swap';
  const k = opts.aberration ? 3 : mode === 'graft' || mode === 'chimera' ? 2 : perfect ? 2 : 1;
  const side = (me: EnchantKind, other: EnchantKind, lv?: number) => {
    const g = KINDS[other].gene;
    if (!g || (mode === 'graft' && me === b)) return null;
    const t = TRAITS[g];
    const here = traitHere(g, k, me);
    const lvl = lv && lv > 1 ? 1 + 0.06 * (lv - 1) : 1;
    const now = t.mult ? `Ink ×${lvl.toFixed(2)} now → ×${(lvl * t.mult(k)).toFixed(2)} spliced` : null;
    return { me, emoji: KINDS[me].emoji, who: KINDS[me].name, gets: here?.text ?? t.text(k), trait: t.name, traitEmoji: t.emoji, live: now, on: here?.on ?? null, you: here?.you ?? null };
  };
  const lines = [side(a, b, opts.levels?.[0]), side(b, a, opts.levels?.[1])].filter(Boolean) as NonNullable<ReturnType<typeof side>>[];
  const strongest = lines.slice().sort((p, q) => (TRAITS[KINDS[q.me === a ? b : a].gene!]?.mult?.(k) ?? 1.3) - (TRAITS[KINDS[p.me === a ? b : a].gene!]?.mult?.(k) ?? 1.3))[0];
  return {
    name: opts.aberration ?? name, pair: name, perfect, k, lines, mode,
    extra: PERFECT_EXTRA[hybridKey(a, b)] ?? null,
    hours: SPLICE_MODES[mode].hours,
    bestFor: strongest ? `${KINDS[strongest.me].noun}` : null,
    sleeps: mode === 'graft' ? KINDS[b].name : null,
  };
}
/** older one-liners (kept for small spots) */
export function hybridText(a: EnchantKind, b: EnchantKind) {
  return hybridCard(a, b).lines.map((l) => `${l.who}: ${l.gets}`);
}

export const EVILS: Record<string, { name: string; emoji: string; curse: string; color: string }> = {
  plague: { name: 'Plague', emoji: '🦠', curse: 'Your enchantments pay 30% less for 6 hours.', color: '#7CFF6B' },
  greed: { name: 'Greed', emoji: '🪙', curse: 'Your Ink comes slower for 2 hours.', color: '#FFD23F' },
  strife: { name: 'Strife', emoji: '⚔️', curse: 'Your next minigame win pays half.', color: '#FF4D6D' },
  envy: { name: 'Envy', emoji: '🐍', curse: 'You lose 15 Luck.', color: '#3DDC97' },
  despair: { name: 'Despair', emoji: '🌧️', curse: 'Your Enchanted Luck drains away.', color: '#7DA0FF' },
  toil: { name: 'Toil', emoji: '⛓️', curse: 'Your other enchantments’ clocks fall 2 hours behind.', color: '#B08968' },
  sorrow: { name: 'Sorrow', emoji: '🥀', curse: 'The box stays shut an extra day.', color: '#C77DFF' },
};
export const EVIL_ORDER = ['plague', 'greed', 'strife', 'envy', 'despair', 'toil', 'sorrow'];

export const TITLES: Record<string, string> = {
  Starlit: 'Earned its first star', Starforged: 'Earned two stars', Supernova: 'Earned three stars', 'Comet-Crowned': 'Earned a fourth star', Ascendant: 'Earned all five stars',
  Awakened: 'Reached level 5', Ascended: 'Reached level 10', 'Fox-Bane': 'Chased off 10 foxes', 'Golden Hen': 'Laid 25 eggs', Unbroken: 'A 7-egg golden streak',
  Platinum: 'Laid a Platinum egg', Forbidden: 'Made the Forbidden Wish', Wishmaster: 'Granted 30 wishes', Liberator: 'Set the Genie free',
  Cartographer: 'Dug up 5 treasure chests', Pathfinder: 'Found 40 map pieces', Symbiote: 'Evolved into a Symbiote', Devourer: 'Fed 25 times',
  'Hope-Bringer': 'Released Hope', 'Mad Scientist': 'Made 10 splices',
  'Chimera Codex': 'Discovered 36 hybrids', 'Grand Codex': 'Discovered 55 hybrids', Aberrant: 'Made an Aberration', Trinitarian: 'Made 3 different Trinities',
  Timekeeper: 'Wound the key 100 times', Stopwatch: 'Froze time 10 times', Sharpshooter: '10 PERFECT zaps',
  'Big Bang': 'Fired 50 times', Colossus: 'Made 10 plots giant', 'Ant-Maker': 'Made 10 plots tiny', Prankster: 'Pranked 10 players', 'Seven Years': 'Shattered the glass', 'Many Faces': 'Made 20 reflections',
  Gatekeeper: 'Opened the wormhole 5 times', Worldwalker: 'Linked plots 1,000 km apart', Constellation: 'Reached level 10',
  Seer: '10 prophecies came true', 'Fate-Weaver': 'Rewrote fate 10 times (an Oracle), or collected all 22 cards (a Fated Deck)',
  'Codex Complete': 'Discovered all 190 hybrids', Stormcaller: 'Called 10 storms', 'Lightning Hands': 'Caught 50 bolts',
  Sunkeeper: 'Lit 10 suns', Corona: '5 PERFECT Solar Flares', Sunspotter: 'Claimed 10 sunspots', Diviner: 'Brought up its first target',
  'Deep Diviner': 'Dowsed a Mythic, an Ultra or a Primordial', Lodefinder: 'Brought up 10 targets',
  'Moment-Catcher': 'Caught 10 moments in the jar', 'Twice-Lived': 'Uncorked 10 moments', 'Bottled Lightning': 'Uncorked 5 bolts of lightning',
  Galvanist: 'Made an Aberration with lightning',
  'Eagle-Eye': 'Took 50 looks', Prospector: 'Claimed 10 plots it sighted', 'Far-Seer': 'Sighted a Legendary or better',
  'Paper Crane': 'Unfolded 10 plots', 'Thousand Cranes': 'Unfolded 100 plots', 'Far-Folder': 'Unfolded a plot 100 km away',
  Smelter: 'Melted 25 plots', Forgemaster: 'Forged 5 plots up a tier', 'Monument Maker': 'Raised a gold monument',
  Marionettist: 'Put on 10 shows', 'Grand Puppeteer': 'Won 50 puppet runs', Repertoire: 'Played every kind of game on strings',
  'Card Sharp': 'Turned 30 cards', 'Gilded Hand': 'Turned 3 gilded cards',
  Scribe: 'Cast 25 glyphs', Spellwright: 'Found 20 glyphs', 'Keeper of Secrets': 'Found a secret glyph',
};

/** "2h 14m" / "6m 30s" */
export function dur(s: number | null | undefined) {
  if (s == null) return '';
  const v = Math.max(0, Math.round(s));
  // (♾️ an Eternal Bond's hundred years)
  if (v > 50 * 365 * 86400) return '∞';
  const d = Math.floor(v / 86400), h = Math.floor((v % 86400) / 3600), m = Math.floor((v % 3600) / 60), sec = v % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}
export const enchantName = (e: { nickname?: string | null; kind: string; serial: number }) => e.nickname || `${kindInfo(e.kind).name} #${e.serial}`;

/** is it night where this plot is? (the sun's hour from its longitude) — enchantments sleep at real night */
export function nightAt(lng: number, now = new Date()) {
  const h = (now.getUTCHours() + now.getUTCMinutes() / 60 + lng / 15 + 48) % 24;
  return h >= 22 || h < 6;
}

/** the Dowsing Rod's word on a roll, for the roll reveal */
export function dowsedLine(d: { result: string; name: string; depth: number; need: number }) {
  if (d.result === 'hit' || d.result === 'forced') return `🪄 Dowsed: ${d.name}!`;
  if (d.result === 'slip') return `🫗 The rod held back a ${d.name} — ${Math.round((100 * d.depth) / Math.max(1, d.need))}% deep now`;
  if (d.result === 'better') return `🪄 Better than ${d.name} — it’s yours`;
  return `🪄 ${Math.round((100 * d.depth) / Math.max(1, d.need))}% deep toward ${d.name}`;
}
