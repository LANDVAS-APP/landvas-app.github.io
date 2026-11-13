// The twelve enchantments, their splice Traits, the 55 hybrids and the seven evils — a client mirror of the server's
// private.ench_info / private.ench_hybrid / private.pandora_evils (the server is authoritative).
//
// Plain words everywhere: a splice "gene" is a Trait, a "resonant" pair is a Perfect Match, and every hybrid card says
// what each side actually gets, with numbers.
export type EnchantKind = 'goose' | 'genie' | 'map' | 'parasite' | 'cuckoo' | 'pandora' | 'splice' | 'clockwork' | 'sizeray' | 'shard' | 'wormhole' | 'oracle';

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
    gene: 'wish', geneName: 'Wishing', geneText: 'sometimes keeps a charge it spends (30%)' },
  map: { id: 'map', name: 'Treasure Map', emoji: '🗺️', a: '#E9C46A', b: '#8B5E34', ink: '#2B1A08', noun: 'treasure hunts',
    tagline: 'Four torn pieces hidden on other players’ land. X marks the spot.',
    how: ['Draw a map: four pieces are hidden on other players’ plots nearby (or buried in the wild).', 'Walk your explorer to each piece to pick it up — the plot’s owner gets a finder’s tip.', 'With all four, an X appears. Stand on it and dig for the chest: Ink, and sometimes an Epic+ or Legendary+ roll ticket.'],
    gene: 'seek', geneName: 'Seeking', geneText: '1 in 4 rewards comes with a buried chest (+50 Ink)' },
  parasite: { id: 'parasite', name: 'Parasite', emoji: '🦠', a: '#7CFF6B', b: '#B026FF', ink: '#0B1F08', noun: 'feeding',
    tagline: 'Wraps itself around a stranger’s plot and feeds — until it becomes something more.',
    how: ['Release it: it wraps around a random player’s plot — you can see it there on the map. They can peel it off (and get paid for it).', 'If it’s still there after 20 hours, harvest it for Ink.', '3 feeds: a Parasite. 10 feeds: a Symbiote — its hosts can’t peel it off, they share the meal, and can welcome it for more.'],
    gene: 'spread', geneName: 'Spreading', geneText: 'earns 15% more Ink and drops a gift of Ink on a random player' },
  cuckoo: { id: 'cuckoo', name: 'Cuckoo', emoji: '🪺', a: '#4CC9F0', b: '#F72585', ink: '#06222C', noun: 'raising chicks',
    tagline: 'Sneaks its egg into someone else’s nest.',
    how: ['Scout three nests on other players’ plots: rarer plots raise richer chicks, but watchful owners spot eggs.', 'Lay your egg in one. It hatches in 10 hours — unless the owner finds it and throws it out (they get paid).', 'Raise the chick for Ink; sometimes it brings a lucky feather (+20 Luck).'],
    gene: 'trick', geneName: 'Trickster', geneText: 'dodges half its bad luck (foxes, curses, being thrown out)' },
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
    how: ['Wind the key (15 turns a day, 8 minutes each); it also ticks up on its own.', 'Spend the minutes to fast-forward any enchantment: grow an egg, hatch a chick, recharge a wish.', 'Or freeze one — a frozen spliced hybrid stays fused for longer.'],
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
      'Seal a prophecy about a friend’s next roll: when it comes true, you both get Ink. At level 10 it sees 5 cards and you can rewrite twice.'],
    gene: 'foresight', geneName: 'Foresight', geneText: 'earns 20% more Ink and sees 35% of bad luck coming (and dodges it)' },
};
export const KIND_ORDER: EnchantKind[] = ['goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard', 'wormhole', 'oracle'];
export const kindInfo = (k: string | null | undefined): KindInfo => KINDS[(k ?? 'goose') as EnchantKind] ?? KINDS.goose;

