// What the server says about the stars (supabase/migrations/*skywright*).
import type { Balances, NewAchievement } from '../backend/types';
import type { RentState } from '../shared/rent';
import type { StarPlotRow, ArtLayer } from './skin';

export type StarPrice = { earth: number; ink: number; premium: number };
export type StarWarpCost = { ly: number; ink: number; secs: number; gate: boolean };
export type StarPerson = { id: string; username: string; name: string | null; accent: string | null };
export type StarCard = {
  id: number; tier: number; cls: string; m: number; cells: number; ly: number; code: string; catalog_name: string; class_name: string; emoji: string;
  color: string; glow: string; light: string; fuse: number;
  name: string; claimed: number; painted: boolean; painted_at: string | null; art_rev: number;
  discoverer: StarPerson | null; discovered_at: string | null; mine: number; keystones_claimed: number;
  owners: (StarPerson & { plots: number })[]; art: ArtLayer[]; kinds: Record<string, number>;
  price: StarPrice | null; keystone_price: StarPrice | null; warp: StarWarpCost | null; here: boolean; heading: boolean;
  rent_mult: number; discoverer_pct: number;
  /** what the star's own kind does today (flares, eclipses, the pulsar's beat, a black hole's pull…) */
  nature?: StarNature | null;
  /** how many times it's been lit (0–5): brighter in everyone's sky */
  lit?: number;
  binary?: boolean;
};
export type StarWindow = { now: boolean; next_at: string; until: string | null };
export type StarNature = {
  flare?: StarWindow | null;
  eclipse?: StarWindow | null;
  pulse?: { period_ms: number } | null;
  dilation?: { hours_per_plot: number; max_hours: number } | null;
  supernova?: { at: string; glowing: boolean } | null;
};
export type StarWhere = { at_star: number | null; dest_star: number | null; depart_at: string | null; arrive_at: string | null; warps: number; at: { id: number; name: string } | null };
export type StarClaim = {
  star: number; cell: number; rarity: string; shiny: boolean; keystone: boolean; kind: string; cost: { ink: number }; earth_price: number; discovered: boolean; discoverer_cut: number;
  next_price: StarPrice; claimed: number; cells: number; usd_per_second: number; balances: Balances; rent: RentState; achievements: NewAchievement[];
};
export type MyStar = { id: number; name: string; cls: string; cells: number; claimed: number; painted: boolean; color: string | null; discoverer: boolean; mine: number; keystones: number;
  kinds: Record<string, number>; usd_per_second: number; last: string };
export type StarsChart = {
  painted: { id: number; name: string; cls: string; cells: number; color: string | null; painted_at: string; art_rev: number }[];
  fullest: { id: number; name: string; cls: string; cells: number; claimed: number; color: string | null }[];
  newest: { id: number; name: string; cls: string; cells: number; claimed: number; discoverer: string | null; at: string }[];
  totals: { systems: number; plots: number; painted: number };
};
export type { StarPlotRow, ArtLayer };
/** a star plot's own page (its type's state and what it can do) */
export type StarPlotView = {
  star: number; cell: number; kind: string; rarity: string; shiny: boolean; keystone: boolean; name: string | null; level: number; owner: StarPerson | null; mine: boolean;
  usd_per_second: number; claimed_at: string; view: Record<string, any>; nature: StarNature; cls: string; server_now: number;
};
export type Els = Record<'h' | 'he' | 'c' | 'o' | 'si' | 'fe' | 'au', number>;
export type StarActResult = { result: Record<string, any>; view: Record<string, any>; nature: StarNature; els: Els; balances: Balances; achievements: NewAchievement[] };
export type MyStarThings = {
  els: Els;
  sails_in: { id: number; from: string | null; cargo: Record<string, number>; arrive_at: string; arrived: boolean; to_star: number }[];
  codex: Record<string, number>;
  exoplanets: { world: string; name: string; star: number; at: string }[];
  finds: { kind: string; data: Record<string, any>; star: number; at: string }[];
};
