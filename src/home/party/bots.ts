// AI players for the house party games: they fill empty seats so every game works on your own or short of people.
// They're played by the host's device. They try to play like people, and fairly:
//  · board games: a second or two to think, they spot wins and threats most of the time but not always
//  · quick games: human reaction times (and the odd wrong tap)
//  · word games: simple, common answers from a small vocabulary — never anything they couldn't know
//  · 3D games: a little slower than you can run, they react to lights and chases a beat late, and they get stuck
//    on scenery like anyone else
import type { Profile } from '../../backend/types';
import { ckLegal } from './games';
import { FACTS, PAIRS, PROMPTS, QUESTIONS } from './games2';
import { dec, norm, rng } from './kit';
import { WORDS } from './words';
import { LAVA, inBush, tileAt, type In3, type P3, type W3 } from '../live3d/sims';

export const BOT_PREFIX = 'bot:';
export const isBot = (id: string) => id.startsWith(BOT_PREFIX);
const NAMES = ['Pip', 'Juno', 'Milo', 'Nova', 'Ziggy', 'Coco', 'Rex', 'Lumi'];
const COLORS = ['#FF8A3D', '#22B8CF', '#9B5CFF', '#3DDC97', '#FF5FA2', '#FFD21F', '#4C6EF5', '#B6E33D'];
/** the bots at a table, as players (made up from the table, so everyone sees the same ones) */
export function botProfiles(gameId: string, n: number): Profile[] {
  const r = rng([...gameId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7));
  const start = Math.floor(r() * NAMES.length);
  return Array.from({ length: n }, (_, i) => {
    const k = (start + i) % NAMES.length;
    return { id: `${BOT_PREFIX}${i}`, username: `${NAMES[k]} 🤖`, display_name: `${NAMES[k]} (bot)`, avatar_seed: `bot-${NAMES[k]}`, avatar_style: 'orbit', accent_color: COLORS[k], avatar_path: null, bio: null, created_at: '2026-01-01T00:00:00Z' } as Profile;
  });
}

// ======================================================================================================================
// board and party games: a move now and then
// ======================================================================================================================
type Ctx = { now: number; r: () => number; mem: Record<string, unknown> };
/** a bot's next move (or null to wait); `wait` is how long to think before the next look */
export type BotMove = { m: unknown; wait?: number } | null;
const between = (r: () => number, a: number, b: number) => a + r() * (b - a);
const pickOf = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)];

// ---- Four in a Row ----
type FR = { ids: string[]; b: number[]; turn: number; winner: number | null };
function frDrop(b: number[], c: number) { for (let r = 5; r >= 0; r--) if (b[r * 7 + c] === -1) return r * 7 + c; return -1; }
function frWins(b: number[], i: number, v: number) {
  const r = Math.floor(i / 7), c = i % 7;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) { let rr = r + dr * s, cc = c + dc * s; while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && b[rr * 7 + cc] === v) { n++; rr += dr * s; cc += dc * s; } }
    if (n >= 4) return true;
  }
  return false;
}
function fourrowBot(s: FR, me: string, x: Ctx): BotMove {
  const side = s.ids.indexOf(me);
  if (s.winner != null || s.turn !== side) return null;
  const cols = [0, 1, 2, 3, 4, 5, 6].filter((c) => frDrop(s.b, c) >= 0);
  // a win it sees (most of the time), a threat it blocks (most of the time)
  for (const [who, chance] of [[side, 0.85], [1 - side, 0.7]] as const) {
    for (const c of cols) { const i = frDrop(s.b, c); if (frWins(s.b, i, who) && x.r() < chance) return { m: { c } }; }
  }
  // don't hand over a win by playing under it (usually)
  const safe = cols.filter((c) => { const i = frDrop(s.b, c), above = i - 7; if (above < 0) return true; const b = [...s.b]; b[i] = side; return !frWins(b, above, 1 - side) || x.r() < 0.25; });
  const pool = safe.length ? safe : cols;
  // the middle's worth more
  const weighted = pool.flatMap((c) => Array(4 - Math.abs(3 - c)).fill(c) as number[]);
  return { m: { c: pickOf(x.r, weighted) } };
}

