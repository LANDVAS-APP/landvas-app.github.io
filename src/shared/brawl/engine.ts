// 🎨 Paintbrawl — the rules. A pure, deterministic engine: the server runs it to decide every move (so nobody can
// cheat), and the app runs the very same code to animate what happened. Randomness comes from a seeded generator
// kept inside the state, so a match replays exactly.
//
// The game: two players, four lanes each, every lane a terrain. Each turn you get paint (2 on the first round, one
// more each round, up to 7) to spend on creatures (they stand in a lane), totems (they sit behind a lane and power it)
// and spells. A creature can Flourish — use its ability — instead of attacking. When you end your turn, every one of
// your creatures that didn't Flourish attacks the creature opposite it; if that lane is empty it hits the enemy hero.
// Creatures fighting on their own terrain get +1 attack. First hero to 0 health loses.
import { CARD, EVENTS, HERO_HP, LANES, TERRAINS, type Card, type EventId, type Target, type Terrain } from './cards';

export type Side = 0 | 1;
export type Unit = { uid: number; id: string; atk: number; hp: number; max: number; shield: boolean; frozen: number; poison: number; temp: number; acted: boolean };
export type Lane = { terrain: Terrain; unit: Unit | null; totem: { uid: number; id: string } | null };
export type HandCard = { uid: number; id: string };
export type PlayerState = { name: string; hero: number; heroMax: number; paint: number; deck: string[]; hand: HandCard[]; grave: string[]; lanes: Lane[]; fatigue: number; timeouts: number };
export type Ev =
  | { e: 'turn'; side: Side; round: number } | { e: 'draw'; side: Side; uid: number; card?: string; burned?: boolean } | { e: 'fatigue'; side: Side; n: number }
  | { e: 'paint'; side: Side; n: number } | { e: 'play'; side: Side; card: string; lane: number; uid: number } | { e: 'totem'; side: Side; card: string; lane: number }
  | { e: 'spell'; side: Side; card: string; target?: { side: Side; lane: number } } | { e: 'flourish'; side: Side; lane: number; card: string; target?: { side: Side; lane: number } }
  | { e: 'attack'; side: Side; lane: number; to: 'unit' | 'hero' } | { e: 'dmg'; side: Side; lane: number; n: number; blocked?: boolean; kind: 'hit' | 'burn' | 'poison' | 'fatigue' | 'spell' | 'event' | 'self' }
  | { e: 'heal'; side: Side; lane: number; n: number } | { e: 'die'; side: Side; lane: number; card: string } | { e: 'freeze'; side: Side; lane: number } | { e: 'thaw'; side: Side; lane: number }
  | { e: 'poison'; side: Side; lane: number; n: number } | { e: 'buff'; side: Side; lane: number; atk: number; hp: number } | { e: 'bounce'; side: Side; lane: number; card: string }
  | { e: 'move'; side: Side; from: number; to: number } | { e: 'terrain'; side: Side; lane: number; terrain: Terrain } | { e: 'coin'; side: Side; heads: boolean }
  | { e: 'copy'; side: Side; uid: number; card?: string } | { e: 'event'; id: EventId; text: string } | { e: 'over'; winner: Side | -1; reason: string };
export type State = {
  v: number; rng: number; round: number; turn: Side; first: Side; ev: EventId; over: boolean; winner: Side | -1 | null; reason: string;
  uid: number; p: [PlayerState, PlayerState]; log: { n: number; side: Side | -1; ev: Ev[] }[];
};
export type Pick = { side: Side; lane: number };
export type Action = { t: 'play'; uid: number; lane?: number; target?: Pick } | { t: 'flourish'; lane: number; target?: Pick } | { t: 'end' } | { t: 'concede' } | { t: 'timeout' };

export const MAX_PAINT = 7;
export const HAND_MAX = 10;
export const ROUND_LIMIT = 30;
const other = (s: Side): Side => (s === 0 ? 1 : 0);

