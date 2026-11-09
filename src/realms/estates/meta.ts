// Estates: the 2x2 merge tier. Four plots of one type merged into a square can become that type's Estate — a bigger
// place with its own world, economy and signature minigame (the numbers live on the server, in the realms config).
import type { DomainKind, EstateKind, PlotKind } from '../../backend/types';
import { DOMAINS, domainOf, isDomain } from './domains';
import type { RealmMeta } from '../kinds';

export type EstateMeta = RealmMeta & { base: PlotKind; game: string; tagline: string; perks: string[] };

export const ESTATES: Record<EstateKind, EstateMeta> = {
  atelier: {
    base: 'canvas', name: 'Grand Atelier', one: 'atelier', many: 'ateliers', emoji: '🖼️', color: '#A66BFF', enter: 'Step into the atelier', game: 'Hue Hunter',
    body: 'A painters’ estate of studios and galleries', tagline: 'Your canvases grow into a whole school of art.',
    long: 'Easels in a sunlit loft, a pigment garden, a sculpture court, a glasshouse studio and a grand gallery. Mix colours by eye in Hue Hunter, train apprentices, fire glazes and craft masterpieces.',
    crew: 'Studio & crew', make: 'Atelier bench', market: 'Art dealer', book: 'Collector’s catalogue', bookItem: 'treasure',
    perks: ['Hue Hunter: mix paint to match a colour', 'Six wings from Sketch Loft to Hall of Masters', 'Apprentices, kilns and a muse fountain', '12 art treasures to collect'],
  },
  reserve: {
    base: 'habitat', name: 'Wildwood Reserve', one: 'reserve', many: 'reserves', emoji: '🦌', color: '#2FBF71', enter: 'Walk into the reserve', game: 'Firefly Lantern',
    body: 'An ancient forest full of wild creatures', tagline: 'Your habitat grows into a living forest.',
    long: 'Mossy hollows, berry brambles, an otter creek, a meadow that glows at night and a spirit grove. Lead fireflies home in Firefly Lantern, tend bee hives and amber pines, and meet the forest’s rarest creatures.',
    crew: 'Grove & rangers', make: 'Forager’s table', market: 'Trading post', book: 'Field guide', bookItem: 'creature',
    perks: ['Firefly Lantern: guide fireflies, dodge owls', 'Six woodland zones up to the Spirit Grove', 'Hives, glades and a glowing spring', '12 wild creatures to meet'],
  },
  ranch: {
    base: 'farm', name: 'Harvest Valley Ranch', one: 'ranch', many: 'ranches', emoji: '🐎', color: '#E8A33D', enter: 'Ride into the ranch', game: 'Sheepdog Roundup',
    body: 'A rolling ranch with herds, orchards and a county fair', tagline: 'Your farm grows into a whole valley.',
    long: 'A red barn homestead, sheep hills, a dairy meadow, an apple orchard, pumpkin fields and a blue-ribbon fairground. Herd the flock in Sheepdog Roundup, press cider, age cheese and win the county fair.',
    crew: 'Barns & herds', make: 'Farmhouse kitchen', market: 'Feed store', book: 'Prize breeds', bookItem: 'breed',
    perks: ['Sheepdog Roundup: herd the flock through the gate', 'Six zones up to the county fairground', 'Sheep, cows, orchards and truffle pigs', '12 prize breeds to raise'],
  },
  exchange: {
    base: 'business', name: 'Skyline Exchange', one: 'exchange', many: 'exchanges', emoji: '🏙️', color: '#F2C230', enter: 'Take the lift up', game: 'Market Maker',
    body: 'A skyscraper of deals, desks and vaults', tagline: 'Your business grows into a tower above the city.',
    long: 'A marble lobby, an open office, a roaring trading floor, a penthouse, a sky bridge and a rooftop helipad. Trade the ticks in Market Maker, run law firms and labs, fill the gold vault and build a global empire.',
    crew: 'Floors & desks', make: 'Deal room', market: 'Broker', book: 'Boardroom trophies', bookItem: 'trophy',
    perks: ['Market Maker: hold to buy, let go to sell', 'Six floors up to the rooftop helipad', 'Law firms, R&D labs and a gold vault', '12 boardroom trophies to win'],
  },
  boardwalk: {
    base: 'arcade', name: 'Arcade Carnival', one: 'carnival', many: 'carnivals', emoji: '🎡', color: '#00E5FF', enter: 'Enter Arcade Carnival', game: 'Duck Shoot',
    body: 'Your arcade, with a whole carnival out the front door', tagline: 'Your arcade grows a carnival outside its doors.',
    long: 'The same arcade — your cabinets, tickets, prizes and level — with its front doors thrown open onto a carnival at night. Six real 3D booths (Duck Shoot, Balloon Darts, Milk Bottles, Whack-a-Crab, High Striker and the Water Gun Race), a Ferris wheel and a carousel to ride, a treat cart, a fortune teller, a photo booth and fireworks.',
    crew: 'Booths & rides', make: 'Prize workshop', market: 'Ticket booth', book: 'Prize shelf', bookItem: 'prize',
    perks: ['Walk out of the arcade onto the midway', '6 carnival booth games, played right in the booth', 'Ride the Ferris wheel and the carousel', 'Treats, a fortune teller, photos and fireworks'],
  },
  gemheart: {
    base: 'mine', name: 'Gemheart Caverns', one: 'cavern', many: 'caverns', emoji: '💎', color: '#19D3C5', enter: 'Descend into the caverns', game: 'Crystal Echo',
    body: 'Singing caves of amethyst, sapphire and ruby', tagline: 'Your mine breaks into the caverns beneath.',
    long: 'An echoing tunnel, an amethyst grotto, a glowing sapphire lake, emerald falls, a ruby forge and the Starheart Chamber. Play the crystals’ song back in Crystal Echo, cut gems and craft crown jewels.',
    crew: 'Crystal works', make: 'Gem bench', market: 'Jeweller', book: 'Cavern bestiary', bookItem: 'find',
    perks: ['Crystal Echo: play the crystals’ tune back', 'Six caverns down to the Starheart Chamber', 'A crystal harp, emerald vines and a ruby forge', '12 cavern wonders to find'],
  },
  skyport: {
    base: 'sky', name: 'Aurora Skyport', one: 'skyport', many: 'skyports', emoji: '🎈', color: '#8A7CFF', enter: 'Board the skyport', game: 'Airship Docking',
    body: 'A harbour of airships under the northern lights', tagline: 'Your sky island becomes a port for airships.',
    long: 'A mooring field of tethered balloons, a balloon yard, a compass tower, the aurora deck, the comet docks and the celestial pier. Land airships in Airship Docking, weave aurora silk and launch a flagship to the stars.',
    crew: 'Docks & lofts', make: 'Shipwright', market: 'Harbour master', book: 'Captain’s log', bookItem: 'sighting',
    perks: ['Airship Docking: ride the gusts to a perfect berth', 'Six zones up to the Celestial Pier', 'Gas works, an observatory and a comet net', '12 sky sightings to log'],
  },
  foundry: {
    base: 'workshop', name: 'Clockwork Foundry', one: 'foundry', many: 'foundries', emoji: '⚙️', color: '#E2783B', enter: 'Enter the foundry', game: 'Rocket Stages',
    body: 'A steam-powered works of gears and rockets', tagline: 'Your workshop grows into a roaring foundry.',
    long: 'A scrap yard, a coil room full of sparks, a gear hall, boiler works, valve labs and the Aether Reactor. Time every stage of a brass rocket in Rocket Stages, build automatons and a time engine.',
    crew: 'Machines', make: 'Assembly floor', market: 'Parts exchange', book: 'Patent archive', bookItem: 'invention',
    perks: ['Rocket Stages: fire each stage in the green', 'Six works up to the Aether Reactor', 'Gear presses, boilers and an aether reactor', '12 inventions to discover'],
  },
  foodhall: {
    base: 'diner', name: 'Grand Food Hall', one: 'food hall', many: 'food halls', emoji: '🍱', color: '#FF6B3D', enter: 'Walk into the food hall', game: 'Sushi Train',
    body: 'A buzzing hall of stalls, sushi and spice', tagline: 'Your restaurant grows into a whole food hall.',
    long: 'A noodle stall, a sushi bar, a spice bazaar, a grill pit, a dessert garden and a banquet hall. Serve every guest the right dish in Sushi Train, grow rice and saffron, and cook a royal banquet.',
    crew: 'Stalls & suppliers', make: 'Head chef’s kitchen', market: 'Food market', book: 'Chef’s treasures', bookItem: 'treasure',
    perks: ['Sushi Train: serve each guest their dish', 'Six halls up to the Banquet Hall', 'Rice paddies, a fish market and a spice bazaar', '12 chef’s treasures to collect'],
  },
  citadel: {
    base: 'dungeon', name: 'Dragonspire Citadel', one: 'citadel', many: 'citadels', emoji: '🐉', color: '#B23CFF', enter: 'Storm the citadel', game: 'Boss Rush',
    body: 'A dark fortress with a dragon at its peak', tagline: 'Your dungeon rises into a dragon’s citadel.',
    long: 'A gatehouse, bone catacombs, a whispering rune library, the Throne of Ash, a dragon roost and the Void Gate. Dodge and strike in Boss Rush, forge runeblades and dragonscale armour, and claim the Crown of Ages.',
    crew: 'Garrison', make: 'War forge', market: 'Black market', book: 'Hoard ledger', bookItem: 'relic',
    perks: ['Boss Rush: dodge, grab swords, strike', 'Six halls up to the Void Gate', 'A phoenix aerie, dragon roost and void gate', '12 legendary relics to hoard'],
  },
  colosseum: {
    base: 'brawl', name: 'Champions’ Colosseum', one: 'colosseum', many: 'colosseums', emoji: '🏟️', color: '#FF5A5F', enter: 'Enter the colosseum', game: 'Card Clash',
    body: 'A grand arena for the card champions', tagline: 'Your arena grows into a colosseum of legends.',
    long: 'A training pit, a banner hall, the card vault, a holo arena, the champions’ gallery and the Hall of Legends. Chain matching pairs in Card Clash, press foils and holos, and paint a legend card.',
    crew: 'Arena works', make: 'Card studio', market: 'Card trader', book: 'Champion cards', bookItem: 'card',
    perks: ['Card Clash: match pairs, chain combos', 'Six halls up to the Hall of Legends', 'Card presses, holo prisms and a mythic atelier', '12 champion cards to collect'],
  },
};
export const ESTATE_KINDS = Object.keys(ESTATES) as EstateKind[];
export const isEstate = (k: string | null | undefined): k is EstateKind => !!k && k in ESTATES;
/** the Estate a base type upgrades to */
export const estateOf = (base: PlotKind | string | null | undefined): EstateKind | null => (ESTATE_KINDS.find((e) => ESTATES[e].base === base) ?? null);