// ---- Checkers ----
type CK = { ids: string[]; b: number[]; turn: number; must: number | null; quiet: number; winner: number | null; last: [number, number] | null };
function checkersBot(s: CK, me: string, x: Ctx): BotMove {
  if (s.winner != null || s.ids[s.turn] !== me) return null;
  const moves = ckLegal(s as never) as { from: number; to: number; jump: number | null }[];
  if (!moves.length) return null;
  // landing where it can be jumped straight back is a mistake it usually (not always) avoids
  const side = s.turn, enemy = (v: number) => (side === 0 ? v < 0 : v > 0);
  const hangs = (mv: { from: number; to: number }) => {
    const r = Math.floor(mv.to / 8), c = mv.to % 8;
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ar = r + dr, ac = c + dc, br = r - dr, bc = c - dc;
      if (ar < 0 || ar > 7 || ac < 0 || ac > 7 || br < 0 || br > 7 || bc < 0 || bc > 7) continue;
      if (enemy(s.b[ar * 8 + ac]) && (s.b[br * 8 + bc] === 0 || br * 8 + bc === mv.from)) return true;
    }
    return false;
  };
  const careful = moves.filter((m) => !hangs(m));
  const pool = careful.length && x.r() < 0.7 ? careful : moves;
  // crowning is nice
  const crown = pool.filter((m) => { const r = Math.floor(m.to / 8); return (side === 0 && r === 0) || (side === 1 && r === 7); });
  const mv = crown.length && x.r() < 0.7 ? pickOf(x.r, crown) : pickOf(x.r, pool);
  return { m: { from: mv.from, to: mv.to }, wait: s.must != null ? between(x.r, 600, 1100) : undefined };
}

// ---- Dots & Boxes ----
type DB = { ids: string[]; n: number; h: number[]; v: number[]; box: number[]; turn: number };
function dbSides(s: DB, b: number) { const n = s.n, r = Math.floor(b / n), c = b % n; return [s.h[r * n + c], s.h[(r + 1) * n + c], s.v[r * (n + 1) + c], s.v[r * (n + 1) + c + 1]].filter((x) => x >= 0).length; }
function dbAround(s: DB, k: 'h' | 'v', i: number) {
  const n = s.n, out: number[] = [];
  if (k === 'h') { const r = Math.floor(i / n), c = i % n; if (r > 0) out.push((r - 1) * n + c); if (r < n) out.push(r * n + c); }
  else { const r = Math.floor(i / (n + 1)), c = i % (n + 1); if (c > 0) out.push(r * n + c - 1); if (c < n) out.push(r * n + c); }
  return out;
}
function dotsBot(s: DB, me: string, x: Ctx): BotMove {
  if (s.ids[s.turn] !== me || s.box.every((b) => b >= 0)) return null;
  const free = [...s.h.map((v, i) => (v < 0 ? ['h', i] as const : null)), ...s.v.map((v, i) => (v < 0 ? ['v', i] as const : null))].filter(Boolean) as ['h' | 'v', number][];
  const closes = free.filter(([k, i]) => dbAround(s, k, i).some((b) => s.box[b] < 0 && dbSides(s, b) === 3));
  if (closes.length && x.r() < 0.85) { const [k, i] = pickOf(x.r, closes); return { m: { k, i } }; }
  const safe = free.filter(([k, i]) => dbAround(s, k, i).every((b) => dbSides(s, b) < 2));
  const [k, i] = pickOf(x.r, safe.length && x.r() < 0.8 ? safe : free);
  return { m: { k, i } };
}

// ---- Ladders & Slides ----
function laddersBot(s: { ids: string[]; turn: number; over: boolean }, me: string): BotMove {
  return !s.over && s.ids[s.turn] === me ? { m: { roll: true } } : null;
}

