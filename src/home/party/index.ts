// Every house party game, and the order the picker shows them in.
import { checkers, doodle, dots, fourrow, ladders, rush } from './games';
import { bluff, chain, samebrain, spy } from './games2';
import type { PartyDef } from './kit';
import { SIMS3 } from '../live3d/sims';

export const PARTY: Record<string, PartyDef> = { fourrow, checkers, dots, ladders, doodle, rush, chain, spy, samebrain, bluff };
export const PARTY_ORDER = ['tag', 'hide', 'lava', 'chairs', 'chain', 'doodle', 'spy', 'bluff', 'samebrain', 'rush', 'ladders', 'dots', 'fourrow', 'checkers'];
export type GameMeta = { id: string; name: string; emoji: string; color: string; min: number; max: number; kind: 'board' | 'party' | '3d'; blurb: string; how: string; place?: string };
/** everything the picker, invites and tables need to know about any house game */
export const GAME_META: Record<string, GameMeta> = {
  ...Object.fromEntries(Object.values(PARTY).map((d) => [d.id, { id: d.id, name: d.name, emoji: d.emoji, color: d.color, min: d.min, max: d.max, kind: d.kind, blurb: d.blurb, how: d.how }])),
  ...Object.fromEntries(Object.values(SIMS3).map((d) => [d.id, { id: d.id, name: d.name, emoji: d.emoji, color: d.color, min: d.min, max: d.max, kind: '3d' as const, blurb: d.blurb, how: d.how, place: d.place }])),
};
