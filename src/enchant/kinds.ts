// The fifteen enchantments, their splice Traits, the 91 hybrids and the seven evils — a client mirror of the server's
// private.ench_info / private.ench_hybrid / private.pandora_evils (the server is authoritative).
//
// Plain words everywhere: a splice "gene" is a Trait, a "resonant" pair is a Perfect Match, and every hybrid card says
// what each side actually gets, with numbers.
export type EnchantKind = 'goose' | 'genie' | 'map' | 'parasite' | 'cuckoo' | 'pandora' | 'splice' | 'clockwork' | 'sizeray' | 'shard' | 'wormhole' | 'oracle'
  | 'ouroboros' | 'homunculus' | 'stormcoil';

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
  cuckoo: { id: 'cuckoo', name: 'Cuckoo', emoji: '🪺', a: '#4CC9F0', b: '#F72585', ink: '#06222C', noun: 'raising chicks',
    tagline: 'Sneaks its egg into someone else’s nest.',
    how: ['Scout three nests on other players’ plots: rarer plots raise richer chicks, but watchful owners spot eggs.', 'Lay your egg in one. It hatches in 10 hours — unless the owner finds it and throws it out (they get paid).', 'Raise the chick for Ink; sometimes it brings a lucky feather (+20 Luck).'],
    gene: 'trick', geneName: 'Trickster', geneText: 'dodges half its bad luck — foxes, curses, being thrown out (one with no bad luck earns +20% Ink instead)' },
  pandora: { id: 'pandora', name: 'Pandora’s Box', emoji: '🏺', a: '#FF4D6D', b: '#2A0A3D', ink: '#1A0410', noun: 'opening the box',
    tagline: 'Lift the lid. Gifts — or one of seven evils.',
    how: ['Once a day, lift the lid one, two or three notches. Wider means bigger gifts — and likelier evils.', 'Each evil that escapes curses you for a while, and can only escape once.', 'When all seven are out, Hope rises from the bottom: a Legendary+ roll ticket and a fortune. The box closes again, richer.'],
    gene: 'chaos', geneName: 'Chaos', geneText: 'every reward is a gamble: 0.5× to 2.5× Ink' },
  splice: { id: 'splice', name: 'Splice', emoji: '🧪', a: '#00F5D4', b: '#9B5DE5', ink: '#04211D', noun: 'splicing',
    tagline: 'Fuse enchantments into living hybrids.',
    how: ['Swap: two of your enchantments trade Traits for 24 hours. Graft: one lends its Trait at double strength, and sleeps. Chimera: both doubled, with a roar every 3 hours (sometimes unstable).',
      'Trinity: three at once (two charges). Or splice with a friend’s enchantment, or with one of your plots.',
      '55 hybrids, 12 of them Perfect Matches (Traits doubled) — and a few secret Aberrations. A charge returns every 36 hours (hold 2).'],
    gene: null, geneName: null, geneText: null },
  clockwork: { id: 'clockwork', name: 'Clockwork', emoji: '⚙️', a: '#D4A373', b: '#6C584C', ink: '#20170E', noun: 'bending time',
    tagline: 'Wind it up. Then bend time.',
    how: ['Wind the key (15 turns a day, 8 minutes each); it also ticks up on its own. Wind the day’s last turn and it chimes: 30–50 Ink.', 'Spend the minutes to fast-forward any enchantment: grow an egg, hatch a chick, recharge a wish.', 'Or freeze one — a frozen spliced hybrid stays fused for longer.'],
    gene: 'tempo', geneName: 'Tempo', geneText: 'its timers run 3× as fast' },
  sizeray: { id: 'sizeray', name: 'Size Ray', emoji: '📡', a: '#39FF14', b: '#FF00E5', ink: '#071F05', noun: 'zapping',
    tagline: 'Pick any plot on the map. Make it 100× bigger — or 100× smaller.',
    how: ['Pick any plot on the map, choose GROW or SHRINK, and fire as the needle hits its peak. Its drawing goes 100× bigger — or 100× smaller — on everyone’s map. A PERFECT shot lasts 12 hours; a total miss backfires.',
      'Your own plot, GIANT: its drawing towers 100 plots wide over the neighbourhood, its minigames pay ×1.5–2, and other players can visit and tip it — but Parasites, Cuckoos and the Leviathan go for giants first.',
      'Your own plot, TINY: shrunk to a hundredth (bring a magnifying glass) — nobody can find it (Parasites, Cuckoos, foxes), its enchantment’s timers run twice as fast and three micro-gems hide in it — but its minigames pay less.',
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
  ouroboros: { id: 'ouroboros', name: 'Ouroboros', emoji: '🐍', a: '#3DDC97', b: '#0E7C5A', ink: '#03160F', noun: 'endless splices',
    tagline: 'The splice that eats its own tail — and never has to end.',
    how: ['Coil it around any splice you have running (not a Graft). When the splice would end, it loops instead — every 12 hours.',
      'Every loop that holds banks Ink and makes the hybrid stronger: Traits ×2 from loop 2, ×3 from loop 4. But each loop is likelier to bite through (0 → 10 → 20 → 35 → 50 → 60 → 70%). A bite snaps the splice, loses the bank, and the serpent sheds its skin for a day.',
      'Catch the tail before a loop: tap as its head meets its tail. A clean catch halves that loop’s risk. Break the circle any time to cash out.',
      'Survive seven loops and the circle closes: you choose which secret Aberration the hybrid becomes. A coiled unstable Chimera is steadied.'],
    gene: 'endless', geneName: 'Endless', geneText: 'earns 10% more Ink, and its splice renews itself once when it ends' },
  homunculus: { id: 'homunculus', name: 'Homunculus', emoji: '🧫', a: '#FF9AC8', b: '#8A3FFC', ink: '#22061A', noun: 'walking your plots',
    tagline: 'A creature grown in a flask — out of your splices.',
    how: ['Every splice you make drips into its flask: it grows a body part from each enchantment in it — goose wings, a genie’s smoke tail, clockwork gears, a glass eye… A part it already has grows instead. An Aberration’s parts glow and count double.',
      'At 5 it can wake (4 if it’s spliced with a Storm Coil). It walks out onto the map for 7 days, moving between your plots every 2 hours — everyone can see it, and anyone can greet it (a few Ink each). Lead it to a plot twice a day.',
      'The plot it stands on wears its parts: its minigames pay more (up to +150%).',
      'Then it melts into a Heart — Ink, Enchanted Luck and a Splice charge — and keeps one part, of your choice, for the next one.'],
    gene: 'patchwork', geneName: 'Patchwork', geneText: 'borrows a surprise Trait from the Homunculus’s parts on every reward' },
  stormcoil: { id: 'stormcoil', name: 'Storm Coil', emoji: '⚡', a: '#7DF9FF', b: '#3D5AFE', ink: '#04102E', noun: 'lightning',
    tagline: 'Crank it up. Call down a storm on your hybrids.',
    how: ['Crank it full, then call a 3-minute thunderstorm over your plots — live, on the map too. Bolts gather and strike: tap them as they land.',
      'A bolt on a spliced enchantment mutates it: +6 hours, a surge (its Traits doubled), an overcharge (its next reward ×2) — or, 1 in 6, a secret Aberration.',
      'Bolts on your plots pay Ink; ones nobody catches can scorch the plot (its minigames −20% for an hour). Stray bolts land on neighbours’ plots — anyone can catch those.',
      'One storm a day (two at level 10).'],
    gene: 'charged', geneName: 'Charged', geneText: 'earns 25% more Ink, and a splice with it is 3× as likely to mutate into an Aberration' },
};
export const KIND_ORDER: EnchantKind[] = ['goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle', 'ouroboros', 'homunculus', 'stormcoil'];
export const kindInfo = (k: string | null | undefined): KindInfo => KINDS[(k ?? 'goose') as EnchantKind] ?? KINDS.goose;

/** the 91 hybrids: [name, Perfect Match] (mirrors private.ench_hybrid) */
export const HYBRIDS: Record<string, [string, boolean]> = {
  'genie+goose': ['Wishing Goose', false], 'goose+map': ['Treasure Goose', false], 'goose+parasite': ['Leech Goose', false],
  'cuckoo+goose': ['Changeling Goose', true], 'goose+pandora': ['Cursed Goose', false], 'clockwork+goose': ['Clockwork Goose', false],
  'goose+sizeray': ['Giant Goose', true], 'goose+shard': ['Mirror Goose', false],
  'genie+map': ['Cartographer Djinn', false], 'genie+parasite': ['Possessing Djinn', false], 'cuckoo+genie': ['Trickster Djinn', false],
  'genie+pandora': ['Forbidden Djinn', true], 'clockwork+genie': ['Hourglass Djinn', false], 'genie+sizeray': ['Colossal Djinn', false],
  'genie+shard': ['Mirror Djinn', false],
  'map+parasite': ['Blight Map', false], 'cuckoo+map': ['Nest Map', false], 'map+pandora': ['Map of Woe', false],
  'clockwork+map': ['Chronomap', false], 'map+sizeray': ['Atlas Map', false], 'map+shard': ['Looking-Glass Map', true],
  'cuckoo+parasite': ['Brood Parasite', true], 'pandora+parasite': ['Plague Bearer', false], 'clockwork+parasite': ['Tick', false],
  'parasite+sizeray': ['Behemoth Worm', false], 'parasite+shard': ['Doppel-Leech', false],
  'cuckoo+pandora': ['Omen Cuckoo', false], 'clockwork+cuckoo': ['Cuckoo Clock', true], 'cuckoo+sizeray': ['Roc', false],
  'cuckoo+shard': ['Mirror Cuckoo', false],
  'clockwork+pandora': ['Doomsday Clock', true], 'pandora+sizeray': ['Titan’s Box', false], 'pandora+shard': ['Box of Mirrors', false],
  'clockwork+sizeray': ['Grandfather Clock', false], 'clockwork+shard': ['Reverse Clock', false], 'shard+sizeray': ['Funhouse Mirror', true],
  'goose+wormhole': ['Warp Goose', false], 'genie+wormhole': ['Djinn of Doors', false], 'map+wormhole': ['Shortcut Map', true],
  'parasite+wormhole': ['Burrow Worm', false], 'cuckoo+wormhole': ['Far-Flung Cuckoo', false], 'pandora+wormhole': ['Box of Elsewhere', false],
  'clockwork+wormhole': ['Time Tunnel', true], 'sizeray+wormhole': ['Spacefold Ray', false], 'shard+wormhole': ['Glass Gate', false],
  'oracle+wormhole': ['Eye of the Rift', false],
  'goose+oracle': ['Augur Goose', false], 'genie+oracle': ['Djinn of Fate', true], 'map+oracle': ['Seer’s Map', false],
  'oracle+parasite': ['Mind Leech', false], 'cuckoo+oracle': ['Prophet Cuckoo', false], 'oracle+pandora': ['Pandora’s Prophecy', true],
  'clockwork+oracle': ['Clock of Ages', false], 'oracle+sizeray': ['Far-Sight Ray', false], 'oracle+shard': ['Scrying Glass', false],
  'goose+ouroboros': ['Eternal Egg', false], 'genie+ouroboros': ['Undying Djinn', false], 'map+ouroboros': ['Map of Return', false],
  'ouroboros+parasite': ['Tail-Eater Worm', false], 'cuckoo+ouroboros': ['Ever-Nest', false], 'ouroboros+pandora': ['Box Without End', false],
  'clockwork+ouroboros': ['Infinity Clock', true], 'ouroboros+sizeray': ['Coil Titan', false], 'ouroboros+shard': ['Endless Mirror', true],
  'ouroboros+wormhole': ['Möbius Gate', false], 'oracle+ouroboros': ['Eye of Eternity', false],
  'goose+homunculus': ['Golem Hen', false], 'genie+homunculus': ['Flask Djinn', true], 'homunculus+map': ['Patchwork Atlas', false],
  'homunculus+parasite': ['Flesh-Weaver', true], 'cuckoo+homunculus': ['Changeling Child', false], 'homunculus+pandora': ['Box of Limbs', false],
  'clockwork+homunculus': ['Clockwork Golem', false], 'homunculus+sizeray': ['Titan-Born', false], 'homunculus+shard': ['Glass Golem', false],
  'homunculus+wormhole': ['Walker Between', false], 'homunculus+oracle': ['Many-Eyed Child', false],
  'goose+stormcoil': ['Thunder Goose', false], 'genie+stormcoil': ['Storm Djinn', false], 'map+stormcoil': ['Map of Storms', false],
  'parasite+stormcoil': ['Galvanic Leech', false], 'cuckoo+stormcoil': ['Thunderbird', true], 'pandora+stormcoil': ['Box of Thunder', false],
  'clockwork+stormcoil': ['Dynamo Clock', false], 'sizeray+stormcoil': ['Plasma Ray', false], 'shard+stormcoil': ['Fulgurite', false],
  'stormcoil+wormhole': ['Storm Gate', false], 'oracle+stormcoil': ['Eye of the Storm', true],
  'homunculus+ouroboros': ['Undying Child', false], 'homunculus+stormcoil': ['Galvanized Golem', true], 'ouroboros+stormcoil': ['Storm Serpent', false],
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
  'clockwork+ouroboros': 'While they’re spliced, the Ouroboros’s coils loop every 6 hours instead of 12.',
  'homunculus+stormcoil': 'Lightning wakes it: the Homunculus can wake with 4 parts instead of 5.',
};

// ---- Traits, in plain words ----------------------------------------------------------------------------------------
export type TraitInfo = { name: string; emoji: string; text: (k: number) => string; mult?: (k: number) => number };
const x = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')}×`;
/** k: 1 normal, 2 a Perfect Match / Graft / Chimera, 3 an Aberration (mirrors private.ench_pay) */
export const TRAITS: Record<string, TraitInfo> = {
  golden: { name: 'Golden', emoji: '🪿', text: (k) => `earns ${x(1 + 0.5 * k)} Ink`, mult: (k) => 1 + 0.5 * k },
  grow: { name: 'Giant', emoji: '📡', text: (k) => `earns ${x(1 + k)} Ink`, mult: (k) => 1 + k },
  chaos: { name: 'Chaos', emoji: '🏺', text: (k) => `every reward is a gamble: ${[0.5, 0.75, 1][k - 1]}× to ${[2.5, 3.5, 4][k - 1]}× Ink` },
  seek: { name: 'Seeking', emoji: '🗺️', text: (k) => `${[25, 50, 75][k - 1]}% of its rewards bury a chest by its plot — dig it up for +50 Ink` },
  spread: { name: 'Spreading', emoji: '🦠', text: (k) => `earns ${15 * k}% more Ink, and drops a gift on a random player`, mult: (k) => 1 + 0.15 * k },
  echo: { name: 'Echo', emoji: '🪞', text: (k) => `${[35, 60, 80][k - 1]}% of its rewards are paid twice` },
  wish: { name: 'Wishing', emoji: '🧞', text: (k) => `${[30, 55, 75][k - 1]}% of the time, using a charge doesn’t use it up (no charges: +${25 * k}% Ink)` },
  trick: { name: 'Trickster', emoji: '🪺', text: (k) => `dodges ${[50, 75, 90][k - 1]}% of its bad luck (no bad luck: +${20 * k}% Ink)` },
  tempo: { name: 'Tempo', emoji: '⚙️', text: (k) => `its timers run ${k + 2}× as fast` },
  linked: { name: 'Linked', emoji: '🌀', text: (k) => `works as if on a second plot: +${40 * k}% Ink`, mult: (k) => 1 + 0.4 * k },
  foresight: { name: 'Foresight', emoji: '👁️', text: (k) => `earns ${20 * k}% more Ink and sees ${[35, 60, 80][k - 1]}% of bad luck coming`, mult: (k) => 1 + 0.2 * k },
  endless: { name: 'Endless', emoji: '🐍', text: (k) => `earns ${10 * k}% more Ink, and the splice renews itself ${['once', 'twice', 'three times'][k - 1]} when it ends`, mult: (k) => 1 + 0.1 * k },
  patchwork: { name: 'Patchwork', emoji: '🧫', text: (k) => `every reward borrows a surprise Trait from the Homunculus’s parts${k > 1 ? ` (at ${k}× strength)` : ''}` },
  charged: { name: 'Charged', emoji: '⚡', text: (k) => `earns ${25 * k}% more Ink — and this splice was 3× as likely to mutate`, mult: (k) => 1 + 0.25 * k },
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

/** where each kind's Ink comes from — an Ink Trait boosts exactly these */
export const PAYS_FROM: Record<EnchantKind, string> = {
  goose: 'its golden eggs and chased foxes', genie: 'its Ink wishes', map: 'its treasure chests', parasite: 'its feeds', cuckoo: 'the chicks it raises',
  pandora: 'gifts from the box, and Hope', splice: 'the Chimera’s roars', clockwork: 'its daily chime (wind the day’s last turn)',
  sizeray: 'micro-gems and parasites it shrinks', shard: 'whatever it reflects', wormhole: 'what you catch coming through it', oracle: 'each prophecy that comes true',
  ouroboros: 'its bank (when you break the circle or close it)', homunculus: 'its heart (when its week is up)', stormcoil: 'the bolts you catch in its storms',
};
/** what a kind's charge is called, where Wishing keeps one */
const KEEPS: Partial<Record<EnchantKind, string>> = { genie: 'wish', sizeray: 'shot', oracle: 'gaze' };
/** the bad luck a kind can dodge, where Trickster and Foresight dodge it */
const DODGES: Partial<Record<EnchantKind, (pct: number) => string>> = {
  goose: () => 'foxes miss its egg half the time (from its next egg on)',
  genie: (p) => `the Forbidden Wish’s twist misses ${p}% of the time`,
  cuckoo: (p) => `${p}% of the time a thrown-out egg rolls on into a neighbour’s nest instead`,
  pandora: (p) => `${p}% of the curses that escape miss you`,
  ouroboros: (p) => `${p}% of the time a loop that would bite through holds instead`,
  stormcoil: (p) => `${p}% of the plots a missed bolt would scorch are spared`,
};
const INK_GENES = new Set(['golden', 'grow', 'chaos', 'seek', 'spread', 'echo', 'linked', 'foresight', 'endless', 'charged', 'patchwork', 'inspired', 'wild', 'fertile', 'invested', 'streak', 'homely']);
/** what a reward's chip says when a Trait worked (mirrors the labels private.ench_pay writes) */
export const TRAIT_CHIP: Record<string, string> = {
  golden: 'Golden', grow: 'Giant', chaos: 'Chaos', seek: 'Seeking', spread: 'Spreading', echo: 'Echo', linked: 'Linked', foresight: 'Foresight',
  wish: 'Wishing', trick: 'Trickster', inspired: 'Inspired', wild: 'Wild', fertile: 'Fertile', invested: 'Invested', streak: 'Arcade streak', homely: 'At home',
  endless: 'Endless', charged: 'Charged', patchwork: 'Patchwork',
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
    else { text = `earns ${25 * s}% more Ink (it has no charges to keep)`; on = PAYS_FROM[me] ?? null; }
  }
  if (gene === 'trick') {
    const d = DODGES[me];
    if (d) text = d(pct);
    else { text = `earns ${20 * s}% more Ink (it has no bad luck to dodge)`; on = PAYS_FROM[me] ?? null; }
  }
  if (gene === 'foresight') {
    const extra = me === 'genie' ? ', and you see how the Forbidden Wish will turn out' : me === 'cuckoo' || me === 'pandora' || me === 'ouroboros' || me === 'stormcoil' ? `, and ${[35, 60, 80][s - 1]}% of its bad luck is seen coming and dodged` : '';
    text = `earns ${20 * s}% more Ink${extra}`;
  }
  if (gene === 'linked' && me === 'map') text = `earns ${40 * s}% more Ink, and picks up map pieces from anywhere`;
  if (gene === 'tempo') text = `its timers run ${s + 2}× as fast — eggs, wishes, charges and cooldowns all come sooner`;
  if (gene === 'patchwork') text = `every reward borrows a Trait from one of the Homunculus’s parts${s > 1 ? ` (at ${s}× strength)` : ''}`;
  return { gene, k: s, name: t.name, emoji: t.emoji, text, you, on };
}
/** what a plot's minigames get when an enchantment is spliced into it (mirrors private.ench_minigame_mult) */
export const PLOT_GETS: Record<string, string> = {
  golden: 'its minigames pay 1.5× Ink', grow: 'its minigames pay 2× Ink', chaos: 'its minigame wins are a gamble: 0.5× to 2.5×', seek: '1 in 4 wins pays 1.5×',
  spread: 'its minigames pay 15% more', echo: '35% of wins pay double', wish: 'its minigames pay 25% more', trick: 'its minigames pay 20% more',
  tempo: 'its minigames pay 30% more', linked: 'its minigames pay 40% more', foresight: 'its minigames pay 20% more',
  endless: 'its minigames pay 10% more', patchwork: 'its minigames borrow a part’s Trait', charged: 'its minigames pay 25% more',
};
export const PLOT_TRAIT: Record<string, string> = { canvas: 'inspired', habitat: 'wild', farm: 'fertile', business: 'invested', arcade: 'streak' };
export const plotTrait = (kind: string | null | undefined) => PLOT_TRAIT[kind ?? 'canvas'] ?? 'homely';
const ADJ: Record<string, [string, string]> = { goose: ['Golden', 'Hen'], genie: ['Wishing', 'Djinn'], map: ['Treasure', 'Atlas'], parasite: ['Hungering', 'Worm'],
  cuckoo: ['Trickster', 'Roc'], pandora: ['Cursed', 'Box'], clockwork: ['Ticking', 'Engine'], sizeray: ['Giant', 'Titan'], shard: ['Mirrored', 'Glass'],
  wormhole: ['Warped', 'Gate'], oracle: ['All-Seeing', 'Eye'], splice: ['Spliced', 'Chimera'],
  ouroboros: ['Endless', 'Serpent'], homunculus: ['Patchwork', 'Golem'], stormcoil: ['Charged', 'Storm'] };
const PLOT_NOUN: Record<string, string> = { canvas: 'Canvas', habitat: 'Habitat', farm: 'Farm', business: 'Shop', arcade: 'Arcade', home: 'House', landlord: 'Manor', train: 'Station',
  plane: 'Airfield', base: 'Plot', mine: 'Mine', sky: 'Sky Isle', workshop: 'Workshop', diner: 'Diner', dungeon: 'Dungeon', brawl: 'Arena' };
export const plotHybridName = (kind: string, plotKind: string | null | undefined) => `${ADJ[kind]?.[0] ?? 'Spliced'} ${PLOT_NOUN[plotKind ?? 'canvas'] ?? 'Realm'}`;
export const trinityName = (a: string, b: string, c: string) => { const k = [a, b, c].sort(); return `The ${ADJ[k[0]][0]} ${ADJ[k[1]][0]} ${ADJ[k[2]][1]}`; };
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
  Awakened: 'Reached level 5', Ascended: 'Reached level 10', 'Fox-Bane': 'Chased off 10 foxes', 'Golden Hen': 'Laid 25 eggs', Unbroken: 'A 7-egg golden streak',
  Platinum: 'Laid a Platinum egg', Forbidden: 'Made the Forbidden Wish', Wishmaster: 'Granted 30 wishes', Liberator: 'Set the Genie free',
  Cartographer: 'Dug up 5 treasure chests', Pathfinder: 'Found 40 map pieces', Symbiote: 'Evolved into a Symbiote', Devourer: 'Fed 25 times',
  'Brood Mother': 'Raised 5 chicks', 'Nest Thief': 'Raised 20 chicks', 'Hope-Bringer': 'Released Hope', 'Mad Scientist': 'Made 10 splices',
  'Chimera Codex': 'Discovered 36 hybrids', 'Grand Codex': 'Discovered 55 hybrids', Aberrant: 'Made an Aberration', Trinitarian: 'Made 3 different Trinities',
  Timekeeper: 'Wound the key 100 times', Stopwatch: 'Froze time 10 times', Sharpshooter: '10 PERFECT zaps',
  'Big Bang': 'Fired 50 times', Colossus: 'Made 10 plots giant', 'Ant-Maker': 'Made 10 plots tiny', Prankster: 'Pranked 10 players', 'Seven Years': 'Shattered the glass', 'Many Faces': 'Made 20 reflections',
  Gatekeeper: 'Opened the wormhole 5 times', Worldwalker: 'Linked plots 1,000 km apart', Constellation: 'Reached level 10',
  Seer: '10 prophecies came true', 'Fate-Weaver': 'Rewrote fate 10 times',
  'Codex Complete': 'Discovered all 91 hybrids', Eternal: 'Closed the circle (7 loops)', 'Tail-Catcher': '10 clean catches', Snakeskin: 'Bitten through 3 times',
  Alchemist: 'Woke a Homunculus', Generations: 'Three hearts', 'Many Limbs': 'Grew 7 parts', Stormcaller: 'Called 10 storms', 'Lightning Hands': 'Caught 50 bolts',
  Galvanist: 'Made an Aberration with lightning',
};

/** "2h 14m" / "6m 30s" */
export function dur(s: number | null | undefined) {
  if (s == null) return '';
  const v = Math.max(0, Math.round(s));
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
