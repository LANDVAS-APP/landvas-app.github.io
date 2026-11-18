// The haptic language of the apps: patterns you feel in your hand, not single taps. Each rarity has its own heartbeat as
// the roll's drum slows (so you feel it before you see it), an enchantment arrives with a summoning rumble, a Primordial
// with a long rolling quake; the Leviathan's footsteps get heavier as it nears your land; a fox patters up to your egg;
// the sonar pings faster as you face what you're looking for.
//
// A pattern is a list of [ms from now, hit]. On iOS each hit is a Taptic Engine impact (the web view has no vibrate),
// on Android a short vibration — sequenced with timers on both, so one pattern feels the same everywhere. Nothing
// here runs on the website, and nothing runs with Settings → Haptic feedback off.
import { useUi } from '../lib/store';
import { isNative, platform } from './native';

export type Hit = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';
export type Pattern = [number, Hit][];

type H = typeof import('@capacitor/haptics');
let mod: H | null = null;
let loading: Promise<unknown> | null = null;
function load() {
  if (!loading && isNative()) loading = import('@capacitor/haptics').then((m) => { mod = m; }).catch(() => {});
}

/** haptics are on: the app (not the website), and the player hasn't turned them off */
export const canFeel = () => isNative() && useUi.getState().settings.haptics !== false;

