// The worlds you can fly to: the Moon and the planets of our solar system (stylised, in their real
// order), plus generated far-off worlds — every seed is its own planet with a name, colours,
// gravity and landscape. Shared by the solar-system map and the surfaces.
import { rng } from '../inkborn/world';

export type WorldId = 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';
export type Feature = 'craters' | 'dunes' | 'rocks' | 'crystals' | 'ice' | 'clouds' | 'volcano' | 'mesas';
export type World = {
  id: string; name: string; kind: 'moon' | 'planet' | 'dwarf' | 'exo';
  /** planet look on the system map */ color: string; color2: string; r: number; ring?: string;
  /** distance from the Sun on the system map (Earth = 1) and orbit speed (Earth = 1) */ orbit: number; speed: number;
  /** surface: sky, ground, details */ sky: [string, string]; ground: [string, string]; detail: string; features: Feature[];
  gravity: number; // Earth = 1 (how floaty jumps are)
  fact: string;
  gas?: boolean; // gas giants: you stand on a floating cloud station
  dark?: boolean; // a black, starry sky
};

export const WORLDS: Record<WorldId, World> = {
  moon: { id: 'moon', dark: true, name: 'The Moon', kind: 'moon', color: '#C9CCD6', color2: '#8E93A3', r: 5, orbit: 1, speed: 1, sky: ['#05060F', '#151A33'], ground: ['#B8BCC8', '#7D8292'], detail: '#9BA0AF', features: ['craters', 'rocks'], gravity: 0.17,
    fact: 'Earth’s Moon. Twelve people have walked here — now you’re one of the explorers too.' },
  mercury: { id: 'mercury', dark: true, name: 'Mercury', kind: 'planet', color: '#B3A497', color2: '#7A6B60', r: 6, orbit: 0.42, speed: 4.1, sky: ['#0A0604', '#3A2416'], ground: ['#A8968A', '#6E5E53'], detail: '#C9B8AB', features: ['craters', 'rocks'], gravity: 0.38,
    fact: 'The closest planet to the Sun. A day here lasts longer than its year.' },
  venus: { id: 'venus', name: 'Venus', kind: 'planet', color: '#F2C879', color2: '#C9913F', r: 9, orbit: 0.7, speed: 1.6, sky: ['#E9A64A', '#F7D79A'], ground: ['#C98A3E', '#8E5A24'], detail: '#F2C879', features: ['volcano', 'rocks', 'clouds'], gravity: 0.9,
    fact: 'Wrapped in thick golden clouds — the hottest planet of all.' },
  mars: { id: 'mars', name: 'Mars', kind: 'planet', color: '#E06A3E', color2: '#9C3A1F', r: 7, orbit: 1.5, speed: 0.53, sky: ['#E8A779', '#F5D3B5'], ground: ['#C8562E', '#8A3418'], detail: '#E9875C', features: ['dunes', 'mesas', 'rocks'], gravity: 0.38,
    fact: 'The red planet, home of Olympus Mons — the tallest volcano we know of.' },
  jupiter: { id: 'jupiter', name: 'Jupiter', kind: 'planet', color: '#E3B98A', color2: '#B07A4E', r: 20, orbit: 2.6, speed: 0.084, sky: ['#C98E5C', '#F3D8B4'], ground: ['#E8C9A3', '#B88A5E'], detail: '#D2774B', features: ['clouds'], gravity: 2.4, gas: true,
    fact: 'The giant. Its Great Red Spot is a storm wider than the Earth.' },
  saturn: { id: 'saturn', name: 'Saturn', kind: 'planet', color: '#EDD9A3', color2: '#C2A666', r: 17, orbit: 3.4, speed: 0.034, ring: '#D9C58F', sky: ['#B9A372', '#F0E4C0'], ground: ['#E9D9A8', '#BFA96C'], detail: '#F6EBC8', features: ['clouds'], gravity: 1.07, gas: true,
    fact: 'Its rings are made of ice and rock — some pieces as small as dust, some as big as houses.' },
  uranus: { id: 'uranus', name: 'Uranus', kind: 'planet', color: '#9FE3E8', color2: '#5FB7C2', r: 13, orbit: 4.2, speed: 0.012, ring: '#BFEFF2', sky: ['#6FC3CC', '#D5F6F8'], ground: ['#A9E8EC', '#6CB9C3'], detail: '#E6FBFC', features: ['clouds', 'ice'], gravity: 0.89, gas: true,
    fact: 'It spins on its side, rolling around the Sun like a ball.' },
  neptune: { id: 'neptune', name: 'Neptune', kind: 'planet', color: '#4E7BEA', color2: '#2A49A8', r: 13, orbit: 4.9, speed: 0.006, sky: ['#2340A0', '#7EA2F2'], ground: ['#5E86EE', '#2D4DB0'], detail: '#A8C2FA', features: ['clouds', 'ice'], gravity: 1.14, gas: true,
    fact: 'The windiest planet: storms here race at over 2,000 km/h.' },
  pluto: { id: 'pluto', dark: true, name: 'Pluto', kind: 'dwarf', color: '#E3CDB5', color2: '#A8896B', r: 4, orbit: 5.6, speed: 0.004, sky: ['#04050C', '#1A1C33'], ground: ['#EADBC8', '#B39A80'], detail: '#FFFFFF', features: ['ice', 'rocks'], gravity: 0.06,
    fact: 'A small icy world with a giant heart-shaped plain of frozen nitrogen.' },
};
export const WORLD_ORDER: WorldId[] = ['moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

// ---- far-off worlds -------------------------------------------------------------------------
const SYL1 = ['Ka', 'Ve', 'Zo', 'Lu', 'Ny', 'Ori', 'Tes', 'Mi', 'Ara', 'Qui', 'Sel', 'Dra', 'Pho', 'Xe', 'Ul', 'Ri', 'Bel', 'Ix'];
const SYL2 = ['ra', 'lon', 'ndi', 'thys', 'mar', 'vex', 'lia', 'cor', 'nox', 'ria', 'ka', 'zen', 'tra', 'mos', 'pel', 'dor'];
const STAR = ['Kepler', 'Gliese', 'Trappist', 'Ross', 'Wolf', 'Lacaille', 'Teegarden', 'Proxima', 'Inkara', 'Vela'];
const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(l)}%)`;
const FEATS: Feature[] = ['craters', 'dunes', 'rocks', 'crystals', 'ice', 'volcano', 'mesas'];

/** A far-off world from its seed — the same seed is always the same planet. */
export function exoWorld(seed: number, name?: string | null): World {
  const r = rng(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const auto = `${pick(SYL1)}${pick(SYL2)}`;
  const star = `${pick(STAR)}-${Math.floor(r() * 900) + 100}${'bcdef'[Math.floor(r() * 5)]}`;
  const hue = r() * 360, hue2 = hue + 30 + r() * 120;
  const night = r() < 0.4;
  const features = [pick(FEATS), pick(FEATS), r() < 0.5 ? 'crystals' as Feature : pick(FEATS)].filter((f, i, a) => a.indexOf(f) === i);
  const gravity = Math.round((0.2 + r() * 1.4) * 100) / 100;
  return {
    id: `exo:${seed}`, name: name || `${auto} (${star})`, kind: 'exo',
    color: hsl(hue, 55 + r() * 30, 50 + r() * 15), color2: hsl(hue, 50, 30), r: 6 + r() * 10, ring: r() < 0.25 ? hsl(hue2, 50, 75) : undefined,
    orbit: 0, speed: 0,
    sky: night ? [hsl(hue2, 50, 6), hsl(hue2, 50, 18)] : [hsl(hue2, 55, 45), hsl(hue2, 60, 80)],
    ground: [hsl(hue, 45 + r() * 30, 45 + r() * 15), hsl(hue, 45, 25 + r() * 10)], detail: hsl(hue2, 70, 70),
    features, gravity, dark: night,
    fact: `A world no one else has charted. Gravity ${gravity}× Earth’s${night ? ', under a dark sky' : ''}.`,
  };
}

/** Any world by its id ('moon', 'mars', 'exo:12345'…). */
export function worldOf(id: string | null | undefined, homeSeed?: number | null, homeName?: string | null): World | null {
  if (!id || id === 'earth') return null;
  if (id.startsWith('exo:')) { const seed = Number(id.slice(4)); return exoWorld(seed, seed === homeSeed ? homeName : null); }
  return (WORLDS as Record<string, World>)[id] ?? null;
}
/** The config key for a world (all far-off worlds share 'exo'). */
export const worldKey = (id: string) => (id.startsWith('exo:') || id === 'home' ? 'exo' : id);