// ---- Colour Rush ----
type CR = { round: number; phase: string; ask: 'ink' | 'word'; word: number; ink: number; choices: number[]; ans: Record<string, unknown>; ends: number };
function rushBot(s: CR, me: string, x: Ctx): BotMove {
  if (s.phase !== 'ask' || s.ans[me]) { x.mem.rush = null; return null; }
  // see the question, then a human beat later, tap (usually the right one)
  const key = `r${s.round}`;
  const at = (x.mem[key] as number | undefined) ?? (x.mem[key] = x.now + between(x.r, 1300, 3400)) as number;
  if (x.now < at) return null;
  const right = s.ask === 'ink' ? s.ink : s.word;
  const wrong = s.choices.filter((c) => c !== right);
  return { m: { k: 'tap', r: s.round, c: x.r() < 0.74 ? right : pickOf(x.r, wrong) } };
}

// ---- Doodle Guess ----
type Stroke = { c: string; w: number; p: number[] };
/** a quick doodle: a few loops and lines (bots aren't artists — the letter hints help everyone) */
function scribble(r: () => number, n = 3): Stroke[] {
  const out: Stroke[] = [];
  const inks = ['#1C1512', '#FF3D6E', '#3D7BFF', '#2FC46B', '#FFB13D'];
  for (let k = 0; k < n; k++) {
    const cx = 250 + r() * 500, cy = 250 + r() * 500, rad = 60 + r() * 160, p: number[] = [];
    if (r() < 0.6) for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.35) p.push(Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad * (0.6 + r() * 0.6)));
    else for (let j = 0; j < 6; j++) p.push(Math.round(Math.max(0, Math.min(1000, cx + (r() - 0.5) * 2 * rad))), Math.round(Math.max(0, Math.min(1000, cy + (r() - 0.5) * 2 * rad))));
    out.push({ c: pickOf(r, inks), w: 8, p });
  }
  return out;
}
type DG = { ids: string[]; round: number; drawer: number; wz: string; phase: string; ends: number; drawFor: number; strokes: unknown[]; got: Record<string, number> };
function doodleBot(s: DG, me: string, x: Ctx): BotMove {
  if (s.phase !== 'draw') return null;
  const drawer = s.ids[s.drawer];
  if (drawer === me) {
    // a stroke every few seconds, up to a handful
    if (s.strokes.length >= 5) return null;
    const st = scribble(x.r, 1)[0];
    return { m: { k: 'pts', sid: `b${s.round}-${s.strokes.length}`, c: st.c, w: st.w, p: st.p }, wait: between(x.r, 2500, 5000) };
  }
  if (s.got[me] != null) return null;
  // a guess every few seconds; the right one gets likelier as the clock runs (and the letters show)
  const left = Math.max(0, s.ends - x.now) / s.drawFor, word = dec(s.wz);
  const right = x.r() < 0.06 + (1 - left) * 0.42;
  return { m: { k: 'guess', t: right ? word : pickOf(x.r, WORDS.filter((w) => w !== word)) }, wait: between(x.r, 3500, 8000) };
}

// ---- Scribble Chain ----
type Link = { by: string; t?: string; d?: unknown };
type SC = { ids: string[]; step: number; phase: string; chains: Link[][] };
function chainBot(s: SC, me: string, x: Ctx): BotMove {
  if (s.phase === 'vote') {
    if ((x.mem.voted as string) === `v${s.chains.length}`) return null;
    const opts: string[] = [];
    s.chains.forEach((ch, c) => ch.forEach((l, k) => { if (l.d && l.by !== me) opts.push(`${c}:${k}`); }));
    if (!opts.length) return null;
    x.mem.voted = `v${s.chains.length}`;
    return { m: { k: 'vote', c: pickOf(x.r, opts) } };
  }
  if (!['write', 'draw', 'guess'].includes(s.phase)) return null;
  const c = s.ids.findIndex((_, ci) => s.ids[(ci + s.step) % s.ids.length] === me);
  if (c < 0 || s.chains[c][s.step]) return null;
  const key = `c${s.step}`;
  const at = (x.mem[key] as number | undefined) ?? (x.mem[key] = x.now + between(x.r, 4000, 12000)) as number;
  if (x.now < at) return null;
  if (s.phase === 'write') return { m: { k: 'text', t: pickOf(x.r, PROMPTS) } };
  if (s.phase === 'draw') return { m: { k: 'draw', d: scribble(x.r, 4) } };
  // guessing the drawing: they read it roughly right… or not quite
  const before = s.chains[c][s.step - 2]?.t ?? s.chains[c][0]?.t ?? pickOf(x.r, PROMPTS);
  const words = before.split(' ');
  if (x.r() < 0.55 && words.length > 1) { const i = Math.floor(x.r() * words.length); words[i] = pickOf(x.r, WORDS); }
  return { m: { k: 'text', t: words.join(' ').slice(0, 60) } };
}

