// Domains: the 3x3 merge tier. Nine plots of one type merged into a square can become that type's Domain — the
// grandest version of the place, with its own world, economy and signature minigame (numbers live on the server).
import type { DomainKind } from '../../backend/types';
import type { EstateMeta } from './meta';

export const DOMAINS: Record<DomainKind, EstateMeta> = {
  museum: {
    base: 'canvas', name: 'Starlight Museum', one: 'museum', many: 'museums', emoji: '🌌', color: '#6C7BFF', enter: 'Enter the museum', game: 'Constellation',
    body: 'A museum of the night sky, open after dark', tagline: 'Your art spills into the stars.',
    long: 'A star foyer, an orrery hall, an aurora wing, a moon gallery, a comet atrium and the Hall of the Cosmos under a glass dome. Draw constellations in one stroke, bottle aurora oil and paint a ceiling of galaxies.',
    crew: 'Galleries & scopes', make: 'Star studio', market: 'Patron’s salon', book: 'Night catalogue', bookItem: 'wonder',
    perks: ['Constellation: one unbroken stroke through the stars', 'Six wings up to the Hall of the Cosmos', 'Star telescopes, aurora prisms and a galaxy vault', 'A grander economy: Renown and bottled galaxies'],
  },
  sanctuary: {
    base: 'habitat', name: 'Spirit Lake Sanctuary', one: 'sanctuary', many: 'sanctuaries', emoji: '🦢', color: '#3FA7D6', enter: 'Row onto the lake', game: 'Spirit Angler',
    body: 'A misty lake of swans, herons and spirit fish', tagline: 'Your habitat becomes a sacred lake.',
    long: 'A reed shore, lily shallows, a heron isle, a mist cove, the pearl deeps and the Spirit Spring. Fight fish on the line in Spirit Angler, raise oysters and draw water from the spring itself.',
    crew: 'Shores & shoals', make: 'Boathouse', market: 'Lakeside market', book: 'Spirit bestiary', bookItem: 'spirit',
    perks: ['Spirit Angler: keep the line’s tension in the green', 'Six waters down to the Spirit Spring', 'Reed beds, oyster beds and a spirit wellspring', 'A grander economy: Pearls and spirit water'],
  },
  kingdom: {
    base: 'farm', name: 'Harvest Kingdom', one: 'kingdom', many: 'kingdoms', emoji: '🏰', color: '#D99A2B', enter: 'Ride through the gates', game: 'Plough Run',
    body: 'A walled realm of fields, vineyards and a castle', tagline: 'Your farm becomes a whole kingdom.',
    long: 'A market village, a sunny vineyard, bee gardens, silk groves, a saffron meadow and the Harvest Castle. Plough whole fields in Plough Run, press royal wine and grow golden apples for the crown.',
    crew: 'Lands & mills', make: 'Royal kitchens', market: 'Kingdom fair', book: 'Royal treasury', bookItem: 'heirloom',
    perks: ['Plough Run: cover the whole field, dodge the cows', 'Six lands up to the Harvest Castle', 'Windmills, silk groves and a golden grove', 'A grander economy: Crowns and golden apples'],
  },
  megacorp: {
    base: 'business', name: 'Megacorp Spire', one: 'spire', many: 'spires', emoji: '🏢', color: '#2EC4B6', enter: 'Badge into the spire', game: 'Lift Rush',
    body: 'A glass megatower of labs, fabs and deals', tagline: 'Your business becomes a global giant.',
    long: 'A glass atrium, open floors, AI labs, clean rooms, a sky lounge and The Crown at the very top. Run the lifts in Lift Rush, etch chips, file patents and switch on the quantum core.',
    crew: 'Divisions', make: 'R&D floor', market: 'Stock exchange', book: 'Hall of patents', bookItem: 'breakthrough',
    perks: ['Lift Rush: get everyone to their floor', 'Six levels up to The Crown', 'AI labs, chip fabs and a quantum core', 'A grander economy: Equity and quantum chips'],
  },
  galaxypark: {
    base: 'arcade', name: 'Neon Galaxy Park', one: 'galaxy park', many: 'galaxy parks', emoji: '🛸', color: '#FF2E88', enter: 'Blast off into the park', game: 'Ring Toss',
    body: 'A theme park on the moon, lit in neon', tagline: 'Your arcade becomes a park in space.',
    long: 'A launch gate, a moon midway, ring toss row, rocket rides, the star coaster and the Supernova Stage. Ring the far bottles in Ring Toss, pump rocket fuel and stitch star plushies.',
    crew: 'Rides & booths', make: 'Prize factory', market: 'Star exchange', book: 'Cosmic prize wall', bookItem: 'prize',
    perks: ['Ring Toss: throw against the wind', 'Six zones up to the Supernova Stage', 'Glow carts, fuel stations and a meteor crater', 'A grander economy: Stars and meteorites'],
  },
  core: {
    base: 'mine', name: 'World’s Core', one: 'core', many: 'cores', emoji: '🌋', color: '#FF5A1F', enter: 'Drop to the core', game: 'Drill Dive',
    body: 'The molten heart of the world', tagline: 'Your mine breaks through to the planet’s heart.',
    long: 'Cracked crust, sulfur vents, lava glassworks, titan shafts, the mantle sea and The Core itself. Plunge through the planet in Drill Dive, blow lava glass and cage a planet’s heart.',
    crew: 'Bores & pumps', make: 'Magma forge', market: 'Deep exchange', book: 'Core samples', bookItem: 'sample',
    perks: ['Drill Dive: steer down through the planet', 'Six layers down to The Core', 'Lava kilns, deep borers and a heart cage', 'A grander economy: Magma and planet hearts'],
  },
  observatory: {
    base: 'sky', name: 'Celestial Observatory', one: 'observatory', many: 'observatories', emoji: '🔭', color: '#4F6BFF', enter: 'Climb to the dome', game: 'Orbit Slingshot',
    body: 'An observatory above the clouds', tagline: 'Your sky island reaches the stars.',
    long: 'The great dome, an orbit garden, the nebula deck, a comet harbour, the pulsar tower and the Void Window. Bend comets round planets in Orbit Slingshot, harpoon comets and grind a void lens.',
    crew: 'Domes & mirrors', make: 'Star chart room', market: 'Celestial bourse', book: 'Star atlas', bookItem: 'discovery',
    perks: ['Orbit Slingshot: use gravity to curve your shot', 'Six decks up to the Void Window', 'Star mirrors, comet harpoons and a void lens', 'A grander economy: Stardust and dark matter'],
  },
  automaton: {
    base: 'workshop', name: 'Automaton Works', one: 'works', many: 'works', emoji: '🤖', color: '#F5B83D', enter: 'Power up the works', game: 'Circuit Connect',
    body: 'A factory that builds thinking machines', tagline: 'Your workshop learns to think.',
    long: 'A parts yard, a wire loom, the circuit hall, an optics lab, the dynamo room and the Mind Vault. Wire boards in Circuit Connect, etch circuits, grind glass eyes and build a thinking engine.',
    crew: 'Lines & looms', make: 'Assembly hall', market: 'Robot exchange', book: 'Automaton registry', bookItem: 'automaton',
    perks: ['Circuit Connect: turn tiles until every bulb lights', 'Six halls up to the Mind Vault', 'Dynamos, eye makers and a thinking engine', 'A grander economy: Cogs and mind cores'],
  },
  banquet: {
    base: 'diner', name: 'Sky Banquet Palace', one: 'palace', many: 'palaces', emoji: '🎂', color: '#FF6FA8', enter: 'Float up to the palace', game: 'Perfect Slice',
    body: 'A pastry palace on the clouds', tagline: 'Your restaurant becomes a palace of feasts.',
    long: 'A cloud bakery, a creamery, berry terraces, chocolate falls, vanilla gardens and the Banquet Palace. Cut fair slices in Perfect Slice, whip cloud cream and gild a royal cake.',
    crew: 'Kitchens & gardens', make: 'Pastry hall', market: 'Palace market', book: 'Royal cookbook', bookItem: 'recipe',
    perks: ['Perfect Slice: cut every cake into fair pieces', 'Six terraces up to the Banquet Palace', 'Cloud dairies, cocoa houses and a gold kitchen', 'A grander economy: Stars and gold leaf'],
  },
  abyss: {
    base: 'dungeon', name: 'Abyssal Throne', one: 'throne', many: 'thrones', emoji: '👁️', color: '#7A2CFF', enter: 'Descend the endless stair', game: 'Rune Duel',
    body: 'A throne at the bottom of the world', tagline: 'Your dungeon becomes a dark empire.',
    long: 'The endless stair, a shadow web, the blood altar, a void forge, the fallen star and the Throne itself. Draw runes to blast monsters in Rune Duel, forge void steel and turn the Great Hourglass.',
    crew: 'Legions', make: 'Void forge', market: 'Shadow bazaar', book: 'Dark codex', bookItem: 'relic',
    perks: ['Rune Duel: draw the rune on each monster', 'Six depths down to The Throne', 'Ash pyres, a void forge and the Great Hourglass', 'A grander economy: Souls and eternity'],
  },
  titans: {
    base: 'brawl', name: 'Hall of Titans', one: 'hall', many: 'halls', emoji: '⚡', color: '#FFB020', enter: 'Climb the titan steps', game: 'Elemental Clash',
    body: 'A mountaintop hall where titans duel', tagline: 'Your arena rises to the gods.',
    long: 'The titan steps, a card forge, the thunder arena, a myth gallery, the sky bridge and the Olympus Throne. Out-think titans in Elemental Clash, foil god cards and raise a storm spire.',
    crew: 'Forges & councils', make: 'Myth forge', market: 'Olympus exchange', book: 'Pantheon cards', bookItem: 'titan card',
    perks: ['Elemental Clash: read the titan, answer right', 'Six terraces up to the Olympus Throne', 'Foil foundries, prism lenses and a storm spire', 'A grander economy: Glory and bottled thunder'],
  },
};
export const DOMAIN_KINDS = Object.keys(DOMAINS) as DomainKind[];
export const isDomain = (k: string | null | undefined): k is DomainKind => !!k && k in DOMAINS;
/** the Domain a base type upgrades to */
export const domainOf = (base: string | null | undefined): DomainKind | null => DOMAIN_KINDS.find((d) => DOMAINS[d].base === base) ?? null;