/** the 55 hybrids: [name, Perfect Match] (mirrors private.ench_hybrid) */
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
  golden: { name: 'Golden', emoji: '🪿', text: (k) => `earns ${x(1 + 0.5 * k)} Ink`, mult: (k) => 1 + 0.5 * k },
  grow: { name: 'Giant', emoji: '📡', text: (k) => `earns ${x(1 + k)} Ink`, mult: (k) => 1 + k },
  chaos: { name: 'Chaos', emoji: '🏺', text: (k) => `every reward is a gamble: ${[0.5, 0.75, 1][k - 1]}× to ${[2.5, 3.5, 4][k - 1]}× Ink` },
  seek: { name: 'Seeking', emoji: '🗺️', text: (k) => `${[25, 50, 75][k - 1]}% of rewards come with a buried chest (+50 Ink)` },
  spread: { name: 'Spreading', emoji: '🦠', text: (k) => `earns ${15 * k}% more Ink, and drops a gift on a random player`, mult: (k) => 1 + 0.15 * k },
  echo: { name: 'Echo', emoji: '🪞', text: (k) => `${[35, 60, 80][k - 1]}% of its rewards are paid twice` },
  wish: { name: 'Wishing', emoji: '🧞', text: (k) => `${[30, 55, 75][k - 1]}% of the time, using a charge doesn’t use it up` },
  trick: { name: 'Trickster', emoji: '🪺', text: (k) => `dodges ${[50, 75, 90][k - 1]}% of its bad luck (foxes, curses, being thrown out)` },
  tempo: { name: 'Tempo', emoji: '⚙️', text: (k) => `its timers run ${k + 2}× as fast` },
  linked: { name: 'Linked', emoji: '🌀', text: (k) => `works as if on a second plot: +${40 * k}% Ink`, mult: (k) => 1 + 0.4 * k },
  foresight: { name: 'Foresight', emoji: '👁️', text: (k) => `earns ${20 * k}% more Ink and sees ${[35, 60, 80][k - 1]}% of bad luck coming`, mult: (k) => 1 + 0.2 * k },
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
/** what a plot's minigames get when an enchantment is spliced into it (mirrors private.ench_minigame_mult) */
export const PLOT_GETS: Record<string, string> = {
  golden: 'its minigames pay 1.5× Ink', grow: 'its minigames pay 2× Ink', chaos: 'its minigame wins are a gamble: 0.5× to 2.5×', seek: '1 in 4 wins pays 1.5×',
  spread: 'its minigames pay 15% more', echo: '35% of wins pay double', wish: 'its minigames pay 25% more', trick: 'its minigames pay 20% more',
  tempo: 'its minigames pay 30% more', linked: 'its minigames pay 40% more', foresight: 'its minigames pay 20% more',
};
export const PLOT_TRAIT: Record<string, string> = { canvas: 'inspired', habitat: 'wild', farm: 'fertile', business: 'invested', arcade: 'streak' };
export const plotTrait = (kind: string | null | undefined) => PLOT_TRAIT[kind ?? 'canvas'] ?? 'homely';
const ADJ: Record<string, [string, string]> = { goose: ['Golden', 'Hen'], genie: ['Wishing', 'Djinn'], map: ['Treasure', 'Atlas'], parasite: ['Hungering', 'Worm'],
  cuckoo: ['Trickster', 'Roc'], pandora: ['Cursed', 'Box'], clockwork: ['Ticking', 'Engine'], sizeray: ['Giant', 'Titan'], shard: ['Mirrored', 'Glass'],
  wormhole: ['Warped', 'Gate'], oracle: ['All-Seeing', 'Eye'], splice: ['Spliced', 'Chimera'] };
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
    const lvl = lv && lv > 1 ? 1 + 0.06 * (lv - 1) : 1;
    const now = t.mult ? `Ink ×${lvl.toFixed(2)} now → ×${(lvl * t.mult(k)).toFixed(2)} spliced` : null;
    return { me, emoji: KINDS[me].emoji, who: KINDS[me].name, gets: t.text(k), trait: t.name, traitEmoji: t.emoji, live: now };
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
  'Chimera Codex': 'Discovered 36 hybrids', 'Grand Codex': 'Discovered all 55 hybrids', Aberrant: 'Made an Aberration', Trinitarian: 'Made 3 different Trinities',
  Timekeeper: 'Wound the key 100 times', Stopwatch: 'Froze time 10 times', Sharpshooter: '10 PERFECT zaps',
  'Big Bang': 'Fired 50 times', Colossus: 'Made 10 plots giant', 'Ant-Maker': 'Made 10 plots tiny', Prankster: 'Pranked 10 players', 'Seven Years': 'Shattered the glass', 'Many Faces': 'Made 20 reflections',
  Gatekeeper: 'Opened the wormhole 5 times', Worldwalker: 'Linked plots 1,000 km apart', Constellation: 'Reached level 10',
  Seer: '10 prophecies came true', 'Fate-Weaver': 'Rewrote fate 10 times',
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