// ---- Word Spy ----
const CLUES = ['round', 'big', 'small', 'fun', 'warm', 'cold', 'old', 'fast', 'soft', 'loud', 'shiny', 'outside', 'home', 'yummy', 'bright', 'noisy', 'sweet', 'tall', 'everyday', 'useful'];
type WS = { ids: string[]; round: number; phase: string; turn: number; spy: string; wz: string; sz: string; votes: Record<string, string> };
function spyBot(s: WS, me: string, x: Ctx): BotMove {
  if (s.phase === 'clue' && s.ids[s.turn] === me) {
    const mine = me === dec(s.spy) ? dec(s.sz) : dec(s.wz);
    // a clue: sometimes a word that goes with theirs (a pair's partner is close), mostly something vague
    const pair = PAIRS.find((p) => p.includes(mine));
    const t = pickOf(x.r, CLUES.filter((w) => norm(w) !== norm(mine) && (!pair || !pair.map(norm).includes(norm(w)))));
    return { m: { k: 'clue', t } };
  }
  if (s.phase === 'vote' && !s.votes[me]) {
    const key = `v${s.round}`;
    const at = (x.mem[key] as number | undefined) ?? (x.mem[key] = x.now + between(x.r, 3000, 9000)) as number;
    if (x.now < at) return null;
    const spyId = dec(s.spy), others = s.ids.filter((id) => id !== me);
    // a hunch: right a fair share of the time, but no better than a sharp human
    const who = me !== spyId && x.r() < 0.4 ? spyId : pickOf(x.r, others);
    return { m: { k: 'vote', who } };
  }
  return null;
}

// ---- Same Brain ----
const COMMON: Record<string, string[]> = {
  'Name a pizza topping': ['pepperoni', 'cheese', 'mushroom', 'ham'], 'Name a pet': ['dog', 'cat', 'fish', 'hamster'], 'Something you find at the beach': ['sand', 'shells', 'towel', 'sea'],
  'A colour of the rainbow': ['red', 'blue', 'green', 'yellow'], 'Something that’s always cold': ['ice', 'snow', 'freezer', 'ice cream'], 'A famous monster': ['dracula', 'frankenstein', 'godzilla', 'zombie'],
  'A breakfast food': ['eggs', 'toast', 'cereal', 'pancakes'], 'Something you do in the morning': ['brush teeth', 'shower', 'eat breakfast', 'wake up'], 'An animal with stripes': ['zebra', 'tiger', 'bee', 'skunk'],
  'Something you take on a picnic': ['sandwiches', 'blanket', 'basket', 'juice'], 'A word that rhymes with “cat”': ['hat', 'bat', 'mat', 'rat'], 'A sport with a ball': ['football', 'tennis', 'basketball', 'golf'],
  'Something in a toolbox': ['hammer', 'screwdriver', 'nails', 'wrench'], 'A fruit that’s yellow': ['banana', 'lemon', 'pineapple', 'mango'], 'Something you see in the sky': ['sun', 'clouds', 'moon', 'bird'],
  'A musical instrument': ['guitar', 'piano', 'drums', 'violin'], 'Something with wheels': ['car', 'bike', 'bus', 'skateboard'], 'A planet': ['mars', 'earth', 'jupiter', 'saturn'],
  'A superpower': ['flying', 'invisibility', 'super strength', 'teleport'], 'Something you put on a sandwich': ['cheese', 'ham', 'butter', 'lettuce'], 'A board game piece': ['pawn', 'king', 'dice', 'queen'],
  'An ice cream flavour': ['vanilla', 'chocolate', 'strawberry', 'mint'], 'Something spooky': ['ghost', 'skeleton', 'spider', 'bat'], 'A shape': ['circle', 'square', 'triangle', 'star'],
  'Something you’d find in a castle': ['king', 'knight', 'throne', 'dragon'], 'A farm animal': ['cow', 'pig', 'sheep', 'chicken'], 'A dessert': ['cake', 'ice cream', 'pie', 'cookies'],
  'Something that buzzes': ['bee', 'fly', 'phone', 'alarm'], 'A job that uses a uniform': ['police', 'nurse', 'firefighter', 'chef'], 'Something you wear on your head': ['hat', 'cap', 'helmet', 'crown'],
  'A vegetable': ['carrot', 'broccoli', 'potato', 'peas'], 'Something green': ['grass', 'frog', 'leaf', 'tree'], 'A weather': ['rain', 'sunny', 'snow', 'wind'],
  'An ocean animal': ['shark', 'whale', 'dolphin', 'fish'], 'A holiday': ['christmas', 'halloween', 'easter', 'birthday'],
};
type SB = { round: number; phase: string; q: number; ans: Record<string, string> };
function samebrainBot(s: SB, me: string, x: Ctx): BotMove {
  if (s.phase !== 'answer' || s.ans[me]) return null;
  const key = `a${s.round}`;
  const at = (x.mem[key] as number | undefined) ?? (x.mem[key] = x.now + between(x.r, 3500, 14000)) as number;
  if (x.now < at) return null;
  const opts = COMMON[QUESTIONS[s.q]] ?? ['yes'];
  // the most obvious answer most of the time — like people
  const t = x.r() < 0.55 ? opts[0] : pickOf(x.r, opts);
  return { m: { k: 'say', t } };
}

