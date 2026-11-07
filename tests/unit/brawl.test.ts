// Paintbrawl: the card set is legal, the engine is deterministic and fair, bots can play whole matches to the end,
// and a player's view never shows the other player's hand or deck.
import { describe, it, expect } from 'vitest';
import { CARDS, CARD, STARTERS, checkDeck, DECK_SIZE } from '../../src/shared/brawl/cards';
import { apply, check, newMatch, viewFor, attackOf, type State } from '../../src/shared/brawl/engine';
import { botTurn } from '../../src/shared/brawl/ai';
import { mulberry32 } from '../../src/shared/minigames/rng';

const seat = (i: number) => ({ name: `p${i}`, deck: STARTERS[i % 2].cards, terrains: STARTERS[i % 2].terrains });
function playOut(seed: number, skillA = 1, skillB = 1) {
  const s = newMatch(seed, seat(0), seat(1));
  const r = mulberry32(seed * 7 + 1);
  for (let i = 0; i < 400 && !s.over; i++) botTurn(s, s.turn, s.turn === 0 ? skillA : skillB, () => r.next());
  return s;
}

describe('Paintbrawl cards', () => {
  it('every card is well formed and the starter decks are legal', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) {
      if (c.kind === 'creature') { expect(c.atk).toBeGreaterThanOrEqual(0); expect(c.hp).toBeGreaterThan(0); expect(c.art.split(' ').length).toBe(14); }
      expect(c.cost).toBeGreaterThanOrEqual(0);
    }
    for (const d of STARTERS) { expect(d.cards.length).toBe(DECK_SIZE); expect(checkDeck(d.cards, d.terrains)).toBeNull(); }
    expect(checkDeck(['oakheart', 'oakheart', ...STARTERS[0].cards.slice(2)], STARTERS[0].terrains)).toMatch(/Only 1/);
  });
});

