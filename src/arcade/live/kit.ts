// Shared bits for the Live Arena games. Each game is a pure simulation (run by the match host) plus a renderer
// (run by everyone, from the host's snapshots). Snapshots are plain JSON, kept small: they go out ~10 times a
// second over the room's realtime channel.
export type ArenaMode = 'duel' | 'teams' | 'ffa' | 'coop';
export type Inp = { x: number; y: number; b: boolean };
export type LP = { id: string; slot: number; team: number | null; name: string; color: string };
export type LiveResult = { places?: Record<string, number>; winner?: number | null; waves?: number };
export type Renderer<W> = (g: CanvasRenderingContext2D, cw: number, ch: number, w: W, prev: W | null, alpha: number, me: string, t: number) => void;
export interface LiveDef<W> {
  id: string;
  controls: { stick: 'xy' | 'x'; action?: string };
  init(players: LP[], seed: number, mode: ArenaMode): W;
  /** host only: advance the world */ step(w: W, inputs: Record<string, Inp>, dt: number): void;
  /** host only: done? */ result(w: W): LiveResult | null;
  /** what goes over the wire (default: the world itself) */ snap?(w: W): unknown;
  renderer(): Renderer<W>;
}

export const ARENA_GAMES: Record<string, { name: string; emoji: string; color: string; modes: ArenaMode[]; blurb: string; how: string }> = {
  paintwars: { name: 'Paint Wars', emoji: '🎨', color: '#FF3D9A', modes: ['ffa', 'teams', 'duel'], blurb: 'Roll over the floor to paint it your colour. Most paint when time runs out wins.', how: 'Drag to roll · 💥 SPLAT paints a big blob (every 6s) · grab ⚡ for speed' },
  bumper: { name: 'Bumper Orbs', emoji: '🫧', color: '#22E3FF', modes: ['duel', 'ffa', 'teams'], blurb: 'Shove everyone off the shrinking platform. Last one on wins the round.', how: 'Drag to roll · 💨 DASH to slam into people · stay on the platform!' },
  trails: { name: 'Ink Trails', emoji: '〰️', color: '#B6FF3D', modes: ['duel', 'ffa'], blurb: 'Steer your ink line and never cross a trail. Last one drawing wins the round.', how: 'Drag left / right to steer (or tap the sides) · slip through the gaps!' },
  volley: { name: 'Bubble Volley', emoji: '🏐', color: '#FFB13D', modes: ['duel', 'teams'], blurb: 'Bounce the bubble over the net. First side to 7 wins.', how: 'Drag left / right to move · ⬆ JUMP to hit it high' },
  meteor: { name: 'Meteor Guard', emoji: '☄️', color: '#B57BFF', modes: ['coop'], blurb: 'Together, guard the core from waves of meteors. How many waves can you last?', how: 'Drag to swing your shield round the core · 💫 PULSE clears nearby meteors (every 12s)' },
};
export const MODE_INFO: Record<ArenaMode, { label: string; emoji: string; short: string; need: [number, number] }> = {
  duel: { label: '1v1', emoji: '⚔️', short: 'Head to head', need: [2, 2] },
  teams: { label: '2v2', emoji: '🤝', short: 'Two teams of two', need: [4, 4] },
  ffa: { label: 'Free for all', emoji: '👑', short: 'Everyone for themselves (2-4)', need: [2, 4] },
  coop: { label: 'Co-op', emoji: '🛡️', short: 'All together (2-4)', need: [2, 4] },
};
export const SLOT_COLORS = ['#FF3D9A', '#22E3FF', '#B6FF3D', '#FFB13D'];
export const TEAM_COLORS = ['#FF3D9A', '#22E3FF'];
export const TEAM_NAMES = ['Pink team', 'Cyan team'];

export const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** fit a world box (ww x wh) into the canvas, centred, leaving room for the HUD at the top */
export function fit(cw: number, ch: number, ww: number, wh: number, top = 56, bottom = 70) {
  const s = Math.min(cw / ww, (ch - top - bottom) / wh);
  return { s, ox: (cw - ww * s) / 2, oy: top + (ch - top - bottom - wh * s) / 2 };
}
export function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string, blur = 12) {
  g.shadowColor = c; g.shadowBlur = blur; g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
}
export function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size = 12, color = '#fff') {
  g.font = `800 ${size}px ui-rounded, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
}
export function bg(g: CanvasRenderingContext2D, cw: number, ch: number, a = '#0B0626', b = '#02010A') {
  const gr = g.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
}
/** places from points (higher is better; ties share a place) */
export function placesFrom(points: Record<string, number>) {
  const ids = Object.keys(points).sort((a, b) => points[b] - points[a]);
  const out: Record<string, number> = {};
  ids.forEach((id, i) => { out[id] = i > 0 && points[id] === points[ids[i - 1]] ? out[ids[i - 1]] : i + 1; });
  return out;
}
/** an entity's position between two snapshots */
export function ip<T extends { x: number; y: number }>(cur: T, prev: T | undefined, a: number) {
  return prev ? { x: lerp(prev.x, cur.x, a), y: lerp(prev.y, cur.y, a) } : { x: cur.x, y: cur.y };
}
export const colorOf = (p: LP, mode: ArenaMode) => (mode === 'teams' && p.team != null ? TEAM_COLORS[p.team] : SLOT_COLORS[p.slot % 4]);
