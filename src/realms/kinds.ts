// The five realm plot types, as the app talks about them (the rules and numbers come from the server).
import type { PlotKind, RealmKind } from '../backend/types';

export const REALM_KINDS: RealmKind[] = ['mine', 'sky', 'workshop', 'diner', 'dungeon'];
export const isRealm = (k: PlotKind | string | undefined | null): k is RealmKind => !!k && (REALM_KINDS as string[]).includes(k);

export type RealmMeta = {
  name: string; one: string; many: string; emoji: string; color: string; enter: string; body: string; long: string;
  /** what the producers and the recipes are called here */ crew: string; make: string; market: string; book: string; bookItem: string;
};
export const REALM_META: Record<RealmKind, RealmMeta> = {
  mine: {
    name: 'Crystal Mine', one: 'mine', many: 'mines', emoji: '⛏️', color: '#7C5CFF', enter: 'Go down the mine',
    body: 'Ore, gems, fossils, six caves deep', crew: 'Crew & machines', make: 'Smelter', market: 'Ore trader', book: 'Fossil & relic book', bookItem: 'find',
    long: 'Dig down through six cave zones — Topsoil Tunnels to the glittering Ancient Core. Play Deep Dig for ore, gems and fossils, hire miners and build drills that dig while you’re away, smelt bars and craft crowns.',
  },
  sky: {
    name: 'Sky Island', one: 'sky island', many: 'sky islands', emoji: '☁️', color: '#38BDF8', enter: 'Fly up to the island',
    body: 'A floating island, sky creatures', crew: 'Island builds', make: 'Cloud loom', market: 'Wind trader', book: 'Sky creature log', bookItem: 'sighting',
    long: 'A little island floating in the clouds that grows as you level: meadows, a rainbow waterfall, a wind spire, golden gardens and a starlit peak. Play Sky Glide for starlight, spot rare sky creatures, and build windmills and sun mirrors.',
  },
  workshop: {
    name: 'Inventor’s Workshop', one: 'workshop', many: 'workshops', emoji: '🛠️', color: '#F59E0B', enter: 'Step into the workshop',
    body: 'Machines, parts, gadgets to invent', crew: 'Machines', make: 'Invention bench', market: 'Parts dealer', book: 'Blueprint archive', bookItem: 'blueprint',
    long: 'From a cluttered garage to a humming fusion vault. Run the Assembly Line minigame for parts, build presses and printers that make more, and invent gadgets — wind-up mice, jetpacks, robo pets, a time machine.',
  },
  diner: {
    name: 'Restaurant', one: 'restaurant', many: 'restaurants', emoji: '🍳', color: '#EF4444', enter: 'Open the restaurant',
    body: 'Cook, serve, grow a food cart', crew: 'Suppliers', make: 'Kitchen', market: 'Market stall', book: 'Awards & secret recipes', bookItem: 'award',
    long: 'Start with a food cart and grow it into a diner, a patio, a bistro, a grand dining hall and a rooftop restaurant. Play Order Up! for tips, keep suppliers stocked, and cook pancakes, pizza, tacos and truffle feasts.',
  },
  dungeon: {
    name: 'Dungeon', one: 'dungeon', many: 'dungeons', emoji: '⚔️', color: '#A855F7', enter: 'Enter the dungeon',
    body: 'Six floors down, monsters, loot', crew: 'Minions', make: 'Forge & alchemy', market: 'Shady merchant', book: 'Legendary loot', bookItem: 'treasure',
    long: 'Six floors from the Crypt Entrance down to the Dragon’s Lair. Run Dungeon Dash for treasure and monster parts, keep skeleton guards and wizard towers working, and forge potions, shields and dragon armour.',
  },
};
export const realmRoute = (id: string) => `/realm/${id}`;
