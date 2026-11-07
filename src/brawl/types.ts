// What the server sends the app about Paintbrawl.
import type { View } from '../shared/brawl/engine';
import type { Rarity } from '../shared/brawl/cards';

export type Rank = { name: string; min: number; emoji: string };
export type Deck = { name: string; cards: string[]; terrains: string[] } | null;
export type BrawlCfg = {
  pack_cost: number; pack_size: number; foil_chance: number; deck_size: number; turn_seconds: number;
  dust: Record<Rarity, number>; craft: Record<Rarity, number>; max_copies: Record<Rarity, number>;
  reward: Record<string, number | boolean>; ranks: [string, number, string][]; terrains: string[]; cards: Record<string, Rarity>;
};
export type BrawlMe = {
  cards: Record<string, number>; foils: Record<string, number>; dust: number; decks: Deck[]; deck_slot: number;
  trophies: number; best: number; rank: Rank; wins: number; losses: number; draws: number; streak: number; bot_wins: number; packs: number;
  wins_today: number; bot_wins_today: number; first_win_ready: boolean; free_pack_ready: boolean; shards: number;
  live: string | null; queued: boolean; queued_since: string | null; cfg: BrawlCfg; server_time: string;
};
export type PackCard = { id: string; rarity: Rarity; foil: boolean; new: boolean };
export type Profile = { id: string | null; username: string; display_name?: string | null; accent_color?: string | null; avatar_seed?: string; avatar_style?: string; avatar_path?: string | null; trophies: number; rank: Rank; bot?: boolean };
export type Rewards = { result: 'win' | 'loss' | 'draw'; shards: number; trophies: number; ink: number; pack: boolean; level_up: number | null; total: number };
export type MatchView = {
  id: string; side: 0 | 1; view: View; v: number; status: 'live' | 'over'; winner: number | null; reason: string | null; deadline: string | null; server_time: string;
  bot: boolean; rewards: Rewards | null; players: [Profile, Profile];
};
export type Leaderboard = { top: (Profile & { wins: number; losses: number })[]; me: Profile; place: number };
export type HistoryRow = { id: string; at: string; bot: boolean; status: string; reason: string | null; won: boolean; draw: boolean; opponent: Profile; trophies: number | null };
