// The roll, written down as it happens. Everything the screen shows is a pure function of this record and the clock —
// the reels' motion (their free spin and every landing), the ink, each particle burst (with its seed), the shakes,
// the Luck rerolls, the pick, the Enchanted transformation and the reveal — so a clip replays the roll exactly as it
// went, frame for frame. Plain JSON: small enough to keep a history of past rolls on the phone.
import type { PlotTypeId } from '../../shared/grid';
import type { RarityId } from '../../shared/rarity';
import { PLOT_TYPES } from '../../map/plotStyle';
import { easeOutBack, easeOutCubic } from './math';

export type Overlay = 'dark' | 'night' | 'gold' | 'fire' | 'void' | null;
export type EnchantBrief = { id: string; kind: string; serial: number; sigil: number; minted?: number; population?: number; born_place?: string | null };

/** one landing of a reel: from p0 (at time t) onto row pT, overshooting by ov, over D ms, then settling back */
export type Land = { t: number; p0: number; pT: number; ov: number; D: number; settle: number };
/** a reel: spinning freely at v rows a second from p0 at t0, until (and between) its landings */
export type Reel = { t0: number; p0: number; v: number; lands: Land[] };

export function reelPos(r: Reel, t: number): number {
  let l: Land | null = null;
  for (const x of r.lands) if (x.t <= t) l = x;
  if (!l) return r.p0 + (r.v * Math.max(0, t - r.t0)) / 1000;
  const x = (t - l.t) / l.D;
  if (x < 1) return l.p0 + (l.pT + l.ov - l.p0) * easeOutCubic(Math.max(0, x));
  const y = Math.min(1, (t - l.t - l.D) / l.settle);
  return l.pT + l.ov * (1 - easeOutBack(y));
}
/** how far into its (last) landing a reel is: 0 spinning, 1 done */
export function reelLanding(r: Reel, t: number) {
  const l = lastLand(r, t);
  return l ? Math.min(1, (t - l.t) / l.D) : 0;
}
export const lastLand = (r: Reel, t: number) => { let l: Land | null = null; for (const x of r.lands) if (x.t <= t) l = x; return l; };
export const reelEnd = (r: Reel) => { const l = r.lands[r.lands.length - 1]; return l ? l.t + l.D + l.settle : Infinity; };

/** one of the rolls (Luck gives several): its rarity drum, and the minigame (plot type) it lands with */
export type Step = {
  type: string; rarity: RarityId; shiny: boolean;
  /** (rolls from the premium-reel days: a minigame reel before the rarity; null in the classic roll) */
  tReel: Reel | null;
  tLock?: number;
  /** the rarity reel */
  rReel?: Reel;
  rStart?: number;
  rLock?: number;
  /** Epic and up: when the canvas started to charge */
  charge?: number;
  /** quick reroll: both reels together */
  quick?: boolean;
  /** this step's ink splash */
  seed: number;
};

/** a particle burst, in stage terms: `a` 0 = round the card (in card widths), 1 = the screen (fractions) */
export type Burst = {
  t: number; seed: number; a: 0 | 1; x: number; y: number;
  colors: string[]; count: number; speed: number; gravity: number; size: number; spread: number; up: number;
  kind: 'mix' | 'drop' | 'spark' | 'glitter' | 'emoji' | 'streak'; life: number; drag: number;
  emojis?: string[]; angle?: number | null; ring?: number | null; area?: [number, number] | null;
};

export type Final = {
  rarity: RarityId; type: string; shiny: boolean; usd: number; first: boolean;
  hot?: boolean; lucky?: boolean; guaranteed?: string | null; name?: string | null;
  choices?: RarityId[] | null; choiceTypes?: string[] | null; choiceShiny?: boolean[] | null;
  kept: number; enchant?: EnchantBrief | null;
};

