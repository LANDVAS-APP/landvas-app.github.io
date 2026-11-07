// 🎨 Paintbrawl on the server: matchmaking, practice bots and every move, run with the rules engine. Used by the `brawl`
// Edge Function (and by the local backend, so tests and offline play behave exactly the same). `svc` calls the
// service-only database functions.
import { CARDS, checkDeck, type Terrain } from './cards';
import { apply, newMatch, viewFor, type Action, type State } from './engine';
import { botTurn } from './ai';

export type Svc = <T = any>(fn: string, args: Record<string, unknown>) => Promise<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type BrawlBody = { op: 'queue' | 'bot' | 'lab' | 'act' | 'tick' | 'concede'; match?: string; action?: Action };
export class BrawlError extends Error {}
const TURN_SECONDS = 75;

/** The bots' decks: one built round each terrain pair, from the whole card set. */
const pair = (a: Terrain, b: Terrain) => {
  const pool = CARDS.filter((c) => c.terrain === a || c.terrain === b || (c.terrain === 'neutral' && c.rarity !== 'epic'));
  // one of everything from both terrains, then second copies of the cheap commons until there are 20
  const cards = pool.filter((c) => c.terrain !== 'neutral').map((c) => c.id);
  for (const c of [...pool].sort((x, y) => x.cost - y.cost)) if (cards.length < 20 && c.rarity === 'common' && c.cost <= 2) cards.push(c.id);
  for (const c of pool) if (cards.length < 20 && c.terrain === 'neutral' && !cards.includes(c.id)) cards.push(c.id);
  while (cards.length < 20) cards.push('pebblegolem');
  return { cards: cards.slice(0, 20), terrains: [a, b, a, b] };
};
export const BOT_DECKS = [pair('meadow', 'ember'), pair('frost', 'sugar'), pair('bog', 'neon'), pair('ember', 'neon'), pair('frost', 'bog'), pair('meadow', 'sugar')];
const BOT_NAMES = ['Pip', 'Smudge', 'Doodle', 'Inky', 'Splotch', 'Sketch', 'Brushy', 'Daub'];

const seed = () => (Math.random() * 2 ** 31) >>> 0;
const views = (s: State) => ({ p_view_a: viewFor(s, 0), p_view_b: viewFor(s, 1) });
const deadline = () => new Date(Date.now() + TURN_SECONDS * 1000).toISOString();

function validAction(a: unknown): a is Action {
  if (!a || typeof a !== 'object') return false;
  const x = a as Record<string, unknown>;
  const pick = (p: unknown) => p === undefined || (typeof p === 'object' && p !== null && ((p as { side?: unknown }).side === 0 || (p as { side?: unknown }).side === 1) && Number.isInteger((p as { lane?: unknown }).lane));
  if (x.t === 'end' || x.t === 'concede' || x.t === 'sketch') return true;
  if (x.t === 'play') return Number.isInteger(x.uid) && (x.lane === undefined || Number.isInteger(x.lane)) && pick(x.target);
  if (x.t === 'flourish') return Number.isInteger(x.lane) && pick(x.target);
  if (x.t === 'lab') return (x.card === undefined || typeof x.card === 'string') && (x.paint === undefined || typeof x.paint === 'boolean');
  if (x.t === 'lands') return Array.isArray(x.lanes) && x.lanes.length === 4 && x.lanes.every((t) => typeof t === 'string');
  return false;
}