/** one hit, now */
export function hit(h: Hit) {
  if (!canFeel()) return;
  load();
  if (!mod) return; // (the first call loads the plugin; it's there by the next)
  const { Haptics, ImpactStyle, NotificationType } = mod;
  if (h === 'success' || h === 'warning' || h === 'error') {
    void Haptics.notification({ type: h === 'success' ? NotificationType.Success : h === 'warning' ? NotificationType.Warning : NotificationType.Error }).catch(() => {});
  } else if (platform() === 'android' && h === 'heavy') {
    // Android's "heavy click" is a short tick on many phones: a real 38 ms buzz reads as heavy
    void Haptics.vibrate({ duration: 38 }).catch(() => {});
  } else {
    void Haptics.impact({ style: h === 'heavy' ? ImpactStyle.Heavy : h === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
  }
}

/** Plays a pattern. Each `channel` plays one pattern at a time (a new one cuts the old); returns a stop. */
const channels = new Map<string, number[]>();
export function play(p: Pattern, channel = 'fx'): () => void {
  stop(channel);
  if (!canFeel() || !p.length) return () => {};
  load();
  const ids = p.map(([at, h]) => window.setTimeout(() => hit(h), Math.max(0, at)));
  channels.set(channel, ids);
  const end = Math.max(...p.map(([at]) => at));
  const done = window.setTimeout(() => { if (channels.get(channel) === ids) channels.delete(channel); }, end + 50);
  ids.push(done);
  return () => { if (channels.get(channel) === ids) stop(channel); };
}
export function stop(channel = 'fx') {
  for (const id of channels.get(channel) ?? []) clearTimeout(id);
  channels.delete(channel);
}
/** a pattern is playing on that channel */
export const playing = (channel: string) => channels.has(channel);

// ---- the vocabulary -------------------------------------------------------------------------------------------------
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A heartbeat for `ms`, its pace rising from bpm0 to bpm1 (the anticipation). `beat` is the hits of one beat, timed from
 * its start (lub-dub, lub-dub-dub…); `sparkle` adds three tiny taps after each beat (a shiny).
 */
export function heartbeat(ms: number, bpm0: number, bpm1: number, beat: Pattern, sparkle = false, start = 0): Pattern {
  const out: Pattern = [];
  for (let t = start; t < ms;) {
    for (const [at, h] of beat) if (t + at < ms) out.push([t + at, h]);
    if (sparkle) for (let k = 0; k < 3; k++) if (t + 260 + k * 45 < ms) out.push([t + 260 + k * 45, 'light']);
    t += 60_000 / lerp(bpm0, bpm1, Math.min(1, t / ms));
  }
  return out;
}

/** a rumble: hits every `gap` ms whose strength follows `shape` (0..1 over the rumble → light, medium, heavy) */
export function rumble(ms: number, shape: (f: number) => number, gap = 45, start = 0): Pattern {
  const out: Pattern = [];
  for (let t = 0; t < ms; t += gap) {
    const s = shape(t / ms);
    if (s < 0.08) continue;
    out.push([start + t, s > 0.66 ? 'heavy' : s > 0.33 ? 'medium' : 'light']);
  }
  return out;
}

/** The roll's heartbeat, as the drum slows onto `rarity` for `ms` — every rarity beats its own way. */
export function rollHeart(tier: number, rarity: string, shiny: boolean, ms: number): Pattern {
  const lead = 120; // (a breath after the drum starts slowing)
  switch (true) {
    case tier >= 6: // a Primordial: slow, deep, ominous — then the ground starts to move under it
      return [...heartbeat(ms, 46, 58, [[0, 'heavy'], [220, 'heavy']], shiny, lead), ...rumble(Math.min(900, ms * 0.35), (f) => f * 0.7, 70, ms - Math.min(900, ms * 0.35))];
    case tier === 5: // an ultra: racing, and a rumble building under the last stretch
      return [...heartbeat(ms, 120, 196, [[0, 'heavy'], [120, 'medium']], shiny, lead), ...rumble(Math.min(700, ms * 0.3), (f) => 0.3 + f * 0.6, 55, ms - Math.min(700, ms * 0.3))];
    case tier === 4: // Mythic: a racing heart
      return heartbeat(ms, 110, 170, [[0, 'heavy'], [130, 'medium']], shiny, lead);
    case tier === 3: // Legendary: lub-dub-dub
      return heartbeat(ms, 90, 128, [[0, 'heavy'], [140, 'medium'], [270, 'light']], shiny, lead);
    case tier === 2: // Epic
      return heartbeat(ms, 80, 110, [[0, 'medium'], [150, 'light']], shiny, lead);
    case tier === 1: // Rare: a calm lub-dub
      return heartbeat(ms, 66, 82, [[0, 'light'], [150, 'light']], shiny, lead);
    default: // Common one soft beat, Uncommon two — and a shiny sparkles whatever it is
      return [[Math.round(ms * 0.55), 'light'], ...(rarity === 'uncommon' ? [[Math.round(ms * 0.55) + 170, 'light'] as [number, Hit]] : []),
        ...(shiny ? [0, 1, 2].map((k) => [Math.round(ms * 0.55) + 320 + k * 45, 'light'] as [number, Hit]) : [])];
  }
}

/** Enchanted: the drum breaks off and something is summoned — taps quickening into a rush, then a slam. */
export function summon(): Pattern {
  const out: Pattern = [];
  let t = 0, gap = 210;
  while (t < 1500) { out.push([t, t > 1000 ? 'medium' : 'light']); t += gap; gap = Math.max(32, gap * 0.82); }
  out.push([1560, 'heavy'], [1700, 'heavy'], [1900, 'success']);
  return out;
}

/** A Primordial lands: a long rolling quake that swells and dies away. */
export const quake = (ms = 2600): Pattern => rumble(ms, (f) => Math.sin(Math.PI * Math.min(1, f * 1.15)) * (0.75 + 0.25 * Math.sin(f * 40)), 48);

/** what a reveal feels like, past the land's own thud (ultras rumble, Primordials quake) */
export function revealFeel(tier: number): Pattern {
  if (tier >= 6) return quake(2600);
  if (tier === 5) return [...rumble(1100, (f) => 1 - f * 0.8, 50), [1250, 'success']];
  if (tier === 4) return [[0, 'heavy'], [110, 'heavy'], [380, 'success']];
  if (tier === 3) return [[0, 'heavy'], [260, 'success']];
  return [];
}

/** one of the Leviathan's footsteps: `w` 0 (far off: a faint thud) … 1 (on your doorstep: it shakes) */
export function footstep(w: number): Pattern {
  if (w > 0.85) return [[0, 'heavy'], [90, 'heavy'], [260, 'medium']];
  if (w > 0.6) return [[0, 'heavy'], [140, 'light']];
  if (w > 0.3) return [[0, 'medium']];
  return [[0, 'light']];
}

/** a fox's paws, pattering up to your egg */
export const foxPatter = (): Pattern => [[0, 'light'], [70, 'light'], [150, 'light'], [215, 'light'], [340, 'light'], [400, 'light'], [470, 'medium']];

/** hot / warm / cold, as something you feel (the hidden Leviathan's search) */
export function seekFeel(h: 'cold' | 'warm' | 'hot'): Pattern {
  if (h === 'hot') return rumble(1400, () => 0.9, 110);
  if (h === 'warm') return [[0, 'medium'], [260, 'medium'], [520, 'medium']];
  return [[0, 'light']];
}

/** the sonar: how often it pings (ms) — facing it dead on, a rapid pulse; facing away, slow */
export const pingEvery = (facing: number) => Math.round(160 + (Math.min(180, Math.max(0, facing)) / 180) ** 1.4 * 1340);
