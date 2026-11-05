// House party games: the shape every game takes. The host's device holds the game state and is the only one that
// changes it (moves from everyone go to the host, which checks them); everyone draws the state they're sent.
import type { FC } from 'react';
import type { Profile } from '../../backend/types';

export type Seat = { id: string; slot: number; name: string; color: string; p: Profile };
export type Places = Record<string, number>;
export type ViewProps<S, M> = { s: S; me: string; seats: Seat[]; send(m: M): void; now: number; host: boolean };
export type PartyDef<S = any, M = any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  id: string; name: string; emoji: string; color: string; min: number; max: number; kind: 'board' | 'party'; blurb: string; how: string;
  init(seats: Seat[], seed: number): S;
  /** apply a move if it's legal (mutates s); true if anything changed */ move(s: S, by: string, m: M, now: number): boolean;
  /** time passing (host only): true if anything changed */ tick?(s: S, now: number): boolean;
  /** places once it's over (1 = won; ties share a place) */ result(s: S): Places | null;
  /** whose turn it is, if it's that sort of game */ turn?(s: S): string | null;
  /** points so far, for the scoreboard */ score?(s: S): Record<string, number>;
  /** what to send: a copy small enough for the live channel */ view?(s: S): unknown;
  View: FC<ViewProps<S, M>>;
};

export const SEAT_COLORS = ['#FF3D6E', '#22B8CF', '#FFB13D', '#3DDC97', '#8B5CFF', '#FF5FA2', '#4C6EF5', '#B6E33D'];
export function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** places from points: most points = 1st; equal points share a place */
export function placesBy(points: Record<string, number>, higherWins = true): Places {
  const ids = Object.keys(points).sort((a, b) => (higherWins ? points[b] - points[a] : points[a] - points[b]));
  const out: Places = {}; let place = 0, prev: number | null = null;
  ids.forEach((id, i) => { if (points[id] !== prev) { place = i + 1; prev = points[id]; } out[id] = place; });
  return out;
}

export const seatOf = (seats: Seat[], id: string) => seats.find((x) => x.id === id);
export const secs = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
/** secrets in the shared state are only lightly hidden (it's a party game, not a bank) */
export const enc = (w: string) => btoa(unescape(encodeURIComponent(w.split('').reverse().join(''))));
export const dec = (z: string) => { try { return decodeURIComponent(escape(atob(z))).split('').reverse().join(''); } catch { return ''; } };
export const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
