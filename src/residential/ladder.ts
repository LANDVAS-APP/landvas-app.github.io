// The house sizes: the biggest square of Home plots you own (1x1 … 10x10) sets your house's size, and each size up
// unlocks something. A copy of the server's `residential` config, for showing progress without a round trip.
import type { HouseSize } from '../backend/types';
import { squareProgress } from '../realms/estates/meta';

export const HOUSE_LADDER: HouseSize[] = [
  { size: 1, name: 'Cottage', floors: 1, balcony: false, roof: false, elevator: false, pool: false, unlock: 'A cosy one-room home' },
  { size: 2, name: 'Two-Storey House', floors: 2, balcony: false, roof: false, elevator: false, pool: false, unlock: 'An upstairs floor and a staircase' },
  { size: 3, name: 'Townhouse', floors: 3, balcony: false, roof: false, elevator: false, pool: false, unlock: 'A third floor' },
  { size: 4, name: 'Balcony House', floors: 3, balcony: true, roof: false, elevator: false, pool: false, unlock: 'Balconies on the upper floors' },
  { size: 5, name: 'Manor', floors: 4, balcony: true, roof: false, elevator: false, pool: false, unlock: 'A fourth floor' },
  { size: 6, name: 'Terrace Manor', floors: 4, balcony: true, roof: true, elevator: false, pool: false, unlock: 'An open-air roof terrace' },
  { size: 7, name: 'Mansion', floors: 5, balcony: true, roof: true, elevator: false, pool: false, unlock: 'A fifth floor' },
  { size: 8, name: 'Grand Mansion', floors: 5, balcony: true, roof: true, elevator: true, pool: false, unlock: 'A lift to every floor' },
  { size: 9, name: 'Sky Tower', floors: 6, balcony: true, roof: true, elevator: true, pool: false, unlock: 'A sixth floor' },
  { size: 10, name: 'Penthouse Tower', floors: 6, balcony: true, roof: true, elevator: true, pool: true, unlock: 'A rooftop pool' },
];
export const LANDLORD_MULT = 50;

/** the house a group of Home plots makes: its biggest full square */
export function houseSizeOf(cells: [number, number, ...unknown[]][]) {
  let n = Math.min(10, Math.floor(Math.sqrt(Math.max(1, cells.length))));
  while (n > 1 && squareProgress(cells, n).have < n * n) n--;
  return Math.max(1, n);
}
/** a level's name: the ground floor, upstairs floors, the roof */
export const levelName = (f: number, floors: number) => (f >= floors ? 'Roof terrace' : f === 0 ? 'Ground floor' : f === 1 ? 'First floor' : f === 2 ? 'Second floor' : f === 3 ? 'Third floor' : f === 4 ? 'Fourth floor' : 'Fifth floor');
/** the next rent day (the 1st of a month, UTC) and whether it's today */
export function rentDay(now = Date.now()) {
  const d = new Date(now);
  const today = d.getUTCDate() === 1;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), end = start + 86400_000;
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { today, start, end, next };
}
