// The roll's director: the state machine that runs a roll — the drop, the rarity drum (and the minigame each roll
// lands with), Luck's rerolls, the pick, the Enchanted transformation and the reveal — and writes every moment of it
// into the trace. It never draws: the roll on screen and its clip (draw.ts) both show whatever the trace says for any
// time. Pure logic: the live roll drives it with the clock, and a past plot's roll can be re-created by driving it
// with a pretend clock.
import { RARITY_ORDER, rarityInfo, rarityTier, type RarityId } from '../../shared/rarity';
import { PLOT_TYPES } from '../../map/plotStyle';
import type { BurstOpts } from '../fx';
import { celebrate } from '../celebrate';
import { kindInfo } from '../../enchant/kinds';
import { hash, newSeed, rng } from './math';
import { lastLand, reelEnd, reelPos, type Burst, type EnchantBrief, type Final, type Reel, type Step, type Trace } from './trace';
import type { Layout } from './layout';

export type RollInput = {
  rarity: RarityId; usd: number; type: string; first: boolean; shiny?: boolean; hot?: boolean; lucky?: boolean; guaranteed?: string | null;
  choices?: RarityId[] | null; choiceTypes?: string[] | null; choiceShiny?: boolean[] | null; enchant?: EnchantBrief | null; name?: string | null;
};
export type Phase = 'drop' | 'spin' | 'pick' | 'enchant' | 'reveal';
export type Hooks = {
  phase?(p: Phase): void;
  /** which of Luck's rolls is rolling */
  step?(i: number): void;
  /** a roll clicked into place (its minigame shows) */
  lock?(i: number): void;
  /** one of Luck's rolls landed */
  landed?(i: number, r: RarityId): void;
  /** the pick screen opens, suggesting this roll */
  pick?(best: number): void;
  reveal?(): void;
  buzz?(k: 'light' | 'medium' | 'heavy' | 'success'): void;
  sound?(k: 'tickRarity' | 'land' | 'charge' | 'reveal' | 'enchant', tier?: number): void;
};

const NR = RARITY_ORDER.length;
export const DROP_MS = 640;
const INK = ['#1B1240', '#2A1F5C', '#3B2A7A'];
const RAINBOW = ['#FF3D9A', '#FFE14D', '#22E3FF', '#A45CFF', '#fff'];

/** which of Luck's rolls is best (to suggest it) */
export const rankOf = (r: RarityId) => { const i = rarityInfo(r); return r.startsWith('crown') ? 1e9 : i.ppm ? 1000 + 1e6 / i.ppm : i.sort; };
export const bestIdx = (c: RarityId[], sh?: boolean[] | null) => c.reduce((b, r, i) => (rankOf(r) > rankOf(c[b]) || (rankOf(r) === rankOf(c[b]) && !!sh?.[i] && !sh?.[b]) ? i : b), 0);

export class Director {
  trace: Trace;
  phase: Phase;
  private result: RollInput | null = null;
  private skipping = false;
  private skipLanded = new Set<string>();
  private queue: { at: number; f: () => void }[] = [];
  private now = 0;
  private stampAt: number | null = null;
  private centers: Record<string, number> = {};
  private enchantBeats = 0;
  private rnd: () => number;

  constructor(private L: Layout, private readonly o: { reduce: boolean; quickRerolls(): boolean; hooks?: Hooks; seed?: number; user?: Trace['user'] }) {
    const seed = o.seed ?? newSeed();
    this.rnd = rng(seed);
    this.trace = {
      v: 2, look: 'classic', id: `${Date.now().toString(36)}${(seed % 46656).toString(36)}`, at: Date.now(), seed, reduce: o.reduce, u0: L.u,
      drop: o.reduce ? 0 : DROP_MS, steps: [], shakes: [], bursts: [], user: o.user,
      final: { rarity: 'common', type: '', shiny: false, usd: 0, first: false, kept: 0 },
    };
    this.phase = o.reduce ? 'spin' : 'drop';
    if (o.reduce) this.startStep(0, 0);
  }

  private get h() { return this.o.hooks ?? {}; }
  /** the stage moved (a resize, the details coming in under it): bursts are recorded against the card where it is now */
  setLayout(L: Layout) { this.L = L; if (!this.trace.bursts.length) this.trace.u0 = L.u; }
  /** still something to come (a buzz, the next of Luck's rolls) */
  get busy() { return this.queue.length > 0 || this.phase !== 'reveal'; }
  private get multi() { return !!(this.result?.choices && this.result.choices.length > 1); }
  private typeOf(i: number) { const r = this.result!; return (this.multi ? r.choiceTypes?.[i] : null) ?? r.type; }
  private rarityOf(i: number): RarityId { const r = this.result!; return this.multi ? r.choices![i] : r.rarity; }
  private shinyOf(i: number) { const r = this.result!; return this.multi ? !!r.choiceShiny?.[i] : !!r.shiny; }