// ---- Bluff Buffet ----
const FAKES = ['a spoon', 'seven', 'blue', 'cheese', 'Mars', 'a pirate', 'Tuesday', 'pickles', 'the moon', 'a llama', 'twelve', 'socks', 'jelly', 'a wizard', 'forty', 'whiskers', 'Norway', 'a trumpet'];
type BB = { round: number; phase: string; f: number; lies: Record<string, string>; opts: { t: string; by: string[] }[]; picks: Record<string, number> };
function bluffBot(s: BB, me: string, x: Ctx): BotMove {
  const truth = FACTS[s.f]?.[1] ?? '';
  if (s.phase === 'write' && !s.lies[me]) {
    const key = `w${s.round}`;
    const at = (x.mem[key] as number | undefined) ?? (x.mem[key] = x.now + between(x.r, 5000, 20000)) as number;
    if (x.now < at) return null;
    return { m: { k: 'lie', t: pickOf(x.r, FAKES.filter((f) => norm(f) !== norm(truth))) } };
  }
  if (s.phase === 'pick' && s.picks[me] == null) {
    const key = `p${s.round}`;
    const at = (x.mem[key] as number | undefined) ?? (x.mem[key] = x.now + between(x.r, 3000, 12000)) as number;
    if (x.now < at) return null;
    const ok = s.opts.map((o, i) => (o.by.includes(me) ? -1 : i)).filter((i) => i >= 0);
    const real = s.opts.findIndex((o) => norm(dec(o.t)) === norm(truth));
    return { m: { k: 'pick', o: real >= 0 && x.r() < 0.38 ? real : pickOf(x.r, ok) } };
  }
  return null;
}

type BotFn = (s: never, me: string, x: Ctx) => BotMove;
const PARTY_BOTS: Record<string, BotFn> = {
  fourrow: fourrowBot as BotFn, checkers: checkersBot as BotFn, dots: dotsBot as BotFn, ladders: laddersBot as BotFn, rush: rushBot as BotFn,
  doodle: doodleBot as BotFn, chain: chainBot as BotFn, spy: spyBot as BotFn, samebrain: samebrainBot as BotFn, bluff: bluffBot as BotFn,
};