/** Every merge tier above a base type: Estates (2x2) and Domains (3x3). */
export type TierKind = EstateKind | DomainKind;
export const TIERS: Record<TierKind, EstateMeta> = { ...ESTATES, ...DOMAINS };
export const isTier = (k: string | null | undefined): k is TierKind => isEstate(k) || isDomain(k);
/** the square a tier needs: 2 for an Estate, 3 for a Domain, 0 for a base type */
export const tierSize = (k: string | null | undefined) => (isDomain(k) ? 3 : isEstate(k) ? 2 : 0);
/** a type, its Estate and its Domain are one family: they all merge together */
export const kindFamily = (k: PlotKind | string): PlotKind => (isTier(k) ? TIERS[k].base : (k as PlotKind));
/** the tiers a family offers, smallest first */
export const tiersOf = (k: PlotKind | string) => { const b = kindFamily(k); return [estateOf(b), domainOf(b)].filter(Boolean) as TierKind[]; };

/** Does this set of plots hold a full 2x2 square? (the server checks this too) */
export function hasSquare(cells: [number, number, ...unknown[]][], n = 2) {
  const set = new Set(cells.map((c) => `${c[0]}_${c[1]}`));
  for (const [x, y] of cells) {
    let ok = true;
    for (let i = 0; i < n && ok; i++) for (let j = 0; j < n && ok; j++) if (!set.has(`${x + i}_${y + j}`)) ok = false;
    if (ok) return true;
  }
  return false;
}
/** How close the group is to an n×n square: the best window's filled cells and where it is. */
export function squareProgress(cells: [number, number, ...unknown[]][], n = 2) {
  const set = new Set(cells.map((c) => `${c[0]}_${c[1]}`));
  let best = { have: 0, x: cells[0]?.[0] ?? 0, y: cells[0]?.[1] ?? 0 };
  for (const [cx, cy] of cells) for (let ox = 0; ox < n; ox++) for (let oy = 0; oy < n; oy++) {
    const x = cx - ox, y = cy - oy; let have = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (set.has(`${x + i}_${y + j}`)) have++;
    if (have > best.have) best = { have, x, y };
  }
  const all: [number, number][] = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) all.push([best.x + i, best.y + j]);
  return { ...best, n, missing: all.filter(([x, y]) => !set.has(`${x}_${y}`)) };
}