  /** the server answered: what the roll lands on */
  setResult(r: RollInput) {
    this.result = r;
    const multi = !!(r.choices && r.choices.length > 1);
    this.trace.final = {
      rarity: r.rarity, type: r.type, shiny: !!r.shiny, usd: r.usd, first: r.first, hot: r.hot, lucky: r.lucky, guaranteed: r.guaranteed ?? null,
      name: r.name ?? null, choices: multi ? r.choices : null, choiceTypes: multi ? r.choiceTypes ?? null : null, choiceShiny: multi ? r.choiceShiny ?? null : null,
      kept: 0, enchant: r.enchant ?? null,
    } satisfies Final;
    this.trace.steps.forEach((s, i) => this.fill(s, i));
  }
  private fill(s: Step, i: number) {
    if (!this.result) return;
    s.type = this.typeOf(i); s.rarity = this.rarityOf(i); s.shiny = this.shinyOf(i);
  }

  /** a tap: hurry the roll along */
  skip() { if (this.phase !== 'reveal' && this.phase !== 'pick') this.skipping = true; }
  /** the player kept one of Luck's rolls */
  pick(i: number) {
    if (this.phase !== 'pick' || !this.trace.pick) return;
    const f = this.trace.final, c = f.choices!;
    this.trace.pick.t1 = this.now; this.trace.pick.sel = i;
    f.kept = i; f.rarity = c[i]; f.type = f.choiceTypes?.[i] ?? f.type; f.shiny = !!f.choiceShiny?.[i];
    this.reveal(this.now);
  }
  /** a tap during the Enchanted transformation */
  finishEnchant() { if (this.phase === 'enchant' && this.now - (this.trace.enchant?.t0 ?? 0) > 250) this.reveal(this.now); }

  private later(ms: number, f: () => void) { this.queue.push({ at: this.now + ms, f }); }
  private setPhase(p: Phase) { this.phase = p; this.h.phase?.(p); }

  /** a burst of particles (screen pixels in, stage terms out) */
  burst(o: BurstOpts) {
    const { L } = this;
    const card = Math.abs(o.x - L.cx) < L.u * 1.6 && Math.abs(o.y - L.cy) < L.u * 1.6;
    const b: Burst = {
      t: this.stampAt ?? this.now, seed: hash(this.trace.seed, this.trace.bursts.length + 1), a: card ? 0 : 1,
      x: card ? (o.x - L.cx) / L.u : o.x / L.W, y: card ? (o.y - L.cy) / L.u : o.y / L.H,
      colors: o.colors, count: Math.min(o.count, 320), speed: o.speed ?? 10, gravity: o.gravity ?? 0.26, size: o.size ?? 1, spread: o.spread ?? Math.PI * 2,
      up: o.up ?? 0.3, kind: o.kind ?? 'mix', life: o.life ?? 1, drag: o.drag ?? 0.982, emojis: o.emojis, angle: o.angle ?? null,
      ring: o.ring != null ? o.ring / L.u : null, area: o.area ? (card ? [o.area[0] / L.u, o.area[1] / L.u] : [o.area[0] / L.W, o.area[1] / L.H]) : null,
    };
    this.trace.bursts.push(b);
  }

  /** advance to time t (ms since the roll opened) */
  tick(t: number) {
    this.now = t;
    if (this.queue.length) {
      this.queue.sort((a, b) => a.at - b.at);
      while (this.queue.length && this.queue[0].at <= t) { const q = this.queue.shift()!; const keep = this.now; this.now = q.at; q.f(); this.now = keep; }
    }
    if (this.phase === 'drop' && t >= this.trace.drop) {
      this.now = this.trace.drop;
      this.burst({ x: this.L.cx, y: this.L.cy, colors: INK, count: 34, speed: 7.5, gravity: 0.34, up: 0.15, kind: 'drop', life: 0.8 });
      this.h.buzz?.('medium');
      this.setPhase('spin');
      this.startStep(0, this.trace.drop);
      this.now = t;
    }
    if (this.phase === 'spin') this.spin(t);
    if (this.phase === 'enchant') this.enchanting(t);
  }

  private startStep(i: number, t: number) {
    const prev = this.trace.steps[i - 1];
    const quick = i > 0 && this.o.quickRerolls();
    const s: Step = { type: '', rarity: 'common', shiny: false, tReel: null, quick, seed: hash(this.trace.seed, 1000 + i) };
    if (this.result) this.fill(s, i);
    // the drum carries on from where the last roll left it
    s.rStart = t;
    s.rReel = { t0: t, p0: prev?.rReel ? reelPos(prev.rReel, t) : this.rnd() * NR, v: i > 0 ? 30 : this.o.reduce ? 40 : 24, lands: [] };
    this.trace.steps.push(s);
    this.h.step?.(i);
  }