/** the bots at a board/party table, run by the host: call often; it returns the moves to make now */
export function partyBots(game: string, seed: number) {
  const fn = PARTY_BOTS[game];
  const state: Record<string, { next: number; mem: Record<string, unknown>; r: () => number }> = {};
  return (s: unknown, botIds: string[], now: number): { by: string; m: unknown }[] => {
    if (!fn) return [];
    const out: { by: string; m: unknown }[] = [];
    for (const id of botIds) {
      const b = (state[id] ??= { next: now + 900, mem: {}, r: rng(seed + id.charCodeAt(id.length - 1) * 977) });
      if (now < b.next) continue;
      const mv = fn(s as never, id, { now, r: b.r, mem: b.mem });
      // think a moment before looking again (a turn game: a second or two; the others look often)
      b.next = now + (mv?.wait ?? (mv ? between(b.r, 900, 2400) : 350));
      if (mv) out.push({ by: id, m: mv.m });
    }
    return out;
  };
}

// ======================================================================================================================
// the 3D games: a stick and a button, 30 times a second
// ======================================================================================================================
type Mem3 = { tx: number; tz: number; until: number; lx: number; lz: number; checkAt: number; detour: number; detourUntil: number; react: number; lastLight?: string; hold?: boolean };
const SPEED = 0.86; // a touch slower than a person can run
function toward(p: P3, tx: number, tz: number, k = SPEED): { x: number; y: number } {
  const dx = tx - p.x, dz = tz - p.z, l = Math.hypot(dx, dz) || 1;
  return l < 0.35 ? { x: 0, y: 0 } : { x: (dx / l) * k, y: (dz / l) * k };
}
const away = (p: P3, fx: number, fz: number) => { const d = toward(p, 2 * p.x - fx, 2 * p.z - fz); return d; };
function nearest(p: P3, ps: P3[]) { let best: P3 | null = null, bd = 1e9; for (const q of ps) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } } return { q: best, d: bd }; }
function wanderPoint(w: W3, r: () => number) {
  const H = w.H ?? w.R ?? 10, HX = w.HX ?? H, HZ = w.HZ ?? H;
  return { x: (r() * 2 - 1) * HX * 0.8, z: (r() * 2 - 1) * HZ * 0.8 };
}
/** stuck on something? step round it for a moment */
function unstick(p: P3, inp: { x: number; y: number }, m: Mem3, t: number, r: () => number) {
  if (t > m.checkAt) {
    const moved = Math.hypot(p.x - m.lx, p.z - m.lz), pushing = Math.hypot(inp.x, inp.y) > 0.3;
    if (pushing && moved < 0.35) { m.detour = r() < 0.5 ? 1 : -1; m.detourUntil = t + 0.9; }
    m.lx = p.x; m.lz = p.z; m.checkAt = t + 0.8;
  }
  if (t < m.detourUntil) return { x: -inp.y * m.detour, y: inp.x * m.detour };
  return inp;
}