describe('Paintbrawl engine', () => {
  it('sets up a fair start: 4/5 cards, paint 2, an arena event', () => {
    const s = newMatch(42, seat(0), seat(1));
    expect(s.p[s.first].hand.length).toBe(4);
    expect(s.p[1 - s.first].hand.length).toBe(5);
    expect(s.p[s.first].paint).toBe(s.ev === 'rain' ? 3 : 2);
    expect(s.turn).toBe(s.first);
  });
  it('is deterministic: the same seed and moves give the same match', () => {
    expect(JSON.stringify(playOut(7))).toBe(JSON.stringify(playOut(7)));
  });
  it('bots play hundreds of matches to a finish, with every event and many different outcomes', () => {
    const ends = new Set<string>(), events = new Set<string>(); let wins = [0, 0, 0];
    for (let seed = 1; seed <= 150; seed++) {
      const s = playOut(seed, seed % 3 === 0 ? 0.6 : 1, 1);
      expect(s.over).toBe(true);
      events.add(s.ev);
      ends.add(`${s.winner}:${s.p[0].hero}:${s.p[1].hero}:${s.round}`);
      wins[s.winner === -1 ? 2 : (s.winner as number)]++;
      // nothing impossible on the board
      for (const P of s.p) for (const L of P.lanes) if (L.unit) { expect(L.unit.hp).toBeGreaterThan(0); expect(CARD[L.unit.id].kind).toBe('creature'); }
    }
    expect(events.size).toBeGreaterThanOrEqual(8);
    expect(ends.size).toBeGreaterThan(120);
    expect(Math.min(wins[0], wins[1])).toBeGreaterThan(30); // neither starter deck dominates
  });
  it('refuses moves out of turn or without paint, and logs what happened', () => {
    const s = newMatch(3, seat(0), seat(1));
    const me = s.turn, them = (1 - me) as 0 | 1;
    expect(check(s, them, { t: 'end' })).toBe('not_your_turn');
    const pricey = s.p[me].hand.find((h) => CARD[h.id].cost > s.p[me].paint);
    if (pricey) expect(check(s, me, { t: 'play', uid: pricey.uid, lane: 0 })).toBe('no_paint');
    const cheap = s.p[me].hand.find((h) => CARD[h.id].kind === 'creature' && CARD[h.id].cost <= s.p[me].paint)!;
    const ev = apply(s, me, { t: 'play', uid: cheap.uid, lane: 1 });
    expect(ev.some((e) => e.e === 'play')).toBe(true);
    expect(s.p[me].lanes[1].unit?.id).toBe(cheap.id);
    expect(attackOf(s, me, 1)).toBeGreaterThanOrEqual(CARD[cheap.id].atk!);
    apply(s, me, { t: 'end' });
    expect(s.turn).toBe(them);
    expect(s.log.at(-1)!.ev.some((e) => e.e === 'attack')).toBe(true);
  });
  it('a view hides the opponent’s hand and both decks (and their draws)', () => {
    const s = playOut(11);
    const live: State = newMatch(11, seat(0), seat(1));
    apply(live, live.turn, { t: 'end' });
    const v = viewFor(live, 0);
    expect(typeof v.p[0].deck).toBe('number');
    expect(v.p[1].hand.every((h) => h.id === undefined)).toBe(true);
    expect(v.p[0].hand.every((h) => typeof h.id === 'string')).toBe(true);
    expect((v as unknown as { rng?: number }).rng).toBeUndefined();
    const theirDraws = v.log.flatMap((l) => l.ev).filter((e) => e.e === 'draw' && e.side === 1);
    expect(theirDraws.length).toBeGreaterThan(0);
    expect(theirDraws.every((e) => (e as { card?: string }).card === undefined)).toBe(true);
    expect(s.over).toBe(true);
  });
  it('the card effects do what they say', () => {
    const s = newMatch(5, seat(0), seat(1), 'none');
    const me = s.turn, o = (1 - me) as 0 | 1;
    s.p[me].paint = 20;
    const give = (id: string) => { const uid = s.uid++; s.p[me].hand.push({ uid, id }); return uid; };
    // Fireburst 4 on a 3-health creature; shields block once; tough takes 1 less
    s.p[o].lanes[0].unit = { uid: 900, id: 'blazefox', atk: 4, hp: 3, max: 3, shield: false, frozen: 0, poison: 0, temp: 0, acted: false };
    apply(s, me, { t: 'play', uid: give('fireburst'), target: { side: o, lane: 0 } });
    expect(s.p[o].lanes[0].unit).toBeNull();
    expect(s.p[o].grave).toContain('blazefox');
    s.p[o].lanes[1].unit = { uid: 901, id: 'candiedknight', atk: 4, hp: 4, max: 4, shield: true, frozen: 0, poison: 0, temp: 0, acted: false };
    apply(s, me, { t: 'play', uid: give('fireburst'), target: { side: o, lane: 1 } });
    expect(s.p[o].lanes[1].unit?.hp).toBe(4);
    expect(s.p[o].lanes[1].unit?.shield).toBe(false);
    s.p[o].lanes[2].unit = { uid: 902, id: 'frostmaw', atk: 4, hp: 6, max: 6, shield: false, frozen: 0, poison: 0, temp: 0, acted: false };
    apply(s, me, { t: 'play', uid: give('fireburst'), target: { side: o, lane: 2 } });
    expect(s.p[o].lanes[2].unit?.hp).toBe(3);
    // Volcano Titan burns every enemy creature; Taffy Twister bounces the one opposite
    apply(s, me, { t: 'play', uid: give('volcanotitan'), lane: 3 });
    expect(s.p[o].lanes[1].unit?.hp).toBe(2);
    const handBefore = s.p[o].hand.length;
    apply(s, me, { t: 'play', uid: give('taffytwister'), lane: 2 });
    expect(s.p[o].lanes[2].unit).toBeNull();
    expect(s.p[o].hand.length).toBe(handBefore + 1);
    // a Flourished creature doesn't attack; a frozen one thaws instead of attacking
    s.p[me].lanes[0].unit = { uid: 903, id: 'cinderpup', atk: 2, hp: 1, max: 1, shield: false, frozen: 0, poison: 0, temp: 0, acted: false };
    const hero = s.p[o].hero;
    apply(s, me, { t: 'flourish', lane: 0 });
    expect(s.p[o].hero).toBe(hero - 1);
    expect(check(s, me, { t: 'flourish', lane: 0 })).toBe('already_acted');
  });
});

describe('Paintbrawl bot decks', () => {
  it('every bot deck is a legal 20-card deck with both terrains’ legendaries', async () => {
    const { BOT_DECKS } = await import('../../src/shared/brawl/server');
    for (const d of BOT_DECKS) {
      expect(checkDeck(d.cards, d.terrains)).toBeNull();
      const legends = d.cards.filter((id) => CARD[id].rarity === 'legendary');
      expect(legends.length).toBe(2);
    }
  });
});