export async function brawlOp(svc: Svc, uid: string, body: BrawlBody) {
  switch (body?.op) {
    case 'queue': {
      const r = await svc<any>('svc_brawl_enqueue', { p_uid: uid });
      if (r.match) return { match: r.match };
      if (!r.pair) return { waiting: true, waited: r.waited ?? 0 };
      // the match opens with both players placing their land cards
      const s = newMatch(seed(), { name: r.a.name, deck: r.a.deck, terrains: r.a.terrains }, { name: r.b.name, deck: r.b.deck, terrains: r.b.terrains }, undefined, { lands: true });
      const id = await svc<string>('svc_brawl_create', { p_a: r.a.id, p_b: r.b.id, p_bot: false, p_bot_name: null, p_bot_skill: null, p_state: s, ...views(s), p_deadline: deadline() });
      return { match: id };
    }
    case 'bot': case 'lab': {
      const r = await svc<any>('svc_brawl_bot', { p_uid: uid });
      if (r.match) return { match: r.match };
      if (body.op === 'lab') {
        // the Card Lab: a gentle bot to test your cards on; any card on demand, paint topped up, no rewards
        const deck = BOT_DECKS[Math.floor(Math.random() * BOT_DECKS.length)], name = 'Test Dummy (Card Lab)';
        const s = newMatch(seed(), { name: r.a.name, deck: r.a.deck, terrains: r.a.terrains }, { name, deck: deck.cards, terrains: deck.terrains }, undefined, { lands: true, lab: true });
        botTurn(s, 1, 0.5);
        const id = await svc<string>('svc_brawl_create', { p_a: uid, p_b: null, p_bot: true, p_bot_name: name, p_bot_skill: 0.5, p_state: s, ...views(s), p_deadline: null });
        return { match: id };
      }
      // the bot gets sharper as you climb (and as you beat it)
      const skill = Math.max(0.5, Math.min(0.97, 0.55 + Number(r.trophies ?? 0) / 2500 + Number(r.bot_wins ?? 0) * 0.008));
      const deck = BOT_DECKS[Math.floor(Math.random() * BOT_DECKS.length)];
      const name = `${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]} (practice bot)`;
      const s = newMatch(seed(), { name: r.a.name, deck: r.a.deck, terrains: r.a.terrains }, { name, deck: deck.cards, terrains: deck.terrains }, undefined, { lands: true });
      botTurn(s, 1, skill); // the bot places its lands straight away
      const id = await svc<string>('svc_brawl_create', { p_a: uid, p_b: null, p_bot: true, p_bot_name: name, p_bot_skill: skill, p_state: s, ...views(s), p_deadline: null });
      return { match: id };
    }
    case 'act': case 'concede': case 'tick': {
      if (typeof body.match !== 'string') throw new BrawlError('bad_request');
      const L = await svc<any>('svc_brawl_load', { p_match: body.match, p_uid: uid });
      if (!L) throw new BrawlError('not_found');
      if (L.status !== 'live') throw new BrawlError('brawl_over');
      const s = L.state as State, side = L.side as 0 | 1, turnBefore = s.turn, phaseBefore = s.phase;
      try {
        if (body.op === 'tick') {
          if (!L.expired || L.bot) return { ok: false };
          apply(s, s.turn, { t: 'timeout' });
        } else if (body.op === 'concede') apply(s, side, { t: 'concede' });
        else {
          if (!validAction(body.action)) throw new BrawlError('bad_action');
          apply(s, side, body.action);
        }
        if (L.bot && s.turn === 1 && !s.over) botTurn(s, 1, Number(L.bot_skill ?? 0.8));
      } catch (e) { if (e instanceof BrawlError) throw e; throw new BrawlError(`brawl_${(e as Error).message}`); }
      const dl = L.bot || s.over ? null : s.turn !== turnBefore || s.phase !== phaseBefore || !L.deadline ? deadline() : L.deadline;
      const saved = await svc<any>('svc_brawl_save', { p_match: body.match, p_v: L.v, p_state: s, ...views(s), p_deadline: dl });
      if (!saved?.ok) throw new BrawlError('brawl_conflict');
      return { ok: true, view: viewFor(s, side), rewards: saved.rewards ? saved.rewards[side === 0 ? 'a' : 'b'] : null };
    }
  }
  throw new BrawlError('bad_request');
}

/** Deck check the app can use before saving (the server checks again). */
export { checkDeck };