type SimBot = (w: any, p: P3, m: Mem3, t: number, r: () => number) => In3; // eslint-disable-line @typescript-eslint/no-explicit-any
const live = (w: W3, p: P3) => w.ps.filter((q) => q.id !== p.id && q.alive);
const SIM_BOTS: Record<string, SimBot> = {
  tag(w, p, m, t, r) {
    const it = w.ps.find((q: P3) => q.id === w.it);
    if (p.id === w.it) {
      const targets = live(w, p).filter((q) => !(q.id === w.immune && w.immuneT > 0));
      const { q, d } = nearest(p, targets);
      if (q) return { ...toward(p, q.x, q.z), b: d < 2.6 && p.cd <= 0 && r() < 0.04 };
    } else if (it) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < 7.5) { const a = away(p, it.x, it.z); return { x: a.x + (r() - 0.5) * 0.4, y: a.y + (r() - 0.5) * 0.4, b: d < 2.4 && p.cd <= 0 && r() < 0.05 }; }
    }
    if (t > m.until) { const wp = wanderPoint(w, r); m.tx = wp.x; m.tz = wp.z; m.until = t + 3 + r() * 3; }
    return { ...toward(p, m.tx, m.tz, SPEED * 0.7), b: false };
  },
  hide(w, p, m, t, r) {
    if (w.found?.[p.id] != null || w.phase === 'between' || w.phase === 'done') return { x: 0, y: 0, b: false };
    if (p.id === w.seeker) {
      if (w.phase !== 'seek') return { x: 0, y: 0, b: false };
      // it can see hiders out in the open, and bumps into some in hiding when it's right on top of them
      const hiders = w.ps.filter((q: P3) => q.id !== p.id && w.found?.[q.id] == null && (!inBush(w.obs, q.x, q.z) || Math.hypot(q.x - p.x, q.z - p.z) < 2.2));
      const { q, d } = nearest(p, hiders);
      if (q && d < 9) return { ...toward(p, q.x, q.z), b: d < 3 && p.cd <= 0 && r() < 0.05 };
      if (t > m.until) { const wp = wanderPoint(w, r); m.tx = wp.x; m.tz = wp.z; m.until = t + 4 + r() * 3; }
      return { ...toward(p, m.tx, m.tz), b: false };
    }
    if (inBush(w.obs, p.x, p.z)) return { x: 0, y: 0, b: false };
    // off to a place to hide (not always the closest one — everyone would be in the same bush)
    if (!m.hold || t > m.until) {
      const soft = (w.obs ?? []).filter((o: { k: string; soft?: boolean }) => o.soft) as { x: number; z: number }[];
      const ranked = soft.map((o) => ({ o, d: Math.hypot(o.x - p.x, o.z - p.z) })).sort((a, b) => a.d - b.d).slice(0, 5);
      const pick = ranked[Math.floor(r() * ranked.length)]?.o;
      if (pick) { m.tx = pick.x; m.tz = pick.z; m.hold = true; m.until = t + 20; }
    }
    return { ...toward(p, m.tx, m.tz), b: false };
  },
  lava(w, p, m, t, r) {
    if (!p.alive) return { x: 0, y: 0, b: false };
    const L = LAVA.Y.indexOf(p.y), N = w.N;
    const here = tileAt(N, p.x, p.z);
    if (t > m.until || (L >= 0 && w.tiles[L]?.[tileAt(N, m.tx, m.tz)] !== '1')) {
      // a whole tile nearby on this floor (not the one underfoot)
      const lvl = L >= 0 ? L : 0, opts: { x: number; z: number; d: number }[] = [];
      for (let i = 0; i < N * N; i++) {
        if (i === here || w.tiles[lvl]?.[i] !== '1') continue;
        const x = ((i % N) - (N - 1) / 2) * LAVA.S, z = (Math.floor(i / N) - (N - 1) / 2) * LAVA.S, d = Math.hypot(x - p.x, z - p.z);
        if (d < 6) opts.push({ x, z, d });
      }
      opts.sort((a, b) => a.d - b.d);
      const o = opts[Math.floor(r() * Math.min(4, opts.length))];
      if (o) { m.tx = o.x; m.tz = o.z; m.until = t + 0.7 + r() * 0.6; }
    }
    return { ...toward(p, m.tx, m.tz), b: r() < 0.02 };
  },
  chairs(w, p, m, t, r) {
    if (!p.alive || w.lost?.includes(p.id)) return { x: 0, y: 0, b: false };
    if (w.phase === 'grab') {
      if (w.chairs.some((c: { by: string | null }) => c.by === p.id)) return { x: 0, y: 0, b: false };
      // a beat to notice the music stopped
      if (m.lastLight !== 'grab') { m.lastLight = 'grab'; m.react = t + 0.25 + r() * 0.35; }
      if (t < m.react) return { x: 0, y: 0, b: false };
      const free = w.chairs.filter((c: { by: string | null }) => !c.by) as { x: number; z: number }[];
      let best = free[0], bd = 1e9; for (const c of free) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
      if (best) return { ...toward(p, best.x, best.z, 0.92), b: bd < 1.4 && r() < 0.03 };
      return { x: 0, y: 0, b: false };
    }
    m.lastLight = w.phase;
    // round and round while the music plays
    const a = Math.atan2(p.x, p.z) + 0.6, R = 3.2;
    return { ...toward(p, Math.sin(a) * R, Math.cos(a) * R, 0.6), b: false };
  },
  sumo(w, p, _m, _t, r) {
    if (!p.alive) return { x: 0, y: 0, b: false };
    const R = w.ice ?? 8, dc = Math.hypot(p.x, p.z);
    if (dc > R * 0.68) return { ...toward(p, 0, 0), b: false };
    const { q, d } = nearest(p, live(w, p));
    if (!q) return { x: 0, y: 0, b: false };
    return { ...toward(p, q.x, q.z, 0.8), b: d < 1.7 && p.cd <= 0 && r() < 0.05 };
  },
  paint(w, p, m, t, r) {
    if (t > m.until) { const wp = wanderPoint(w, r); m.tx = wp.x; m.tz = wp.z; m.until = t + 2 + r() * 2.5; }
    return { ...toward(p, m.tx, m.tz), b: p.cd <= 0 && r() < 0.012 };
  },
  snow(w, p, m, t, r) {
    const { q, d } = nearest(p, live(w, p));
    if (!q) return { x: 0, y: 0, b: false };
    // line up a throw (face them), keep a sensible distance
    if (d < 9 && p.cd <= 0 && r() < 0.06) { const f = toward(p, q.x + (r() - 0.5) * 1.5, q.z + (r() - 0.5) * 1.5, 0.25); return { ...f, b: true }; }
    if (d > 7) return { ...toward(p, q.x, q.z), b: false };
    if (d < 4) { const a = away(p, q.x, q.z); return { ...a, b: false }; }
    if (t > m.until) { m.detour = r() < 0.5 ? 1 : -1; m.until = t + 1.5 + r(); }
    const f = toward(p, q.x, q.z); return { x: -f.y * m.detour * 0.7, y: f.x * m.detour * 0.7, b: false };
  },
  redlight(w, p, m, t, r) {
    if (w.done?.[p.id] != null) return { x: 0, y: 0, b: false };
    // a human beat to react when the light changes (now and then a little too late)
    if (w.light !== m.lastLight) { m.lastLight = w.light; m.react = t + 0.15 + r() * (r() < 0.12 ? 0.35 : 0.18); }
    const go = w.light === 'green' ? t >= m.react : t < m.react && m.hold;
    m.hold = go;
    if (!go) return { x: 0, y: 0, b: false };
    // forward (and a little sideways now and then to find the gaps in the fences)
    if (t > m.until) { m.tx = (r() * 2 - 1) * ((w.HX ?? 8) - 1.5); m.until = t + 2 + r() * 2; }
    const f = toward(p, m.tx, -(w.HZ ?? 30));
    return { ...f, b: false };
  },
  gems(w, p, m, t, r) {
    const gems = (w.gems ?? []) as { x: number; z: number }[];
    let best: { x: number; z: number } | null = null, bd = 1e9;
    for (const g of gems) { const d = Math.hypot(g.x - p.x, g.z - p.z) + r() * 2; if (d < bd) { bd = d; best = g; } }
    if (best) return { ...toward(p, best.x, best.z), b: bd > 5 && p.cd <= 0 && r() < 0.02 };
    if (t > m.until) { const wp = wanderPoint(w, r); m.tx = wp.x; m.tz = wp.z; m.until = t + 2 + r() * 2; }
    return { ...toward(p, m.tx, m.tz), b: false };
  },
};

/** the bots in a 3D game, run by the host: their sticks for this step */
export function simBots(game: string, seed: number) {
  const fn = SIM_BOTS[game];
  const mems: Record<string, Mem3> = {}, rs: Record<string, () => number> = {};
  return (w: W3, botIds: string[]): Record<string, In3> => {
    const out: Record<string, In3> = {};
    if (!fn) return out;
    for (const id of botIds) {
      const p = w.ps.find((q) => q.id === id); if (!p) continue;
      const r = (rs[id] ??= rng(seed + id.charCodeAt(id.length - 1) * 7919));
      const m = (mems[id] ??= { tx: p.x, tz: p.z, until: 0, lx: p.x, lz: p.z, checkAt: 0, detour: 1, detourUntil: 0, react: 0 });
      const i = fn(w, p, m, w.t, r);
      const s = unstick(p, i, m, w.t, r);
      out[id] = { x: s.x, y: s.y, b: !!i.b };
    }
    return out;
  };
}