// ---- randomness inside the state ------------------------------------------------------------------------------------
function rand(s: State) {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (s: State, n: number) => Math.floor(rand(s) * n);
function shuffle<T>(s: State, a: T[]) { for (let i = a.length - 1; i > 0; i--) { const j = rint(s, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---- setting up -------------------------------------------------------------------------------------------------------
export type Seat = { name: string; deck: string[]; terrains: string[] };
export function newMatch(seed: number, a: Seat, b: Seat, ev?: EventId): State {
  const s = { v: 0, rng: seed >>> 0 || 1, round: 0, turn: 0, first: 0, ev: 'none', over: false, winner: null, reason: '', uid: 1, p: [] as unknown as State['p'], log: [] } as State;
  s.ev = ev ?? EVENTS[rint(s, EVENTS.length)].id;
  const heroHp = s.ev === 'heroes' ? 32 : HERO_HP;
  s.p = [a, b].map((x) => ({ name: x.name, hero: heroHp, heroMax: heroHp, paint: 0, deck: shuffle(s, [...x.deck]), hand: [], grave: [], fatigue: 0, timeouts: 0,
    lanes: x.terrains.slice(0, LANES).map((t) => ({ terrain: t as Terrain, unit: null, totem: null })) })) as unknown as State['p'];
  s.first = rint(s, 2) as Side;
  const out: Ev[] = [{ e: 'event', id: s.ev, text: EVENTS.find((x) => x.id === s.ev)!.text }];
  // opening hands: 4 for whoever goes first, 5 for the other
  for (const side of [0, 1] as Side[]) for (let i = 0; i < (side === s.first ? 4 : 5); i++) draw(s, side, out);
  s.turn = s.first;
  startTurn(s, s.first, out);
  s.log = [{ n: 0, side: -1, ev: out }];
  return s;
}

// ---- reading the board -------------------------------------------------------------------------------------------------
const cardOf = (id: string): Card => CARD[id];
const home = (s: State, side: Side, lane: number) => { const u = s.p[side].lanes[lane].unit; if (!u) return false; const t = cardOf(u.id).terrain; return t !== 'neutral' && t === s.p[side].lanes[lane].terrain; };
/** A creature's attack right now: its own, + terrain, totems, auras, the event, this turn's boosts. */
export function attackOf(s: State, side: Side, lane: number): number {
  const L = s.p[side].lanes[lane], u = L.unit; if (!u) return 0;
  let a = u.atk + u.temp;
  if (home(s, side, lane)) a += 1;
  if (L.totem?.id === 'kindleshrine') a += 2;
  if (s.ev === 'bloodmoon') a += 1;
  for (let i = 0; i < LANES; i++) if (i !== lane && s.p[side].lanes[i].unit?.id === 'gridoverlord') a += 1;
  return Math.max(0, a);
}
const toughness = (s: State, side: Side, lane: number) => { const L = s.p[side].lanes[lane]; let n = 0; if (L.unit && (L.unit.id === 'mossback' || L.unit.id === 'frostmaw')) n++; if (L.totem?.id === 'hoarfrost') n++; return n; };

// ---- the building blocks --------------------------------------------------------------------------------------------
function draw(s: State, side: Side, out: Ev[]) {
  const P = s.p[side];
  if (!P.deck.length) { P.fatigue++; out.push({ e: 'fatigue', side, n: P.fatigue }); hitHero(s, side, P.fatigue, 'fatigue', out); return; }
  const id = P.deck.shift()!, uid = s.uid++;
  if (P.hand.length >= HAND_MAX) { P.grave.push(id); out.push({ e: 'draw', side, uid, card: id, burned: true }); return; }
  P.hand.push({ uid, id }); out.push({ e: 'draw', side, uid, card: id });
}
function giveCard(s: State, side: Side, id: string, out: Ev[]) {
  const P = s.p[side], uid = s.uid++;
  if (P.hand.length >= HAND_MAX) return;
  P.hand.push({ uid, id }); out.push({ e: 'copy', side, uid, card: id });
}
function hitHero(s: State, side: Side, n: number, kind: Extract<Ev, { e: 'dmg' }>['kind'], out: Ev[]) {
  if (n <= 0 || s.over) return;
  s.p[side].hero -= n; out.push({ e: 'dmg', side, lane: -1, n, kind });
  if (s.p[side].hero <= 0) finish(s, other(side), 'hero', out);
}
function healHero(s: State, side: Side, n: number, out: Ev[]) {
  const P = s.p[side], h = Math.min(n, P.heroMax - P.hero); if (h <= 0) return;
  P.hero += h; out.push({ e: 'heal', side, lane: -1, n: h });
}
function damage(s: State, side: Side, lane: number, n: number, kind: Extract<Ev, { e: 'dmg' }>['kind'], out: Ev[]) {
  const u = s.p[side].lanes[lane].unit; if (!u || n <= 0) return 0;
  if (u.shield) { u.shield = false; out.push({ e: 'dmg', side, lane, n: 0, blocked: true, kind }); return 0; }
  const d = Math.max(0, n - toughness(s, side, lane));
  u.hp -= d; out.push({ e: 'dmg', side, lane, n: d, kind });
  return d;
}
function heal(s: State, side: Side, lane: number, n: number, out: Ev[]) {
  const u = s.p[side].lanes[lane].unit; if (!u) return;
  const h = Math.min(n, u.max - u.hp); if (h <= 0) return;
  u.hp += h; out.push({ e: 'heal', side, lane, n: h });
}
function buff(s: State, side: Side, lane: number, atk: number, hp: number, out: Ev[]) {
  const u = s.p[side].lanes[lane].unit; if (!u) return;
  u.atk += atk; u.max += hp; u.hp += hp; out.push({ e: 'buff', side, lane, atk, hp });
}
function freeze(s: State, side: Side, lane: number, out: Ev[]) { const u = s.p[side].lanes[lane].unit; if (!u) return; u.frozen = 1; out.push({ e: 'freeze', side, lane }); }
function poison(s: State, side: Side, lane: number, n: number, out: Ev[]) { const u = s.p[side].lanes[lane].unit; if (!u) return; u.poison = Math.max(u.poison, n); out.push({ e: 'poison', side, lane, n }); }

/** Sweep away the fallen (and trigger what happens when they fall), until the board settles. */
function deaths(s: State, out: Ev[]) {
  for (let guard = 0; guard < 8; guard++) {
    const dead: { side: Side; lane: number; u: Unit }[] = [];
    for (const side of [0, 1] as Side[]) s.p[side].lanes.forEach((L, lane) => { if (L.unit && L.unit.hp <= 0) dead.push({ side, lane, u: L.unit }); });
    if (!dead.length) return;
    for (const d of dead) { s.p[d.side].lanes[d.lane].unit = null; s.p[d.side].grave.push(d.u.id); out.push({ e: 'die', side: d.side, lane: d.lane, card: d.u.id }); }
    for (const d of dead) {
      const o = other(d.side);
      if (d.u.id === 'lavaling') damage(s, o, d.lane, 2, 'burn', out);
      if (d.u.id === 'sporemite') poison(s, o, d.lane, 2, out);
    }
    // swamp lurkers grow on every death
    for (const side of [0, 1] as Side[]) s.p[side].lanes.forEach((L, lane) => { if (L.unit?.id === 'swamplurker' && L.unit.hp > 0) for (let i = 0; i < dead.length; i++) buff(s, side, lane, 1, 1, out); });
  }
}
function finish(s: State, winner: Side | -1, reason: string, out: Ev[]) {
  if (s.over) return;
  s.over = true; s.winner = winner; s.reason = reason; out.push({ e: 'over', winner, reason });
}

// ---- turns -------------------------------------------------------------------------------------------------------------
function startTurn(s: State, side: Side, out: Ev[]) {
  if (side === s.first) {
    s.round++;
    if (s.ev === 'duststorm' && s.round > 1) for (const sd of [0, 1] as Side[]) { const l = rint(s, LANES), t = TERRAINS[rint(s, TERRAINS.length)]; s.p[sd].lanes[l].terrain = t; out.push({ e: 'terrain', side: sd, lane: l, terrain: t }); }
  }
  out.push({ e: 'turn', side, round: s.round });
  const P = s.p[side];
  let paint = Math.min(MAX_PAINT, 1 + s.round) + (s.ev === 'rain' ? 1 : 0);
  P.lanes.forEach((L) => { if (L.totem?.id === 'sprinklefountain') paint += 1; });
  P.paint = paint; out.push({ e: 'paint', side, n: paint });
  if (!(s.round === 1 && side === s.first)) for (let i = 0; i < (s.ev === 'bounty' ? 2 : 1); i++) draw(s, side, out);
  if (s.over) return;
  P.lanes.forEach((L, lane) => {
    const u = L.unit; if (!u) return;
    u.acted = false; u.temp = 0;
    if (L.totem?.id === 'bloomwell') heal(s, side, lane, 2, out);
    if (u.poison > 0) { damage(s, side, lane, 1, 'poison', out); u.poison--; }
  });
  if (P.lanes.some((L) => L.unit?.id === 'oakheart')) P.lanes.forEach((_, lane) => heal(s, side, lane, 1, out));
  deaths(s, out);
}

function endTurn(s: State, side: Side, out: Ev[]) {
  const o = other(side), P = s.p[side];
  for (let lane = 0; lane < LANES && !s.over; lane++) {
    const u = P.lanes[lane].unit; if (!u || u.hp <= 0) continue;
    if (u.frozen) { u.frozen = 0; out.push({ e: 'thaw', side, lane }); continue; }
    if (u.acted) continue;
    const atk = attackOf(s, side, lane); if (atk <= 0) continue;
    const foe = s.p[o].lanes[lane].unit;
    if (foe) {
      out.push({ e: 'attack', side, lane, to: 'unit' });
      const dealt = damage(s, o, lane, atk, 'hit', out);
      if (dealt > 0 && s.p[o].lanes[lane].unit) {
        if (u.id === 'icicleram') freeze(s, o, lane, out);
        if (u.id === 'mudslug' || P.lanes[lane].totem?.id === 'mirecauldron') poison(s, o, lane, 1, out);
      }
      if (u.id === 'laserlynx') for (const l of [lane - 1, lane + 1]) if (l >= 0 && l < LANES) damage(s, o, l, 1, 'hit', out);
    } else {
      out.push({ e: 'attack', side, lane, to: 'hero' });
      hitHero(s, o, atk, 'hit', out);
    }
    if (u.id === 'circuitcat') hitHero(s, o, 1, 'burn', out);
    deaths(s, out);
  }
  if (s.over) return;
  // end-of-turn effects
  P.lanes.forEach((L, lane) => {
    if (L.unit?.id === 'rotqueen') for (let l = 0; l < LANES; l++) damage(s, o, l, 1, 'poison', out);
    if (L.totem?.id === 'teslacoil') damage(s, o, lane, 1, 'burn', out);
  });
  deaths(s, out);
  P.lanes.forEach((L) => { if (L.unit) L.unit.temp = 0; });
  // the end of a round
  if (side !== s.first) {
    if (s.ev === 'rumble') { out.push({ e: 'event', id: 'rumble', text: 'The ground rumbles!' }); for (const sd of [0, 1] as Side[]) for (let l = 0; l < LANES; l++) damage(s, sd, l, 1, 'event', out); deaths(s, out); }
    if (s.round >= ROUND_LIMIT && !s.over) { const a = s.p[0].hero, b = s.p[1].hero; finish(s, a === b ? -1 : a > b ? 0 : 1, 'rounds', out); }
  }
}

// ---- what you can do ------------------------------------------------------------------------------------------------------
function validTarget(s: State, side: Side, kind: Target | undefined, t: Pick | undefined): boolean {
  if (!kind || kind === 'none') return true;
  if (!t || (t.side !== 0 && t.side !== 1) || !Number.isInteger(t.lane) || t.lane < 0 || t.lane >= LANES) return false;
  const u = s.p[t.side].lanes[t.lane].unit;
  switch (kind) {
    case 'enemy_unit': return t.side !== side && !!u;
    case 'any_unit': return !!u;
    case 'my_unit': return t.side === side && !!u;
    case 'my_lane': return t.side === side;
    case 'enemy_lane': return t.side !== side;
    case 'my_empty_lane': return t.side === side && !u;
  }
  return false;
}
/** Can this be done right now? (null = yes, else why not) */
export function check(s: State, side: Side, a: Action): string | null {
  if (s.over) return 'over';
  if (a.t === 'concede') return null;
  if (s.turn !== side) return 'not_your_turn';
  const P = s.p[side];
  if (a.t === 'end' || a.t === 'timeout') return null;
  if (a.t === 'play') {
    const h = P.hand.find((x) => x.uid === a.uid); if (!h) return 'no_card';
    const c = cardOf(h.id); if (c.cost > P.paint) return 'no_paint';
    if (c.kind === 'creature' || c.kind === 'totem') { if (a.lane === undefined || a.lane < 0 || a.lane >= LANES || !Number.isInteger(a.lane)) return 'bad_lane'; return null; }
    if (c.id === 'secondwind' && !P.grave.some((id) => cardOf(id).kind === 'creature')) return 'nothing_to_revive';
    return validTarget(s, side, c.target, a.target) ? null : 'bad_target';
  }
  if (a.t === 'flourish') {
    if (!Number.isInteger(a.lane) || a.lane < 0 || a.lane >= LANES) return 'bad_lane';
    const u = P.lanes[a.lane].unit; if (!u) return 'no_unit';
    const f = cardOf(u.id).flourish; if (!f) return 'no_flourish';
    if (u.acted) return 'already_acted';
    if (u.frozen) return 'frozen';
    if (f.cost > P.paint) return 'no_paint';
    if (u.id === 'jellyfright') { if (!a.target || a.target.side !== side || Math.abs(a.target.lane - a.lane) !== 1) return 'bad_target'; return null; }
    if (u.id === 'fungalshaman' && !P.grave.some((id) => cardOf(id).kind === 'creature')) return 'nothing_to_revive';
    return validTarget(s, side, f.target, a.target) ? null : 'bad_target';
  }
  return 'bad_action';
}

function summon(s: State, side: Side, lane: number, id: string, out: Ev[], hp?: number) {
  const c = cardOf(id), L = s.p[side].lanes[lane];
  if (L.unit) { s.p[side].grave.push(L.unit.id); out.push({ e: 'die', side, lane, card: L.unit.id }); }
  let max = (c.hp ?? 1) + (s.ev === 'giants' ? 2 : 0);
  const atk = c.atk ?? 0;
  if (s.ev === 'homesick' && c.terrain === L.terrain) { max += 1; }
  const u: Unit = { uid: s.uid++, id, atk, hp: hp ?? max, max, shield: c.tags?.includes('shield') ?? false, frozen: 0, poison: 0, temp: 0, acted: false };
  L.unit = u; out.push({ e: 'play', side, card: id, lane, uid: u.uid });
  // Elder Oakheart: the Meadow creatures play better around it
  const oak = s.p[side].lanes.some((x, i) => i !== lane && x.unit?.id === 'oakheart');
  if (oak && c.terrain === 'meadow') buff(s, side, lane, 1, 1, out);
  return u;
}

function onPlay(s: State, side: Side, lane: number, id: string, out: Ev[]) {
  const o = other(side), P = s.p[side];
  switch (id) {
    case 'thornhare': damage(s, o, lane, 1, 'spell', out); break;
    case 'blazefox': hitHero(s, o, 2, 'burn', out); break;
    case 'volcanotitan': for (let l = 0; l < LANES; l++) damage(s, o, l, 2, 'burn', out); break;
    case 'aurorawyrm': for (let l = 0; l < LANES; l++) freeze(s, o, l, out); break;
    case 'glacierowl': draw(s, side, out); break;
    case 'sugarcolossus': draw(s, side, out); draw(s, side, out); break;
    case 'gumdropimp': P.paint += 1; out.push({ e: 'paint', side, n: P.paint }); break;
    case 'wanderingbard': healHero(s, side, 3, out); break;
    case 'taffytwister': { const f = s.p[o].lanes[lane].unit; if (f) { s.p[o].lanes[lane].unit = null; out.push({ e: 'bounce', side: o, lane, card: f.id }); if (s.p[o].hand.length < HAND_MAX) { const uid = s.uid++; s.p[o].hand.push({ uid, id: f.id }); } } break; }
    case 'oakheart': P.lanes.forEach((L, l) => { if (l !== lane && L.unit && cardOf(L.unit.id).terrain === 'meadow') buff(s, side, l, 1, 1, out); }); break;
    case 'mimicchest': { const h = s.p[o].hand; if (h.length) giveCard(s, side, h[rint(s, h.length)].id, out); break; }
  }
}

function castSpell(s: State, side: Side, id: string, t: Pick | undefined, out: Ev[]) {
  const o = other(side), P = s.p[side];
  out.push({ e: 'spell', side, card: id, target: t });
  switch (id) {
    case 'rejuvenate': { const u = s.p[t!.side].lanes[t!.lane].unit!; u.max += 1; heal(s, t!.side, t!.lane, u.max, out); out.push({ e: 'buff', side: t!.side, lane: t!.lane, atk: 0, hp: 1 }); break; }
    case 'fireburst': damage(s, t!.side, t!.lane, 4, 'spell', out); break;
    case 'deepfreeze': damage(s, t!.side, t!.lane, 1, 'spell', out); if (s.p[t!.side].lanes[t!.lane].unit) freeze(s, t!.side, t!.lane, out); break;
    case 'toxiccloud': for (const l of [t!.lane - 1, t!.lane, t!.lane + 1]) if (l >= 0 && l < LANES && s.p[o].lanes[l].unit) { damage(s, o, l, 2, 'spell', out); poison(s, o, l, 1, out); } break;
    case 'sweettooth': draw(s, side, out); draw(s, side, out); hitHero(s, side, 2, 'self', out); break;
    case 'overcharge': { const u = s.p[t!.side].lanes[t!.lane].unit!; u.temp += 3; out.push({ e: 'buff', side: t!.side, lane: t!.lane, atk: 3, hp: 0 }); break; }
    case 'luckycoin': { P.paint += 1; out.push({ e: 'paint', side, n: P.paint }); const heads = rand(s) < 0.5; out.push({ e: 'coin', side, heads }); if (heads) draw(s, side, out); break; }
    case 'terraform': {
      const L = P.lanes[t!.lane];
      const near = [t!.lane, t!.lane - 1, t!.lane + 1].map((l) => P.lanes[l]?.unit).filter((u): u is Unit => !!u).map((u) => cardOf(u.id).terrain).filter((x): x is Terrain => x !== 'neutral');
      const to = near[0] ?? TERRAINS[rint(s, TERRAINS.length)];
      L.terrain = to; out.push({ e: 'terrain', side, lane: t!.lane, terrain: to }); draw(s, side, out); break;
    }
    case 'secondwind': {
      const i = P.grave.map((id2) => cardOf(id2).kind).lastIndexOf('creature');
      if (i >= 0) { const id2 = P.grave.splice(i, 1)[0]; summon(s, side, t!.lane, id2, out, 2); }
      break;
    }
  }
  deaths(s, out);
}

function doFlourish(s: State, side: Side, lane: number, t: Pick | undefined, out: Ev[]) {
  const o = other(side), P = s.p[side], u = P.lanes[lane].unit!, f = cardOf(u.id).flourish!;
  P.paint -= f.cost; u.acted = true;
  out.push({ e: 'flourish', side, lane, card: u.id, target: t });
  switch (u.id) {
    case 'sproutling': heal(s, side, lane, 3, out); break;
    case 'mossback': for (const l of [lane - 1, lane + 1]) if (l >= 0 && l < LANES) buff(s, side, l, 0, 2, out); break;
    case 'blossomstag': healHero(s, side, 4, out); break;
    case 'cinderpup': hitHero(s, o, 1, 'burn', out); break;
    case 'pyredrake': damage(s, t!.side, t!.lane, 3, 'burn', out); break;
    case 'snowpip': freeze(s, o, lane, out); break;
    case 'fungalshaman': { const i = P.grave.map((id) => cardOf(id).kind).lastIndexOf('creature'); if (i >= 0) giveCard(s, side, P.grave.splice(i, 1)[0], out); break; }
    case 'jellyfright': {
      const to = t!.lane, other2 = P.lanes[to].unit;
      P.lanes[to].unit = u; P.lanes[lane].unit = other2; out.push({ e: 'move', side, from: lane, to }); break;
    }
    case 'voltbug': { const ls = s.p[o].lanes.map((L, l) => (L.unit ? l : -1)).filter((l) => l >= 0); if (ls.length) damage(s, o, ls[rint(s, ls.length)], 1, 'burn', out); break; }
  }
  deaths(s, out);
}

/** Apply an action (the side must be allowed to). Returns the events, newest action logged in the state. */
export function apply(s: State, side: Side, a: Action): Ev[] {
  const why = check(s, side, a); if (why) throw new Error(why);
  const out: Ev[] = [];
  const P = s.p[side];
  if (a.t === 'concede') finish(s, other(side), 'concede', out);
  else if (a.t === 'end' || a.t === 'timeout') {
    if (a.t === 'timeout') { P.timeouts++; if (P.timeouts >= 3) { finish(s, other(side), 'timeout', out); } }
    else P.timeouts = 0;
    if (!s.over) {
      endTurn(s, side, out);
      if (!s.over) { s.turn = other(side); startTurn(s, s.turn, out); }
    }
  } else if (a.t === 'play') {
    const i = P.hand.findIndex((x) => x.uid === a.uid), h = P.hand[i], c = cardOf(h.id);
    P.hand.splice(i, 1); P.paint -= c.cost;
    if (c.kind === 'creature') { summon(s, side, a.lane!, c.id, out); onPlay(s, side, a.lane!, c.id, out); deaths(s, out); }
    else if (c.kind === 'totem') { const L = P.lanes[a.lane!]; L.totem = { uid: s.uid++, id: c.id }; out.push({ e: 'totem', side, card: c.id, lane: a.lane! }); }
    else castSpell(s, side, c.id, a.target, out);
  } else if (a.t === 'flourish') doFlourish(s, side, a.lane, a.target, out);
  s.v++;
  s.log.push({ n: s.v, side, ev: out });
  if (s.log.length > 8) s.log.splice(0, s.log.length - 8);
  return out;
}

/** What one player is allowed to see: the other's hand and both decks are hidden (counts only), and so is the dice. */
export type View = Omit<State, 'rng' | 'p'> & { me: Side; p: [PlayerView, PlayerView] };
export type PlayerView = Omit<PlayerState, 'deck' | 'hand'> & { deck: number; hand: (HandCard | { uid: number; id?: undefined })[] };
export function viewFor(s: State, me: Side): View {
  const hideEv = (e: Ev): Ev => ((e.e === 'draw' || e.e === 'copy') && e.side !== me && !(e.e === 'draw' && e.burned) ? { ...e, card: undefined } : e);
  return {
    v: s.v, round: s.round, turn: s.turn, first: s.first, ev: s.ev, over: s.over, winner: s.winner, reason: s.reason, uid: s.uid, me,
    p: s.p.map((P, i) => ({ ...P, deck: P.deck.length, hand: i === me ? P.hand.map((h) => ({ ...h })) : P.hand.map((h) => ({ uid: h.uid })) })) as View['p'],
    log: s.log.map((l) => ({ ...l, ev: l.ev.map(hideEv) })),
  };
}
export const clone = (s: State): State => JSON.parse(JSON.stringify(s));
export const otherSide = other;
