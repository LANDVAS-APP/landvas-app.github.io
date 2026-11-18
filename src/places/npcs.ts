// Characters who aren't players (gallery visitors, customers, crew, spectators…), drawn in exactly the same flat
// explorer style as everyone's explorer, so nobody looks out of place next to you. A seed always gives the same person.
import type { ExplorerStyle } from '../backend/types';
import { HAIR_COLOR, SKIN, explorerSvg } from '../explorer/character';
import { svgUrl } from './usePlaceLive';

const HAIRS = ['short', 'long', 'ponytail', 'bob', 'bun', 'curly', 'braid', 'buzz', 'quiff', 'sidepart', 'pixie', 'waves', 'spacebuns'];
const FACES = ['none', 'none', 'none', 'glasses', 'freckles', 'beautymark', 'stubble', 'mustache', 'beard'];
const ACCENTS = ['#FF4D6D', '#FF9F1C', '#FFE14D', '#3DDC97', '#34C3FF', '#9B5CFF', '#FF7AB8', '#1FB5A8', '#E85D75', '#5FB49C'];

export type NpcRole = 'visitor' | 'artist' | 'critic' | 'crowd';
const ROLE: Record<NpcRole, { hats: string[]; holds: string[]; outfits: string[] }> = {
  // a gallery's visitors: mostly plain clothes, a sketching pencil or the show's programme (tickets); there's no
  // "empty hands" for an explorer (it draws a brush), so everyone holds something
  visitor: { hats: ['none', 'none', 'none', 'cap', 'beret', 'headphones'], holds: ['pencil', 'tickets', 'tickets', 'palette', 'plush'], outfits: ['accent', 'accent', 'midnight', 'camo'] },
  artist: { hats: ['beret', 'beret', 'none', 'cap'], holds: ['palette', 'brush', 'pencil', 'roller', 'spray'], outfits: ['accent', 'rainbow', 'synth'] },
  critic: { hats: ['tophat', 'none', 'beret'], holds: ['pencil', 'tickets'], outfits: ['midnight', 'gold', 'accent'] },
  crowd: { hats: ['none', 'cap', 'visor', 'headphones', 'propeller'], holds: ['plush', 'tickets', 'joystick'], outfits: ['accent', 'camo', 'pixel', 'galaxy'] },
};

const pick = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length) % a.length];
const rng = (seed: number) => { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

/** a person for `role`, the same one for the same seed */
export function npcStyle(seed: number, role: NpcRole = 'visitor'): { style: ExplorerStyle; accent: string } {
  const r = rng(seed * 2654435761), R = ROLE[role];
  const style: ExplorerStyle = {
    hat: pick(R.hats, r), hold: pick(R.holds, r), outfit: pick(R.outfits, r), trail: 'none', aura: 'none',
    hair: pick(HAIRS, r), hairc: pick(Object.keys(HAIR_COLOR), r), skin: pick(Object.keys(SKIN), r), body: 'classic', sex: '', face: pick(FACES, r),
  };
  return { style, accent: pick(ACCENTS, r) };
}

const cache = new Map<string, string>();
/** the sprite image for that person (cached: a crowd of them costs one drawing each) */
export function npcUrl(seed: number, role: NpcRole = 'visitor') {
  const k = `${role}:${seed}`; let u = cache.get(k);
  if (!u) { const { style, accent } = npcStyle(seed, role); u = svgUrl(explorerSvg(style, accent, 184)); cache.set(k, u); }
  return u;
}