  private spin(t: number) {
    const i = this.trace.steps.length - 1, s = this.trace.steps[i];
    const rr = s?.rReel;
    if (!rr || s.rLock != null) return;
    const reduce = this.o.reduce;
    if (!rr.lands.length) {
      // a few turns of the drum at least (fewer on a reroll; none on a quick one)
      const min = reduce || s.quick ? 0 : i > 0 ? 600 : 900;
      if (this.result && (this.skipping || t - rr.t0 > min)) {
        // an Enchanted roll: the drum breaks off mid-spin and the transformation takes over
        if (this.result.enchant) { this.enchant(t); return; }
        this.landRarity(s, i, t, this.skipping);
      } else this.ticks(`r${i}`, rr, t, NR, null);
      return;
    }
    const l = lastLand(rr, t)!;
    if (this.skipping && l.D > 500 && !this.skipLanded.has(`r${i}`)) { this.skipLanded.add(`r${i}`); this.landRarity(s, i, t, true); }
    // the build-up: Epic and up charge the canvas for the last stretch
    const tier = rarityTier(s.rarity);
    if (s.charge == null && tier >= 2 && !reduce && (t - l.t) / l.D > 0.5) { s.charge = t; this.h.sound?.('charge', tier); }
    this.ticks(`r${i}`, rr, t, NR, 'tickRarity');
    if (t >= reelEnd(rr)) this.lockRarity(s, i, t);
  }

  /** a tick of the phone (and a click) for each row that passes the window as the drum lands — every third while it
   *  spins freely */
  private ticks(key: string, r: Reel, t: number, n: number, sound: 'tickRarity' | null) {
    const k = Math.round(reelPos(r, t));
    if (this.centers[key] === k) return;
    const first = this.centers[key] == null;
    this.centers[key] = k;
    if (first) return;
    if (sound || k % 3 === 0) this.h.buzz?.('light');
    if (sound) this.h.sound?.(sound, ((k % n) + n) % n);
  }

  private landRarity(s: Step, i: number, t: number, quickIn: boolean) {
    const r = s.rReel!, reduce = this.o.reduce;
    const f = s.rarity, tr = rarityTier(f);
    const quick = quickIn || !!s.quick;
    const fi = Math.max(0, RARITY_ORDER.indexOf(f));
    const pos = reelPos(r, t);
    const dist = NR + (quick ? 0 : tr * 3); // always through every rarity at least once
    let pT = Math.ceil((pos + dist - fi) / NR) * NR + fi;
    if (pT < pos + dist) pT += NR;
    // a near miss: low rolls tease the next rarity up before clicking back; big ones crawl straight in
    const ov = reduce ? 0 : tr >= 3 ? 0.16 : 0.6;
    const D = reduce ? 450 : s.quick ? 380 : quick ? 900 : Math.min(3600, Math.max(1300, ((3 * (pT + ov - pos)) / r.v) * 1000) + tr * 180);
    r.lands.push({ t, p0: pos, pT, ov, D, settle: quick || reduce ? 120 : 420 });
    void i;
  }

  private lockRarity(s: Step, i: number, t: number) {
    s.rLock = t;
    this.h.lock?.(i);
    if (this.multi) {
      // one of Luck's rolls lands: into the tray it goes, then the next — or, after the last, you choose
      const n = this.result!.choices!.length, f = rarityInfo(s.rarity), tier = rarityTier(s.rarity);
      if (!this.o.reduce) this.burst({ x: this.L.cx, y: this.L.cy, colors: [f.color, f.glow, '#fff'], count: 50 + tier * 25, speed: 10, kind: 'spark' });
      this.h.buzz?.(tier >= 3 ? 'heavy' : 'medium');
      this.h.sound?.('land', tier);
      this.h.landed?.(i, s.rarity);
      const gap = this.o.reduce ? 0 : this.o.quickRerolls() ? 180 : 700;
      this.later(gap, () => {
        if (i < n - 1) this.startStep(i + 1, this.now);
        else {
          const best = bestIdx(this.result!.choices!, this.result!.choiceShiny);
          this.trace.pick = { t0: this.now, sel: best };
          this.setPhase('pick');
          this.h.pick?.(best);
        }
      });
      return;
    }
    this.h.sound?.('land', rarityTier(s.rarity));
    this.later(this.o.reduce ? 0 : 110, () => this.reveal(this.now));
  }

