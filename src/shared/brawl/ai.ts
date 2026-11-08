// The practice bot: tries every card it could play (in every lane, at every target) and every Flourish, imagines the
// board after its turn ends (attacks and all), and keeps the move that leaves it best off — then goes again until
// nothing helps, and ends its turn. Easier bots sometimes pick a worse move on purpose.
import { CARD, LANES } from './cards';
import { apply, attackOf, check, clone, otherSide, type Action, type Pick, type Side, type State } from './engine';

function score(s: State, me: Side): number {
  if (s.over) return s.winner === me ? 1e6 : s.winner === -1 ? 0 : -1e6;
  const o = otherSide(me);
  let v = (s.p[me].hero - s.p[o].hero) * 3;
  for (const side of [me, o]) {
    const sign = side === me ? 1 : -1;
    s.p[side].lanes.forEach((L, lane) => {
      const u = L.unit;
      if (u) v += sign * (attackOf(s, side, lane) * 1.6 + u.hp * 1.1 + (u.shield ? 2 : 0) - (u.frozen ? 1.5 : 0) - u.poison * 0.6);
      if (L.totem) v += sign * (CARD[L.totem.id]?.wonder ? 3 : 1.5);
    });
    v += sign * s.p[side].hand.length * 0.6;
  }
  // a hero in danger matters a lot
  if (s.p[me].hero <= 6) v -= (7 - s.p[me].hero) * 4;
  if (s.p[o].hero <= 6) v += (7 - s.p[o].hero) * 4;
  return v;
}
/** How good is the board if I stop here (my creatures attack, then it's their turn)? */
function after(s: State, me: Side) {
  const t = clone(s);
  try { apply(t, me, { t: 'end' }); } catch { /* already over */ }
  return score(t, me);
}
function targets(s: State, me: Side): Pick[] {
  const out: Pick[] = [];
  for (const side of [0, 1] as Side[]) for (let lane = 0; lane < LANES; lane++) out.push({ side, lane });
  return out;
}
export function candidates(s: State, me: Side): Action[] {
  const P = s.p[me], out: Action[] = [];
  // a choice to make (which card to steal) comes before anything else
  if (P.choice) return P.choice.cards.map((_, i) => ({ t: 'choose' as const, i }));
  for (const h of P.hand) {
    const c = CARD[h.id]; if (!c || c.cost > P.paint) continue;
    if (c.kind === 'creature' || c.kind === 'totem') for (let lane = 0; lane < LANES; lane++) out.push({ t: 'play', uid: h.uid, lane });
    else if (!c.target || c.target === 'none') out.push({ t: 'play', uid: h.uid });
    else for (const t of targets(s, me)) out.push({ t: 'play', uid: h.uid, target: t });
  }
  P.lanes.forEach((L, lane) => {
    const f = L.unit && CARD[L.unit.id].flourish; if (!f) return;
    if (!f.target && L.unit!.id !== 'jellyfright') out.push({ t: 'flourish', lane });
    else for (const t of targets(s, me)) out.push({ t: 'flourish', lane, target: t });
  });
  // a spare paint can buy a card (only worth it with nothing better to do — the scoring decides)
  out.push({ t: 'sketch' });
  return out.filter((a) => !check(s, me, a));
}
/** The bot's next move. `skill` 0..1 (1 = always its best idea). */
export function botMove(s: State, me: Side, skill = 1, rnd: () => number = Math.random): Action {
  if (s.turn !== me || s.over) return { t: 'end' };
  const base = after(s, me);
  const scored = candidates(s, me).map((a) => { const t = clone(s); try { apply(t, me, a); return { a, v: after(t, me) }; } catch { return { a, v: -Infinity }; } })
    .filter((x) => x.v > -Infinity).sort((x, y) => y.v - x.v);
  if (s.p[me].choice) return scored[0]?.a ?? { t: 'choose', i: 0 };
  if (!scored.length || scored[0].v <= base + 0.05) return { t: 'end' };
  // a less skilled bot sometimes takes its second or third idea, or just ends its turn
  if (skill < 1 && rnd() > skill) { if (rnd() < 0.3) return { t: 'end' }; const pick = scored[Math.min(scored.length - 1, 1 + Math.floor(rnd() * 2))]; return pick.v > base - 2 ? pick.a : scored[0].a; }
  return scored[0].a;
}
/** Play the bot's whole turn (at most 12 moves); returns the actions taken. */
export function botTurn(s: State, me: Side, skill = 1, rnd: () => number = Math.random): Action[] {
  const done: Action[] = [];
  // the land cards: home terrains where its creatures are, in the order the deck lists them
  if (s.phase === 'lands') { if (!s.p[me].ready) { const a: Action = { t: 'lands', lanes: [...(s.p[me].landCards ?? s.p[me].lanes.map((L) => L.terrain))] }; apply(s, me, a); done.push(a); } return done; }
  for (let i = 0; i < 12 && s.turn === me && !s.over; i++) {
    const a = botMove(s, me, skill, rnd);
    apply(s, me, a); done.push(a);
    if (a.t === 'end') return done;
  }
  if (s.turn === me && !s.over) { apply(s, me, { t: 'end' }); done.push({ t: 'end' }); }
  return done;
}