export type Trace = {
  v: 2;
  id: string;
  /** how it was drawn: the classic roll (one rarity drum, the minigame tag as it lands). Absent: an older roll with
   *  the minigame reel and the rarity materials, still drawn that way */
  look?: 'classic';
  /** wall-clock start (ms since epoch) */
  at: number;
  seed: number;
  reduce: boolean;
  /** the card's size on the screen it was rolled on (particles scale from it) */
  u0: number;
  /** the falling drop (ms; 0 with reduced motion) */
  drop: number;
  steps: Step[];
  pick?: { t0: number; t1?: number; sel: number };
  enchant?: { t0: number; t1?: number };
  reveal?: number;
  overlay?: { t: number; kind: Overlay };
  shakes: { t: number; k: 1 | 2 | 3 }[];
  bursts: Burst[];
  final: Final;
  user?: { username: string; accent?: string };
  /** a roll re-created from a plot (not recorded live) */
  recreated?: boolean;
};

export const TYPE_ORDER = Object.keys(PLOT_TYPES) as PlotTypeId[];
export const isReelType = (t: string | null | undefined): t is PlotTypeId => !!t && (TYPE_ORDER as string[]).includes(t);

/** how long the reveal holds in a clip */
export const HOLD = 4200;
/** the pick screen, in a clip */
export const PICK_MONTAGE = 1600;
/** the longest the drum spins waiting for the server, in a clip (the classic roll always spins 0.9 s first) */
const WAIT_MAX = 1200;

/** A clip's timeline: clip time → roll time, skipping the dull bits (a slow server, a long think over the pick). */
export type Seg = { c0: number; c1: number; t0: number; kind: 'play' | 'pick' };
export function clipTimeline(tr: Trace): { segs: Seg[]; total: number } {
  const end = (tr.reveal ?? lastEvent(tr)) + HOLD;
  const cuts: { from: number; to: number; kind: 'cut' | 'pick' }[] = [];
  const s0 = tr.steps[0];
  const r0 = s0?.tReel ?? s0?.rReel;
  if (r0 && r0.lands.length) {
    const wait = r0.lands[0].t - r0.t0, minWait = 420;
    if (wait > WAIT_MAX) cuts.push({ from: r0.t0 + minWait, to: r0.lands[0].t - (WAIT_MAX - minWait), kind: 'cut' });
  }
  if (tr.pick && tr.pick.t1 != null) cuts.push({ from: tr.pick.t0, to: tr.pick.t1, kind: 'pick' });
  cuts.sort((a, b) => a.from - b.from);
  const segs: Seg[] = [];
  let c = 0, t = 0;
  for (const k of cuts) {
    if (k.from > t) { segs.push({ c0: c, c1: c + (k.from - t), t0: t, kind: 'play' }); c += k.from - t; }
    if (k.kind === 'pick') { segs.push({ c0: c, c1: c + PICK_MONTAGE, t0: k.from, kind: 'pick' }); c += PICK_MONTAGE; }
    t = Math.max(t, k.to);
  }
  segs.push({ c0: c, c1: c + Math.max(0, end - t), t0: t, kind: 'play' });
  return { segs, total: c + Math.max(0, end - t) };
}
/** where clip time `c` falls: the roll's time, and (in the pick montage) how far through it */
export function clipAt(tl: { segs: Seg[] }, c: number): { t: number; pick: number | null } {
  const s = tl.segs.find((x) => c < x.c1) ?? tl.segs[tl.segs.length - 1];
  if (s.kind === 'pick') return { t: s.t0, pick: Math.min(1, (c - s.c0) / (s.c1 - s.c0)) };
  return { t: s.t0 + (c - s.c0), pick: null };
}
const lastEvent = (tr: Trace) => Math.max(0, ...tr.steps.map((s) => Math.max(s.rLock ?? 0, s.tLock ?? 0)), tr.enchant?.t1 ?? 0, tr.pick?.t1 ?? 0);

/** the frame a snip or a thumbnail shows: the reveal in full swing */
export const posterTime = (tr: Trace) => (tr.reveal ?? lastEvent(tr)) + 1700;