  private enchant(t: number) {
    this.trace.enchant = { t0: t };
    this.enchantBeats = 0;
    this.setPhase('enchant');
    this.h.sound?.('enchant');
    if (this.o.reduce) this.later(400, () => this.reveal(this.now));
  }
  private enchanting(t: number) {
    const e = this.trace.enchant!, k = this.result?.enchant;
    if (!k || this.o.reduce) return;
    const kc = kindInfo(k.kind);
    const et = t - e.t0, { cx, cy, u } = this.L;
    const beat = (n: number, at: number, f: () => void) => { if (this.enchantBeats < n && et >= at) { this.enchantBeats = n; const keep = this.now; this.now = e.t0 + at; f(); this.now = keep; } };
    beat(1, 0, () => { this.h.buzz?.('heavy'); this.burst({ x: cx, y: cy, colors: ['#B26BFF', '#2A0A4D', '#FFE8A3'], count: 60, speed: 9, kind: 'spark' }); });
    beat(2, 350, () => { this.burst({ x: cx, y: cy, colors: ['#FFE8A3', '#B26BFF', '#fff'], count: 140, speed: 6, ring: u * 0.9, kind: 'glitter', life: 1.2 }); this.h.buzz?.('medium'); });
    beat(3, 1300, () => this.h.buzz?.('medium'));
    beat(4, 2100, () => {
      this.burst({ x: cx, y: cy, colors: [kc.a, kc.b, '#FFE8A3', '#fff'], count: 280, speed: 16, kind: 'spark' });
      this.burst({ x: cx, y: cy, colors: ['#fff'], count: 24, speed: 10, kind: 'emoji', emojis: [kc.emoji, '✨'], life: 1.4 });
      this.h.buzz?.('heavy');
    });
    if (et >= 3500) this.reveal(t);
  }

  private reveal(t: number) {
    if (this.phase === 'reveal') return;
    this.now = t;
    const tr = this.trace, f = tr.final;
    if (tr.enchant && tr.enchant.t1 == null) tr.enchant.t1 = t;
    tr.reveal = t;
    this.setPhase('reveal');
    this.h.reveal?.();
    const final = f.enchant ? 'enchanted' as RarityId : f.rarity;
    const info = rarityInfo(final), tier = rarityTier(final), ultra = tier >= 5 || !!f.enchant;
    const ty = PLOT_TYPES[f.type as keyof typeof PLOT_TYPES];
    this.h.buzz?.(tier >= 3 ? 'heavy' : 'success');
    this.h.sound?.('reveal', ultra ? 5 : tier);
    if (this.o.reduce) return;
    const { cx: x, cy: y, u, W } = this.L;
    const stamp = (ms: number, g: () => void) => { const keep = this.stampAt; this.stampAt = t + ms; g(); this.stampAt = keep; };
    const colors = [info.color, info.glow, '#ffffff', ty?.a ?? info.color, ty?.b ?? info.glow];
    const counts = [80, 110, 150, 200, 260, 320];
    this.burst({ x, y, colors, count: counts[tier], speed: 11 + tier * 1.6, size: 1 + tier * 0.08 });
    if (tier >= 2) stamp(320, () => this.burst({ x, y, colors, count: Math.round(counts[tier] * 0.45), speed: 7, kind: 'spark' }));
    if (tier >= 3 || f.shiny) {
      // a glitter shower from the top
      const rain = (n: number) => this.burst({ x: this.rnd() * W, y: -10, colors: ultra ? RAINBOW : [info.glow, '#fff', info.color], count: n, speed: 3, gravity: 0.12, up: -0.4, spread: Math.PI * 0.9, kind: 'glitter', life: 1.4 });
      for (let i = 0; i < (ultra ? 9 : 4); i++) stamp(500 + i * 330, () => { rain(16); rain(16); });
    }
    if (ultra) stamp(900, () => this.burst({ x, y, colors, count: 160, speed: 15, kind: 'spark' }));
    tr.shakes.push({ t, k: tier >= 5 ? 3 : tier >= 3 ? 2 : 1 });
    if (tier >= 4) this.later(320, () => this.h.buzz?.('heavy'));
    const overlay = celebrate(final, f.shiny, { fx: this, c: { x, y, w: u }, w: this.L.W, h: this.L.H, later: (ms, g) => stamp(ms, g) });
    if (overlay) tr.overlay = { t, kind: overlay };
  }
}

/** Re-create a roll that was never recorded (an older plot, a demo): the director run on a pretend clock. */
export function recreate(input: RollInput, L: Layout, o: { pickAfter?: number; user?: Trace['user']; seed?: number } = {}): Trace {
  const d = new Director(L, { reduce: false, quickRerolls: () => false, seed: o.seed, user: o.user });
  d.setResult(input);
  let t = 0;
  for (; t < 60_000 && d.phase !== 'reveal'; t += 1000 / 60) {
    d.tick(t);
    if (d.phase === 'pick' && t - (d.trace.pick?.t0 ?? t) >= (o.pickAfter ?? 1200)) d.pick(d.trace.final.kept ?? 0);
  }
  for (let k = 0; k < 120; k++, t += 1000 / 60) d.tick(t);
  d.trace.recreated = true;
  return d.trace;
}
