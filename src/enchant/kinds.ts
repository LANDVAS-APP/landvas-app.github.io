// The ten enchantments, their splice genes, the 36 hybrids and the seven evils — a client mirror of the server's
// private.ench_info / private.ench_hybrid / private.pandora_evils (the server is authoritative).
export type EnchantKind = 'goose' | 'genie' | 'map' | 'parasite' | 'cuckoo' | 'pandora' | 'splice' | 'clockwork' | 'sizeray' | 'shard';

export type KindInfo = {
  id: EnchantKind; name: string; emoji: string; a: string; b: string; ink: string;
  tagline: string; how: string[]; gene: string | null; geneName: string | null; geneText: string | null;
};

export const KINDS: Record<EnchantKind, KindInfo> = {
  goose: { id: 'goose', name: 'Golden Goose', emoji: '🪿', a: '#FFD23F', b: '#FF9F1C', ink: '#3A2600',
    tagline: 'Lays a golden egg that grows the longer you dare to wait.',
    how: ['The egg grows for hours — collect it whenever you like (3% are Platinum, worth ×3).', 'Polish it every 10 minutes for extra Ink.', 'A fox sneaks in at secret times. Catch it in its window or it bites a chunk out of the egg.', 'Every egg the fox never touched builds a golden streak (+5% each).'],
    gene: 'golden', geneName: 'Golden', geneText: 'its partner’s Ink ×1.5' },
  genie: { id: 'genie', name: 'Genie', emoji: '🧞', a: '#8B5CFF', b: '#22E3FF', ink: '#14082E',
    tagline: 'Rub the lamp. Three wishes — and one that is forbidden.',
    how: ['A wish recharges every 8 hours; hold up to three.', 'Wish for Ink, Luck, Enchanted Luck, or a Golden Hour (your next 3 minigame wins pay ×2).', 'With three stored, the Forbidden Wish: seven wishes… or a twisted fortune and a cold lamp… or the Genie goes free, leaving a Mythic+ roll ticket.'],
    gene: 'wish', geneName: 'Wishing', geneText: 'its partner sometimes keeps a charge it spends' },
  map: { id: 'map', name: 'Treasure Map', emoji: '🗺️', a: '#E9C46A', b: '#8B5E34', ink: '#2B1A08',
    tagline: 'Four torn pieces hidden on other players’ land. X marks the spot.',
    how: ['Draw a map: four pieces are hidden on other players’ plots nearby (or buried in the wild).', 'Walk your explorer to each piece to pick it up — the plot’s owner gets a finder’s tip.', 'With all four, an X appears. Stand on it and dig for the chest: Ink, and sometimes an Epic+ or Legendary+ roll ticket.'],
    gene: 'seek', geneName: 'Seeking', geneText: 'its partner’s rewards sometimes come with a buried chest (+50)' },
  parasite: { id: 'parasite', name: 'Parasite', emoji: '🦠', a: '#7CFF6B', b: '#B026FF', ink: '#0B1F08',
    tagline: 'Leaps onto a stranger’s plot and feeds — until it becomes something more.',
    how: ['Release it: it latches onto a random player’s plot. They can shake it off (and get paid for it).', 'If it’s still there after 20 hours, harvest it for Ink.', '3 feeds: a Parasite. 10 feeds: a Symbiote — its hosts can’t shake it off, they share the meal, and can welcome it for more.'],
    gene: 'spread', geneName: 'Spreading', geneText: 'its partner pays +15% and spreads a spore of Ink to a random player' },
  cuckoo: { id: 'cuckoo', name: 'Cuckoo', emoji: '🪺', a: '#4CC9F0', b: '#F72585', ink: '#06222C',
    tagline: 'Sneaks its egg into someone else’s nest.',
    how: ['Scout three nests on other players’ plots: rarer plots raise richer chicks, but watchful owners spot eggs.', 'Lay your egg in one. It hatches in 10 hours — unless the owner finds it and throws it out (they get paid).', 'Raise the chick for Ink; sometimes it brings a lucky feather (+20 Luck).'],
    gene: 'trick', geneName: 'Trickster', geneText: 'half its partner’s bad luck slips past (dodged foxes, curses, ejections)' },
  pandora: { id: 'pandora', name: 'Pandora’s Box', emoji: '🏺', a: '#FF4D6D', b: '#2A0A3D', ink: '#1A0410',
    tagline: 'Lift the lid. Gifts — or one of seven evils.',
    how: ['Once a day, lift the lid one, two or three notches. Wider means bigger gifts — and likelier evils.', 'Each evil that escapes curses you for a while, and can only escape once.', 'When all seven are out, Hope rises from the bottom: a Legendary+ roll ticket and a fortune. The box closes again, richer.'],
    gene: 'chaos', geneName: 'Chaos', geneText: 'its partner’s rewards swing anywhere from ×0.5 to ×2.5' },
  splice: { id: 'splice', name: 'Splice', emoji: '🧪', a: '#00F5D4', b: '#9B5DE5', ink: '#04211D',
    tagline: 'Fuse two enchantments into a living hybrid.',
    how: ['Choose two of your enchantments: for 24 hours each wears the other’s gene.', 'There are 36 hybrids. Eight pairs resonate — their genes are twice as strong.', 'Discover every hybrid to complete your Splice Codex. A charge returns every 36 hours (hold 2).'],
    gene: null, geneName: null, geneText: null },
  clockwork: { id: 'clockwork', name: 'Clockwork', emoji: '⚙️', a: '#D4A373', b: '#6C584C', ink: '#20170E',
    tagline: 'Wind it up. Then bend time.',
    how: ['Wind the key (15 turns a day, 8 minutes each); it also ticks up on its own.', 'Spend the minutes to fast-forward any enchantment: grow an egg, hatch a chick, recharge a wish.', 'Or freeze one — a frozen spliced hybrid stays fused for longer.'],
    gene: 'tempo', geneName: 'Tempo', geneText: 'its partner’s clock runs three times as fast' },
  sizeray: { id: 'sizeray', name: 'Size Ray', emoji: '📡', a: '#39FF14', b: '#FF00E5', ink: '#071F05',
    tagline: 'Aim. Charge. Zap things bigger — or smaller.',
    how: ['Aim at a target; a needle swings — fire at the very peak for a PERFECT zap.', 'Grow a plot: it turns giant and its minigames pay ×1.5–2 for 6 hours.', 'Grow an enchantment’s next reward, shrink a goose’s fox, or shrink a parasite off your land and eat its meal.', 'Holds 3 charges; one returns every 8 hours.'],
    gene: 'grow', geneName: 'Giant', geneText: 'its partner’s Ink ×2' },
  shard: { id: 'shard', name: 'Mirror Shard', emoji: '🪞', a: '#C0F5FF', b: '#7DD3FC', ink: '#05202A',
    tagline: 'Look into it, and become what you see.',
    how: ['Gaze: three of other players’ enchantments are reflected in the glass.', 'Step through one and for 24 hours your shard becomes it — its owner is told, and tipped.', 'Every reflection cracks the glass. At seven cracks it shatters into +20 Luck and Enchanted Luck, and mends.'],
    gene: 'echo', geneName: 'Echo', geneText: 'its partner’s rewards are sometimes paid twice' },
};
export const KIND_ORDER: EnchantKind[] = ['goose', 'genie', 'map', 'parasite', 'cuckoo', 'pandora', 'splice', 'clockwork', 'sizeray', 'shard'];
export const kindInfo = (k: string | null | undefined): KindInfo => KINDS[(k ?? 'goose') as EnchantKind] ?? KINDS.goose;

/** the 36 hybrids: [name, resonant] (mirrors private.ench_hybrid) */
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
};
export const hybridKey = (a: string, b: string) => (a < b ? `${a}+${b}` : `${b}+${a}`);
export const hybridOf = (a: string, b: string) => HYBRIDS[hybridKey(a, b)] ?? ['Chimera', false];
/** what a hybrid does: each parent wears the other's gene (resonant pairs twice as strong) */
export function hybridText(a: EnchantKind, b: EnchantKind) {
  const [, res] = hybridOf(a, b);
  const one = (x: EnchantKind, y: EnchantKind) => (KINDS[y].geneText ? `${KINDS[x].name}: ${KINDS[y].geneText}${res ? ' — doubled' : ''}` : null);
  return [one(a, b), one(b, a)].filter(Boolean) as string[];
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
  'Chimera Codex': 'Discovered all 36 hybrids', Timekeeper: 'Wound the key 100 times', Stopwatch: 'Froze time 10 times', Sharpshooter: '10 PERFECT zaps',
  'Big Bang': 'Fired 50 times', 'Seven Years': 'Shattered the glass', 'Many Faces': 'Made 20 reflections',
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
