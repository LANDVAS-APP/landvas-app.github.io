// Every house party game, and the order the picker shows them in.
import { checkers, doodle, dots, fourrow, ladders, rush } from './games';
import { bluff, chain, samebrain, spy } from './games2';
import type { PartyDef } from './kit';

export const PARTY: Record<string, PartyDef> = { fourrow, checkers, dots, ladders, doodle, rush, chain, spy, samebrain, bluff };
export const PARTY_ORDER = ['chain', 'doodle', 'spy', 'bluff', 'samebrain', 'rush', 'ladders', 'dots', 'fourrow', 'checkers'];
