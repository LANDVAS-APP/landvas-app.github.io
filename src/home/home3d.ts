// A player's home in 3D: a dollhouse-view room you walk round as your explorer. The left wall has a door to each
// of their places (arcade, sanctuary, farm, business) with its career plaque above; the back wall has a big window
// (a view of the owner's choosing, by the real time of day) between two framed pieces of their art; everything
// else is theirs to furnish. Their Inkborn wander about and nap in the pet bed; live visitors walk about too.
// Decorate mode: a bird's-eye view; tap a piece to pick it up, drag it about, turn it, recolour it or put it away.
import * as THREE from 'three';
import { cleanGenome, type Genome } from '../inkborn/genome';
import { drawCreature, type CreatureState } from '../inkborn/rig';
import { adaptiveDpr, isPhone, sceneAntialias, sceneDpr } from '../lib/gfx';
import { ITEM, buildItem, makeKit, type Built } from './furniture';

export type Placed = { i: string; x: number; z: number; r: number; c?: number };
export type HomeStyle = { wall?: string; floor?: string; view?: string; mood?: string; wall_color?: string; floor_color?: string; trim?: string };
export type HomeDoor = { kind: string; label: string; emoji: string; color: string; plaque: string; state: 'open' | 'locked' | 'empty'; here?: number };
export type HomeCreature = { id: string; name: string; genome: unknown };
export type HomeSpot = { kind: 'door'; door: string } | { kind: 'art'; i: number } | { kind: 'item'; i: number; id: string };
export type HomeOpts = {
  canvas: HTMLCanvasElement; explorerUrl: string; reduceMotion?: boolean;
  onNear?(s: HomeSpot | null): void;
  /** decorate mode: a piece was picked (index into the layout) or let go (null) */ onSelect?(i: number | null): void;
  /** decorate mode: the layout changed */ onLayout?(l: Placed[]): void;
  onCreature?(c: HomeCreature): void;
};

export const ROOM = { W: 14, D: 12, H: 3.4 };
const W = ROOM.W, D = ROOM.D, H = ROOM.H;
export const WINDOW = { x0: -1.7, x1: 1.7, y0: 0.85, y1: 2.75 };
export const ART_X = [-4.4, 4.4];
export const DOOR_Z = [-3.9, -1.3, 1.3, 3.9];
export const DEFAULT_STYLE: Required<HomeStyle> = { wall: 'paint', floor: 'oak', view: 'forest', mood: 'warm', wall_color: '#E9DCC9', floor_color: '#C69C6D', trim: '#FFFFFF' };

const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const shade = (hex: string, k: number) => { const c = new THREE.Color(hex); const h = { h: 0, s: 0, l: 0 }; c.getHSL(h); c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + k))); return '#' + c.getHexString(); };
const rot = (p: Placed) => (p.r % 2 ? [ITEM[p.i]?.d ?? 1, ITEM[p.i]?.w ?? 1] : [ITEM[p.i]?.w ?? 1, ITEM[p.i]?.d ?? 1]);
export const INTERACT = new Set(['game_table', 'card_table', 'record_player', 'jukebox', 'guestbook']);
const solidItem = (id: string) => { const m = ITEM[id]?.mount; return m === 'floor' && !ITEM[id]?.small; };

/** Where wall pieces hang: the right wall, or the bits of the back wall the window and the art leave free. */
export function snapWall(x: number, z: number, w: number): { x: number; z: number; r: number } {
  const backOk = (cx: number) => cx - w / 2 > -5.2 && cx + w / 2 < 6.4 && !(cx + w / 2 > WINDOW.x0 - 0.15 && cx - w / 2 < WINDOW.x1 + 0.15) && !ART_X.some((a) => cx + w / 2 > a - 0.9 && cx - w / 2 < a + 0.9);
  const toRight = Math.abs(x - 6.9) < Math.abs(z + 5.9) || !backOk(x);
  if (toRight) return { x: 6.9, z: Math.max(-5.4 + w / 2, Math.min(5.6 - w / 2, z)), r: 3 };
  return { x, z: -5.9, r: 0 };
}

// ---- surfaces -------------------------------------------------------------------------------------------------------
function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function noise(g: CanvasRenderingContext2D, w: number, h: number, a = 0.05, n = 6000) { const r = rng(9); for (let i = 0; i < n; i++) { g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * a})` : `rgba(255,255,255,${r() * a})`; g.fillRect(r() * w, r() * h, 2, 2); } }
export function wallTexture(kind: string, color: string) {
  return tex(512, 512, (g) => {
    const S = 512, dk = shade(color, -0.08), lt = shade(color, 0.07);
    g.fillStyle = color; g.fillRect(0, 0, S, S);
    const r = rng(5);
    if (kind === 'stripes') { for (let x = 0; x < S; x += 64) { g.fillStyle = dk; g.fillRect(x, 0, 28, S); g.fillStyle = lt; g.fillRect(x + 30, 0, 3, S); } }
    else if (kind === 'floral') {
      for (let y = 0; y < S; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x < S; x += 64) {
        g.fillStyle = shade(color, -0.18); for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 6, 4, a, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#F2C14E'; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
        g.strokeStyle = shade(color, -0.25); g.lineWidth = 2; g.beginPath(); g.moveTo(x + 10, y + 10); g.quadraticCurveTo(x + 22, y + 14, x + 26, y + 26); g.stroke();
      }
    } else if (kind === 'brick') {
      g.fillStyle = shade(color, -0.25); g.fillRect(0, 0, S, S);
      for (let row = 0; row < 16; row++) for (let col = -1; col < 5; col++) {
        const x = col * 128 + (row % 2 ? 64 : 0), y = row * 32; g.fillStyle = shade(color, (r() - 0.5) * 0.12); g.fillRect(x + 3, y + 3, 122, 26);
      }
    } else if (kind === 'wood') { for (let x = 0; x < S; x += 64) { g.fillStyle = shade(color, (r() - 0.5) * 0.1); g.fillRect(x, 0, 62, S); g.fillStyle = shade(color, -0.2); g.fillRect(x + 62, 0, 2, S); for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(0,0,0,0.06)`; g.beginPath(); g.moveTo(x + 8 + k * 9, 0); g.bezierCurveTo(x + 4 + k * 9, 200, x + 14 + k * 9, 300, x + 8 + k * 9, S); g.stroke(); } } }
    else if (kind === 'stars') { const bg2 = shade(color, -0.35); g.fillStyle = bg2; g.fillRect(0, 0, S, S); for (let i = 0; i < 90; i++) { const x = r() * S, y = r() * S, s = 2 + r() * 5; g.fillStyle = r() < 0.3 ? '#FFE680' : 'rgba(255,255,255,0.85)'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? s * 0.45 : s; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); } }
    else if (kind === 'splatter') { const cols = ['#FF5FA2', '#22B8CF', '#FFE14D', '#8B5CFF', '#3DDC97']; for (let i = 0; i < 26; i++) { const x = r() * S, y = r() * S, s = 8 + r() * 26; g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.75; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); for (let k = 0; k < 7; k++) { const a = r() * 6.28, d = s + r() * s; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2 + r() * 5, 0, Math.PI * 2); g.fill(); } } g.globalAlpha = 1; }
    else if (kind === 'tiles') { for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 64) { g.fillStyle = shade(color, (r() - 0.5) * 0.06); g.fillRect(x + 2, y + 2, 60, 60); } g.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i <= 8; i++) { g.fillRect(i * 64 - 1, 0, 2, S); g.fillRect(0, i * 64 - 1, S, 2); } }
    else if (kind === 'scallop') { for (let y = -32; y < S + 32; y += 32) for (let x = (y / 32) % 2 ? 0 : 32; x < S + 64; x += 64) { g.fillStyle = (x / 64 + y / 32) % 3 < 1 ? dk : lt; g.strokeStyle = shade(color, -0.2); g.lineWidth = 2; g.beginPath(); g.arc(x, y, 32, 0, Math.PI); g.fill(); g.stroke(); } }
    noise(g, S, S, 0.035, 4000);
  });
}
export function floorTexture(kind: string, color: string) {
  return tex(1024, 1024, (g) => {
    const S = 1024, r = rng(3);
    g.fillStyle = color; g.fillRect(0, 0, S, S);
    const plank = (x: number, y: number, w: number, h: number, base: string, vertical = false) => {
      g.fillStyle = shade(base, (r() - 0.5) * 0.12); g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1.2;
      for (let k = 0; k < 5; k++) { g.beginPath(); if (vertical) { const xx = x + (k + 0.5) * (w / 5); g.moveTo(xx, y); g.bezierCurveTo(xx + 3, y + h * 0.3, xx - 3, y + h * 0.6, xx, y + h); } else { const yy = y + (k + 0.5) * (h / 5); g.moveTo(x, yy); g.bezierCurveTo(x + w * 0.3, yy + 3, x + w * 0.6, yy - 3, x + w, yy); } g.stroke(); }
      if (r() < 0.25) { g.fillStyle = 'rgba(60,30,10,0.18)'; g.beginPath(); g.ellipse(x + r() * w, y + r() * h, 6, 3, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; if (vertical) g.fillRect(x + w - 2, y, 2, h); else g.fillRect(x, y + h - 2, w, 2);
    };
    if (kind === 'oak' || kind === 'walnut') {
      const base = kind === 'walnut' ? shade(color, -0.22) : color;
      for (let row = 0; row < 8; row++) { let x = -r() * 300; while (x < S) { const len = 260 + r() * 260; plank(x, row * 128, len, 128, base); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + len - 2, row * 128, 2, 128); x += len; } }
    } else if (kind === 'herringbone') {
      g.save(); g.translate(S / 2, S / 2); g.rotate(Math.PI / 4); g.translate(-S, -S);
      for (let y = 0; y < S * 2; y += 64) for (let x = 0; x < S * 2; x += 256) { plank(x + (y / 64 % 2) * 128, y, 128, 64, color); plank(x + 128 - (y / 64 % 2) * 128, y, 64, 128, color, true); }
      g.restore();
    } else if (kind === 'checker') { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? shade(color, -0.45) : shade(color, 0.35); g.fillRect(x * 128, y * 128, 128, 128); } noise(g, S, S, 0.04); }
    else if (kind === 'carpet') { for (let i = 0; i < 60000; i++) { g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.08})` : `rgba(255,255,255,${r() * 0.08})`; g.fillRect(r() * S, r() * S, 2, 2); } }
    else if (kind === 'marble') {
      g.fillStyle = shade(color, 0.3); g.fillRect(0, 0, S, S);
      for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(90,90,100,${0.08 + r() * 0.18})`; g.lineWidth = 1 + r() * 2.5; g.beginPath(); let x = r() * S, y = r() * S; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.3) * 120; y += (r() - 0.5) * 120; g.lineTo(x, y); } g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.4)'; for (let i = 0; i <= 4; i++) { g.fillRect(i * 256 - 1, 0, 2, S); g.fillRect(0, i * 256 - 1, S, 2); }
    } else if (kind === 'tatami') {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) { const vx = (x + y) % 2 === 0; const px = x * 512, py = y * 256; g.fillStyle = shade('#C8C27A', (r() - 0.5) * 0.06); g.fillRect(px, py, 512, 256); g.strokeStyle = 'rgba(0,0,0,0.06)'; for (let k = 0; k < 64; k++) { g.beginPath(); if (vx) { g.moveTo(px, py + k * 4); g.lineTo(px + 512, py + k * 4); } else { g.moveTo(px + k * 8, py); g.lineTo(px + k * 8, py + 256); } g.stroke(); } g.strokeStyle = shade(color, -0.3); g.lineWidth = 10; g.strokeRect(px + 5, py + 5, 502, 246); }
    } else { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = shade(color, (r() - 0.5) * 0.08); g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122); } g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i <= 8; i++) { g.fillRect(i * 128 - 2, 0, 4, S); g.fillRect(0, i * 128 - 2, S, 4); } }
  });
}
/** the view from the window, by the hour where you are */
export function viewTexture(kind: string, hour: number) {
  const night = hour < 6 || hour >= 20, dusk = !night && (hour < 8 || hour >= 18);
  return tex(1024, 576, (g) => {
    const Wd = 1024, Hd = 576, r = rng(kind.length * 7);
    const sky = g.createLinearGradient(0, 0, 0, Hd);
    if (kind === 'space') { sky.addColorStop(0, '#05031A'); sky.addColorStop(1, '#1A0B3D'); }
    else if (night) { sky.addColorStop(0, '#0A1030'); sky.addColorStop(1, '#22305E'); }
    else if (dusk || kind === 'sunset') { sky.addColorStop(0, '#3B2A6E'); sky.addColorStop(0.5, '#E86B6B'); sky.addColorStop(1, '#FFC27A'); }
    else { sky.addColorStop(0, '#5AAEF0'); sky.addColorStop(1, '#CDEBFF'); }
    g.fillStyle = sky; g.fillRect(0, 0, Wd, Hd);
    if (night || kind === 'space') { for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; g.fillRect(r() * Wd, r() * Hd * 0.7, r() < 0.1 ? 3 : 1.5, r() < 0.1 ? 3 : 1.5); } }
    if (kind === 'space') {
      const pg = g.createRadialGradient(700, 220, 20, 760, 260, 200); pg.addColorStop(0, '#FF9FD6'); pg.addColorStop(1, '#5B2BC9'); g.fillStyle = pg; g.beginPath(); g.arc(760, 260, 150, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,220,255,0.6)'; g.lineWidth = 10; g.beginPath(); g.ellipse(760, 260, 250, 50, -0.3, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#C9C9D6'; g.beginPath(); g.arc(220, 140, 40, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8A8AA0'; g.beginPath(); g.ellipse(0, Hd + 300, 900, 420, 0, 0, Math.PI * 2); g.fill();
      return;
    }
    // sun or moon
    if (night) { g.fillStyle = '#F4F1DE'; g.beginPath(); g.arc(800, 110, 34, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(244,241,222,0.15)'; g.beginPath(); g.arc(800, 110, 70, 0, Math.PI * 2); g.fill(); }
    else { const y = dusk || kind === 'sunset' ? 380 : 110; const sg = g.createRadialGradient(780, y, 10, 780, y, 140); sg.addColorStop(0, '#FFF6C9'); sg.addColorStop(0.3, 'rgba(255,230,150,0.8)'); sg.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = sg; g.fillRect(600, y - 160, 360, 320); }
    if (!night) { g.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 6; i++) { const x = r() * Wd, y = 60 + r() * 150; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(x + k * 30, y + Math.sin(k) * 8, 40, 18, 0, 0, Math.PI * 2); g.fill(); } } }
    const dim = night ? 0.55 : dusk ? 0.8 : 1;
    const c = (hex: string) => shade(hex, (dim - 1) * 0.6);
    if (kind === 'city') {
      for (let layer = 0; layer < 2; layer++) {
        let x = 0; while (x < Wd) { const w = 50 + r() * 90, h = 120 + r() * (layer ? 220 : 300); const y = Hd - h - (layer ? 0 : 40);
          g.fillStyle = c(layer ? '#3A4A68' : '#6E7FA0'); g.fillRect(x, y, w, Hd - y);
          for (let wy = y + 12; wy < Hd - 10; wy += 22) for (let wx = x + 8; wx < x + w - 10; wx += 16) { if (r() < (night ? 0.45 : 0.2)) { g.fillStyle = night ? '#FFD87A' : 'rgba(200,230,255,0.6)'; g.fillRect(wx, wy, 8, 11); } }
          x += w + 4; }
      }
    } else if (kind === 'forest' || kind === 'mountains') {
      if (kind === 'mountains') { for (const [col, base, amp] of [['#8FA3BF', 330, 200], ['#6C809E', 400, 160]] as const) { g.fillStyle = c(col); g.beginPath(); g.moveTo(0, Hd); for (let x = 0; x <= Wd; x += 40) g.lineTo(x, base - Math.abs(Math.sin(x * 0.006 + base)) * amp - r() * 20); g.lineTo(Wd, Hd); g.fill(); } g.fillStyle = 'rgba(255,255,255,0.9)'; for (let x = 120; x < Wd; x += 260) { g.beginPath(); g.moveTo(x, 150 + (x % 3) * 20); g.lineTo(x - 40, 200 + (x % 3) * 20); g.lineTo(x + 40, 200 + (x % 3) * 20); g.fill(); } }
      g.fillStyle = c('#5E9C59'); g.beginPath(); g.moveTo(0, Hd); for (let x = 0; x <= Wd; x += 30) g.lineTo(x, 440 + Math.sin(x * 0.01) * 20); g.lineTo(Wd, Hd); g.fill();
      for (let i = 0; i < (kind === 'forest' ? 40 : 14); i++) { const x = r() * Wd, y = 420 + r() * 140, s = 30 + r() * 60; g.fillStyle = c(r() < 0.5 ? '#2F6B3A' : '#3E8E41'); g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x - s * 0.6, y); g.lineTo(x + s * 0.6, y); g.fill(); g.fillStyle = c('#5C3A21'); g.fillRect(x - 4, y, 8, 14); }
    } else {
      // beach / sunset: sea, sand, a palm
      g.fillStyle = c(kind === 'sunset' ? '#3C4E8C' : '#2E8FC9'); g.fillRect(0, 380, Wd, 120);
      g.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 30; i++) g.fillRect(r() * Wd, 390 + r() * 100, 30 + r() * 40, 2);
      g.fillStyle = c('#F2D7A0'); g.beginPath(); g.moveTo(0, Hd); g.lineTo(0, 500); g.quadraticCurveTo(Wd / 2, 470, Wd, 510); g.lineTo(Wd, Hd); g.fill();
      g.strokeStyle = c('#7A5230'); g.lineWidth = 14; g.beginPath(); g.moveTo(180, Hd); g.quadraticCurveTo(160, 380, 230, 260); g.stroke();
      g.fillStyle = c('#2F8F4A'); for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.45; g.beginPath(); g.ellipse(230 + Math.cos(a) * 70, 260 + Math.sin(a) * 30 + 30, 80, 16, a, 0, Math.PI * 2); g.fill(); }
    }
  });
}

// ---- moods ----------------------------------------------------------------------------------------------------------
const MOODS: Record<string, { hemi: [string, string, number]; amb: number; sun: number; sunCol: string; lamp: number; bg: string; exposure: number }> = {
  warm: { hemi: ['#FFF1DC', '#6B5A4A', 1.15], amb: 0.25, sun: 2.4, sunCol: '#FFE2B8', lamp: 1, bg: '#2A1F1A', exposure: 1.05 },
  day: { hemi: ['#F4F8FF', '#8A8F99', 1.45], amb: 0.35, sun: 3.0, sunCol: '#FFFFFF', lamp: 0.6, bg: '#1D2433', exposure: 1.1 },
  cozy: { hemi: ['#FFD9B0', '#3A2A20', 0.6], amb: 0.12, sun: 1.0, sunCol: '#FFC48A', lamp: 1.8, bg: '#140E0A', exposure: 1.0 },
  neon: { hemi: ['#8A6BFF', '#1A0B3D', 0.75], amb: 0.15, sun: 0.6, sunCol: '#B48CFF', lamp: 1.4, bg: '#0B0618', exposure: 1.1 },
  candle: { hemi: ['#FFB870', '#2A1408', 0.45], amb: 0.08, sun: 0.4, sunCol: '#FF9A50', lamp: 2.2, bg: '#0E0804', exposure: 1.0 },
};

type Inst = { p: Placed; holder: THREE.Group; built: Built; light: THREE.PointLight | null };
type Critter = { goal: 'bed' | 'roam'; c: HomeCreature; gen: Genome; s: THREE.Sprite; cv: HTMLCanvasElement; tx: THREE.CanvasTexture; x: number; z: number; path: THREE.Vector2[]; st: CreatureState; until: number; dir: 1 | -1; seed: number; happy: number; tag: THREE.Sprite };

export function createHome(o: HomeOpts) {
  const phone = isPhone();
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: sceneAntialias(), powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(sceneDpr()); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tune = adaptiveDpr((d) => renderer.setPixelRatio(d));
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#2A1F1A');
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 120);
  const kit = makeKit();
  const bag: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => { bag.push(x); return x; };
  const std = (color: string, p: THREE.MeshStandardMaterialParameters = {}) => T(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...p }));
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene, shadow = true) => { const me = new THREE.Mesh(T(geo), m); me.position.set(x, y, z); me.castShadow = shadow; me.receiveShadow = true; parent.add(me); return me; };

  // ---- light ---------------------------------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight('#FFF1DC', '#6B5A4A', 1.1); scene.add(hemi);
  const amb = new THREE.AmbientLight('#ffffff', 0.25); scene.add(amb);
  const sun = new THREE.DirectionalLight('#FFE2B8', 2.4); sun.position.set(-2, 7, -12); sun.target.position.set(1, 0, 2); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  const fill = new THREE.PointLight('#FFE7C4', 4, 14, 1.6); fill.position.set(0, 3.1, 1); scene.add(fill);
  // a pool of sunlight on the floor below the window
  const pool = mesh(new THREE.PlaneGeometry(4, 3.4), T(new THREE.MeshBasicMaterial({ color: '#FFE9C0', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending })), 0.3, 0.015, -3.6, scene, false);
  pool.rotation.x = -Math.PI / 2; pool.receiveShadow = false;

  // ---- the room ------------------------------------------------------------------------------------------------------
  const floorMat = std('#ffffff', { roughness: 0.55 });
  const floor = mesh(new THREE.PlaneGeometry(W, D), floorMat, 0, 0, 0, scene, false); floor.rotation.x = -Math.PI / 2;
  // the slab edge you see at the front (it's a dollhouse: no front wall)
  mesh(new THREE.BoxGeometry(W + 0.4, 0.35, 0.2), std('#3A2E28', { roughness: 0.9 }), 0, -0.17, D / 2 + 0.1, scene, false);
  const ground = mesh(new THREE.PlaneGeometry(80, 80), std('#1E1A16', { roughness: 1 }), 0, -0.36, 0, scene, false); ground.rotation.x = -Math.PI / 2;
  const wallMat = std('#ffffff', { roughness: 0.92 });
  const wainMat = std('#ffffff', { roughness: 0.5 });
  const trimMat = std('#ffffff', { roughness: 0.45 });
  const capMat = std('#4A3B32', { roughness: 0.9 });
  const T2 = 0.2;
  // back wall, in four pieces round the window
  const backParts: [number, number, number, number][] = [
    [-W / 2, WINDOW.x0, 0, H], [WINDOW.x1, W / 2, 0, H], [WINDOW.x0, WINDOW.x1, 0, WINDOW.y0], [WINDOW.x0, WINDOW.x1, WINDOW.y1, H],
  ];
  const wallMeshes: THREE.Mesh[] = [];
  for (const [x0, x1, y0, y1] of backParts) { const m = mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, T2), wallMat, (x0 + x1) / 2, (y0 + y1) / 2, -D / 2 - T2 / 2); wallMeshes.push(m); }
  for (const s of [-1, 1]) wallMeshes.push(mesh(new THREE.BoxGeometry(T2, H, D + T2), wallMat, s * (W / 2 + T2 / 2), H / 2, 0));
  // wall-top caps: the cut edge of a dollhouse
  mesh(new THREE.BoxGeometry(W + T2 * 2, 0.06, T2 + 0.02), capMat, 0, H + 0.03, -D / 2 - T2 / 2, scene, false);
  for (const s of [-1, 1]) { mesh(new THREE.BoxGeometry(T2 + 0.02, 0.06, D + T2 * 2), capMat, s * (W / 2 + T2 / 2), H + 0.03, 0, scene, false); mesh(new THREE.BoxGeometry(T2 + 0.02, H + 0.35, 0.06), capMat, s * (W / 2 + T2 / 2), (H - 0.35) / 2, D / 2 + 0.03, scene, false); }
  // wainscoting (lower panelling), chair rail, skirting and crown moulding along every wall
  const runs: { x: number; z: number; len: number; ry: number }[] = [
    { x: (-W / 2 + WINDOW.x0) / 2, z: -D / 2, len: WINDOW.x0 + W / 2, ry: 0 }, { x: (W / 2 + WINDOW.x1) / 2, z: -D / 2, len: W / 2 - WINDOW.x1, ry: 0 },
    { x: WINDOW.x0 + (WINDOW.x1 - WINDOW.x0) / 2, z: -D / 2, len: WINDOW.x1 - WINDOW.x0, ry: 0 },
    { x: -W / 2, z: 0, len: D, ry: Math.PI / 2 }, { x: W / 2, z: 0, len: D, ry: -Math.PI / 2 },
  ];
  runs.forEach((r, ri) => {
    const grp = new THREE.Group(); grp.position.set(r.x, 0, r.z); grp.rotation.y = r.ry; scene.add(grp);
    const low = ri === 2 ? WINDOW.y0 - 0.12 : 0.92;
    mesh(new THREE.BoxGeometry(r.len, low, 0.03), wainMat, 0, low / 2, 0.015, grp, false);
    if (ri !== 2) for (let k = 0.6; k < r.len - 0.3; k += 1.0) mesh(new THREE.BoxGeometry(0.7, low - 0.36, 0.012), trimMat, -r.len / 2 + k + 0.2, low / 2, 0.035, grp, false);
    mesh(new THREE.BoxGeometry(r.len, 0.05, 0.06), trimMat, 0, low, 0.03, grp, false);
    mesh(new THREE.BoxGeometry(r.len, 0.14, 0.035), trimMat, 0, 0.07, 0.035, grp, false);
    mesh(new THREE.BoxGeometry(r.len, 0.1, 0.08), trimMat, 0, H - 0.05, 0.04, grp, false);
  });

  // ---- the window ------------------------------------------------------------------------------------------------------
  const viewMat = T(new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  const view = mesh(new THREE.PlaneGeometry(4.6, 2.6), viewMat, 0, 1.8, -D / 2 - 0.45, scene, false); view.receiveShadow = false;
  const frameMat = std('#FFFFFF', { roughness: 0.4 });
  const wx = (WINDOW.x0 + WINDOW.x1) / 2, ww = WINDOW.x1 - WINDOW.x0, wy = (WINDOW.y0 + WINDOW.y1) / 2, wh = WINDOW.y1 - WINDOW.y0;
  for (const [w, h, x, y] of [[ww + 0.16, 0.08, wx, WINDOW.y1 + 0.04], [ww + 0.16, 0.08, wx, WINDOW.y0 - 0.04], [0.08, wh, WINDOW.x0 - 0.04, wy], [0.08, wh, WINDOW.x1 + 0.04, wy], [0.05, wh, wx, wy], [ww, 0.05, wx, wy + 0.2]] as const)
    mesh(new THREE.BoxGeometry(w, h, 0.12), frameMat, x, y, -D / 2 - 0.02, scene, false);
  mesh(new THREE.BoxGeometry(ww + 0.4, 0.05, 0.28), frameMat, wx, WINDOW.y0 - 0.06, -D / 2 + 0.1);
  const glassPane = mesh(new THREE.PlaneGeometry(ww, wh), T(new THREE.MeshStandardMaterial({ color: '#CFE8FF', transparent: true, opacity: 0.08, roughness: 0.02, metalness: 0.4, depthWrite: false })), wx, wy, -D / 2 - 0.05, scene, false); glassPane.receiveShadow = false;
  // curtains on a rod
  mesh(new THREE.CylinderGeometry(0.02, 0.02, ww + 1.4, 8), std('#B08D57', { metalness: 0.7, roughness: 0.3 }), wx, WINDOW.y1 + 0.28, -D / 2 + 0.16, scene, false).rotation.z = Math.PI / 2;
  const curtainMat = std('#C9B79C', { roughness: 1, side: THREE.DoubleSide });
  const curtainGeo = (() => { const g = new THREE.PlaneGeometry(0.75, WINDOW.y1 + 0.25 - 0.05, 24, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 26) * 0.045); g.computeVertexNormals(); return g; })();
  for (const s of [-1, 1]) mesh(curtainGeo, curtainMat, wx + s * (ww / 2 + 0.3), (WINDOW.y1 + 0.25) / 2 + 0.02, -D / 2 + 0.12);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.04, 10, 8), std('#B08D57', { metalness: 0.7, roughness: 0.3 }), wx + s * (ww / 2 + 0.72), WINDOW.y1 + 0.28, -D / 2 + 0.16, scene, false);

  // ---- art on the back wall ---------------------------------------------------------------------------------------------
  const artMats = ART_X.map(() => std('#F6F4EE', { roughness: 0.85 }));
  const artGroups = ART_X.map((x, i) => {
    const g = new THREE.Group(); g.position.set(x, 1.95, -D / 2 + 0.02); scene.add(g);
    mesh(new THREE.BoxGeometry(1.62, 1.28, 0.07), std('#C9A227', { metalness: 0.75, roughness: 0.35 }), 0, 0, 0.035, g);
    mesh(new THREE.BoxGeometry(1.44, 1.1, 0.02), std('#F4F1EA', { roughness: 0.9 }), 0, 0, 0.075, g, false);
    mesh(new THREE.PlaneGeometry(1.2, 0.86), artMats[i], 0, 0, 0.09, g, false);
    // a brass picture light
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 10), std('#B08D57', { metalness: 0.8, roughness: 0.3 }), 0, 0.78, 0.16, g, false).rotation.z = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), std('#B08D57', { metalness: 0.8, roughness: 0.3 }), 0, 0.7, 0.08, g, false);
    const glowCone = mesh(new THREE.PlaneGeometry(1.5, 0.7), T(new THREE.MeshBasicMaterial({ color: '#FFE6B0', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })), 0, 0.42, 0.095, g, false); glowCone.receiveShadow = false;
    return g;
  });
  const artSpots = ART_X.map((x) => new THREE.Vector3(x, 0, -D / 2 + 1.4));
  let artUrls: string[] = [];

  // ---- the doors to their places ------------------------------------------------------------------------------------------
  const doorGroup = new THREE.Group(); scene.add(doorGroup);
  let doors: (HomeDoor & { g: THREE.Group; spot: THREE.Vector3; glow: THREE.Mesh })[] = [];
  const labelTex = (lines: [string, string], color: string, dim = false) => kit.canvasTex(512, 200, (g) => {
    g.fillStyle = '#2B1D14'; g.beginPath(); g.roundRect(4, 4, 504, 192, 26); g.fill();
    g.strokeStyle = '#D4A84B'; g.lineWidth = 8; g.beginPath(); g.roundRect(14, 14, 484, 172, 20); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 64; g.font = `900 ${size}px ui-rounded, system-ui, sans-serif`;
    while (size > 30 && g.measureText(lines[0]).width > 440) { size -= 4; g.font = `900 ${size}px ui-rounded, system-ui, sans-serif`; }
    g.fillStyle = dim ? '#9A8F85' : '#FFF6E5'; g.fillText(lines[0], 256, 84);
    g.font = '800 34px ui-rounded, system-ui, sans-serif'; g.fillStyle = dim ? '#7A7068' : color; g.fillText(lines[1], 256, 146);
  });
  const setDoors = (list: HomeDoor[]) => {
    for (const d of doors) doorGroup.remove(d.g);
    doors = list.slice(0, DOOR_Z.length).map((d, i) => {
      const z = DOOR_Z[i], g = new THREE.Group(); g.position.set(-W / 2 + 0.02, 0, z); g.rotation.y = Math.PI / 2; doorGroup.add(g);
      const empty = d.state === 'empty', locked = d.state === 'locked';
      const panelCol = empty ? '#8C8279' : locked ? shade(d.color, -0.25) : d.color;
      // casing, slab, panels, knob
      for (const [w, h, x, y] of [[0.12, 2.36, -0.72, 1.18], [0.12, 2.36, 0.72, 1.18], [1.56, 0.14, 0, 2.33]] as const) mesh(new THREE.BoxGeometry(w, h, 0.1), trimMat, x, y, 0.05, g);
      mesh(new THREE.BoxGeometry(1.36, 0.3, 0.04), trimMat, 0, 2.5, 0.03, g, false);
      const slab = mesh(new THREE.BoxGeometry(1.32, 2.24, 0.06), std(panelCol, { roughness: 0.5 }), 0, 1.12, 0.03, g);
      void slab;
      for (const y of [0.62, 1.58]) { mesh(new THREE.BoxGeometry(1.0, 0.72, 0.03), std(shade(panelCol, 0.06), { roughness: 0.5 }), 0, y, 0.07, g, false); mesh(new THREE.BoxGeometry(0.86, 0.58, 0.02), std(shade(panelCol, -0.05), { roughness: 0.5 }), 0, y, 0.085, g, false); }
      mesh(new THREE.SphereGeometry(0.05, 12, 10), std('#D4A84B', { metalness: 0.9, roughness: 0.25 }), 0.5, 1.06, 0.12, g, false);
      mesh(new THREE.BoxGeometry(0.06, 0.18, 0.02), std('#D4A84B', { metalness: 0.9, roughness: 0.25 }), 0.5, 1.02, 0.09, g, false);
      // the career plaque over the door
      const plaque = mesh(new THREE.PlaneGeometry(1.5, 0.58), T(new THREE.MeshStandardMaterial({ map: labelTex([`${d.emoji} ${d.label}`, d.plaque], d.color, empty), roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.12 })), 0, 2.98, 0.07, g, false);
      plaque.userData.door = d.kind;
      // a glowing threshold and a doormat
      const glow = mesh(new THREE.BoxGeometry(1.2, 0.02, 0.1), T(new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: empty ? 0 : locked ? 0.3 : 1.6 })), 0, 0.01, 0.12, g, false);
      const mat = mesh(new THREE.PlaneGeometry(1.1, 0.6), std(empty ? '#6E655D' : shade(d.color, -0.35), { roughness: 1 }), 0, 0.012, 0.5, g, false); mat.rotation.x = -Math.PI / 2;
      if (locked || empty) {
        const sp = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: kit.canvasTex(128, 128, (gg) => { gg.font = '90px system-ui, "Apple Color Emoji"'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(locked ? '🔒' : '➕', 64, 70); }), transparent: true, depthWrite: false })));
        sp.scale.setScalar(0.42); sp.position.set(0, 1.25, 0.25); g.add(sp);
      }
      g.traverse((x) => { x.userData.door = d.kind; });
      return { ...d, g, spot: new THREE.Vector3(-W / 2 + 1.25, 0, z), glow };
    });
  };

  // ---- furniture ---------------------------------------------------------------------------------------------------------
  const furn = new THREE.Group(); scene.add(furn);
  let items: Inst[] = [];
  let ctx = { art: [] as string[], achievements: [] as string[], reduceMotion: !!o.reduceMotion };
  let lampK = 1;
  const surfaceAt = (x: number, z: number, skip: number) => {
    let top = 0;
    items.forEach((it, j) => {
      if (j === skip) return; const m = ITEM[it.p.i]; if (!m?.top) return;
      const [w, d] = rot(it.p);
      if (Math.abs(x - it.p.x) < w / 2 - 0.05 && Math.abs(z - it.p.z) < d / 2 - 0.05) top = Math.max(top, m.top);
    });
    return top;
  };
  const place = (it: Inst, j: number) => {
    const m = ITEM[it.p.i];
    if (m?.mount === 'wall') { it.holder.position.set(it.p.x, it.p.i === 'string_lights' ? 2.85 : it.p.i === 'wall_shelf' ? 1.75 : 1.85, it.p.z); }
    else if (m?.mount === 'ceil') it.holder.position.set(it.p.x, H, it.p.z);
    else it.holder.position.set(it.p.x, m?.small ? surfaceAt(it.p.x, it.p.z, j) : 0, it.p.z);
    // wall pieces face into the room: from the back wall +z, from the right wall -x
    it.holder.rotation.y = m?.mount === 'wall' ? (Math.abs(it.p.x - 6.9) < 0.31 ? -Math.PI / 2 : 0) : it.p.r * (Math.PI / 2);
    if (it.light) { it.light.position.set(it.p.x, (m?.light?.[2] ?? 1) + it.holder.position.y, it.p.z); }
  };
  const makeInst = (p: Placed): Inst => {
    const holder = new THREE.Group(); furn.add(holder);
    const built = buildItem(p.i, p.c, kit, ctx);
    holder.add(built.g);
    if (p.i === 'tv_console') built.screen?.(ctx.art[0] ?? null);
    const m = ITEM[p.i];
    let light: THREE.PointLight | null = null;
    if (m?.light && items.filter((x) => x.light).length < (phone ? 4 : 7)) { light = new THREE.PointLight(m.light[0], m.light[1] * lampK, 6, 1.8); scene.add(light); }
    return { p: { ...p }, holder, built, light };
  };
  const dropInst = (it: Inst) => { furn.remove(it.holder); if (it.light) { scene.remove(it.light); it.light.dispose(); } };
  const setLayout = (l: Placed[]) => {
    for (const it of items) dropInst(it);
    items = [];
    for (const p of l) { if (!ITEM[p.i]) continue; items.push(makeInst(p)); }
    items.forEach(place);
    walls = solids();
  };
  const layout = (): Placed[] => items.map((it) => ({ ...it.p }));

  // ---- you, visitors, Inkborn -------------------------------------------------------------------------------------------
  const meTex = T(new THREE.TextureLoader().load(o.explorerUrl)); meTex.colorSpace = THREE.SRGBColorSpace; meTex.wrapS = THREE.RepeatWrapping;
  const me = new THREE.Sprite(T(new THREE.SpriteMaterial({ map: meTex, transparent: true, alphaTest: 0.05 }))); me.center.set(0.5, 0); me.scale.set(1.25 * (46 / 68), 1.25, 1); scene.add(me);
  const blob = (r: number) => { const m = mesh(new THREE.CircleGeometry(r, 18), T(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false })), 0, 0.02, 0, scene, false); m.rotation.x = -Math.PI / 2; m.receiveShadow = false; return m; };
  const shadow = blob(0.3);
  const P = { x: 0, z: 4.6, face: 1, walk: 0, moving: false, path: [] as THREE.Vector2[], stick: null as THREE.Vector2 | null, keys: { x: 0, z: 0 } };
  const ring = mesh(new THREE.RingGeometry(0.22, 0.3, 24), T(new THREE.MeshBasicMaterial({ color: '#FFB13D', transparent: true, opacity: 0.85, depthWrite: false })), 0, 0.03, 0, scene, false); ring.rotation.x = -Math.PI / 2; ring.visible = false;
  const nameTag = (name: string, scale = 1.2) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 56; const g = c.getContext('2d')!;
    g.font = '800 26px ui-rounded, system-ui, sans-serif'; const w = Math.min(250, g.measureText(name).width + 24);
    g.fillStyle = 'rgba(30,20,14,0.75)'; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 42, 21); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 128, 28);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(scale, scale * 0.22, 1); sp.renderOrder = 5; return sp;
  };
  type Other = { s: THREE.Sprite; tex: THREE.Texture; tag: THREE.Sprite; sh: THREE.Mesh; x: number; z: number; tx: number; tz: number; face: number; walk: number; fresh: number };
  const others = new Map<string, Other>();
  const setOthers = (list: { id: string; url: string; name: string; x: number; z: number }[]) => {
    const keep = new Set(list.map((x) => x.id));
    for (const [id, x] of others) if (!keep.has(id)) { scene.remove(x.s, x.tag, x.sh); x.tex.dispose(); x.s.material.dispose(); x.tag.material.map?.dispose(); x.tag.material.dispose(); others.delete(id); }
    for (const it of list) {
      let x = others.get(it.id);
      if (!x) {
        const tx = new THREE.TextureLoader().load(it.url); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = THREE.RepeatWrapping;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, alphaTest: 0.05 })); sp.center.set(0.5, 0); sp.scale.set(1.25 * (46 / 68), 1.25, 1);
        const tag = nameTag(it.name); scene.add(sp, tag);
        x = { s: sp, tex: tx, tag, sh: blob(0.28), x: it.x, z: it.z, tx: it.x, tz: it.z, face: 1, walk: 0, fresh: 0 }; others.set(it.id, x);
      }
      if (performance.now() - x.fresh > 3000) { x.tx = it.x; x.tz = it.z; }
    }
  };
  const moveOther = (id: string, x: number, z: number, face?: number) => { const ot = others.get(id); if (!ot) return; ot.tx = x; ot.tz = z; ot.fresh = performance.now(); if (face) ot.face = face; };

  // speech bubbles over whoever's talking
  const bubbles = new Map<string, { s: THREE.Sprite; until: number }>();
  const say = (id: string, text: string) => {
    const old = bubbles.get(id); if (old) { scene.remove(old.s); old.s.material.map?.dispose(); old.s.material.dispose(); }
    const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d')!;
    g.font = '600 30px ui-rounded, system-ui, sans-serif';
    const words = text.split(/\s+/), lines: string[] = []; let cur = '';
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > 440 && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    const ls = lines.slice(0, 3); if (lines.length > 3) ls[2] = ls[2].slice(0, -1) + '…';
    const w = Math.min(490, Math.max(...ls.map((l) => g.measureText(l).width)) + 40), h = ls.length * 36 + 26;
    g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 3;
    g.beginPath(); g.roundRect((512 - w) / 2, 4, w, h, 22); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(240, h + 3); g.lineTo(256, h + 22); g.lineTo(272, h + 3); g.fill();
    g.fillStyle = '#1C1512'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ls.forEach((l, i) => g.fillText(l, 256, 4 + 13 + 18 + i * 36));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); sp.center.set(0.5, 0); sp.scale.set(1.9, 1.9 * (160 / 512), 1); sp.renderOrder = 6;
    scene.add(sp); bubbles.set(id, { s: sp, until: performance.now() + 5500 + text.length * 40 });
  };
  let critters: Critter[] = [];
  const hearts: { s: THREE.Sprite; t: number; vx: number }[] = [];
  const heartTex = kit.canvasTex(64, 64, (g) => { g.font = '48px system-ui, "Apple Color Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('💗', 32, 36); });
  const setCreatures = (list: HomeCreature[]) => {
    for (const c of critters) { scene.remove(c.s, c.tag); c.tx.dispose(); c.s.material.dispose(); c.tag.material.map?.dispose(); c.tag.material.dispose(); }
    critters = list.slice(0, 5).map((c, i) => {
      const gen = cleanGenome((c.genome ?? {}) as Partial<Genome>);
      const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160;
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, alphaTest: 0.04 })); s.center.set(0.5, 0.06); s.scale.setScalar(1.15); scene.add(s);
      const tag = nameTag(c.name, 0.9); tag.visible = false; scene.add(tag);
      const spot = freeSpot(1 + i * 1.3, 2 - i * 0.8);
      return { goal: 'roam' as const, c, gen, s, cv, tx, x: spot.x, z: spot.y, path: [], st: 'idle' as CreatureState, until: 1 + i, dir: 1 as const, seed: i * 1.7, happy: 0, tag };
    });
  };
  const petBed = () => items.find((it) => it.p.i === 'pet_bed');

  // ---- walking ---------------------------------------------------------------------------------------------------------
  type Box = { x0: number; x1: number; z0: number; z1: number };
  const solids = (): Box[] => {
    const out: Box[] = [];
    items.forEach((it) => {
      if (!solidItem(it.p.i)) return;
      const [w, d] = rot(it.p);
      out.push({ x0: it.p.x - w / 2 - 0.12, x1: it.p.x + w / 2 + 0.12, z0: it.p.z - d / 2 - 0.12, z1: it.p.z + d / 2 + 0.12 });
    });
    return out;
  };
  let walls: Box[] = [];
  const clampX = (x: number) => Math.max(-W / 2 + 0.45, Math.min(W / 2 - 0.45, x));
  const clampZ = (z: number) => Math.max(-D / 2 + 0.45, Math.min(D / 2 - 0.3, z));
  const blocked = (x: number, z: number) => walls.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  // a* over a quarter-metre grid, then straightened out
  const CELL = 0.25, NX = Math.round(W / CELL), NZ = Math.round(D / CELL);
  const cellOf = (x: number, z: number) => [Math.max(0, Math.min(NX - 1, Math.floor((x + W / 2) / CELL))), Math.max(0, Math.min(NZ - 1, Math.floor((z + D / 2) / CELL)))];
  const centre = (cx: number, cz: number) => new THREE.Vector2(-W / 2 + (cx + 0.5) * CELL, -D / 2 + (cz + 0.5) * CELL);
  const freeCell = (cx: number, cz: number) => { const c = centre(cx, cz); return c.x > -W / 2 + 0.4 && c.x < W / 2 - 0.4 && c.y > -D / 2 + 0.4 && c.y < D / 2 - 0.3 && !blocked(c.x, c.y); };
  const sightline = (a: THREE.Vector2, b: THREE.Vector2) => { const n = Math.ceil(a.distanceTo(b) / 0.1); for (let i = 1; i < n; i++) { const t = i / n; if (blocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false; } return true; };
  const findPath = (from: THREE.Vector2, to: THREE.Vector2): THREE.Vector2[] => {
    if (sightline(from, to)) return [to];
    const [sx, sz] = cellOf(from.x, from.y); let [tx, tz] = cellOf(to.x, to.y);
    if (!freeCell(tx, tz)) { // nearest free cell to the target
      let best = Infinity; for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) { const x = tx + dx, z = tz + dz; if (x < 0 || z < 0 || x >= NX || z >= NZ || !freeCell(x, z)) continue; const dd = dx * dx + dz * dz; if (dd < best) { best = dd; to = centre(x, z); } }
      [tx, tz] = cellOf(to.x, to.y);
    }
    const N = NX * NZ, gS = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open: number[] = []; const idx = (x: number, z: number) => z * NX + x;
    const s0 = idx(sx, sz), goal = idx(tx, tz); gS[s0] = 0; open.push(s0);
    const h = (i: number) => Math.hypot((i % NX) - tx, Math.floor(i / NX) - tz);
    let guard = 0;
    while (open.length && guard++ < 6000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (gS[open[k]] + h(open[k]) < gS[open[bi]] + h(open[bi])) bi = k;
      const cur = open.splice(bi, 1)[0]; if (cur === goal) break; closed[cur] = 1;
      const cx = cur % NX, cz = Math.floor(cur / NX);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= NX || z >= NZ) continue;
        const ni = idx(x, z); if (closed[ni] || (!freeCell(x, z) && ni !== s0)) continue;
        if (dx && dz && (!freeCell(cx + dx, cz) || !freeCell(cx, cz + dz))) continue;
        const ng = gS[cur] + (dx && dz ? 1.414 : 1);
        if (ng < gS[ni]) { gS[ni] = ng; came[ni] = cur; if (!open.includes(ni)) open.push(ni); }
      }
    }
    if (came[goal] < 0 && goal !== s0) return [];
    const pts: THREE.Vector2[] = []; for (let c = goal; c !== s0 && c >= 0; c = came[c]) pts.unshift(centre(c % NX, Math.floor(c / NX)));
    pts[pts.length - 1] = to;
    // straighten
    const out: THREE.Vector2[] = []; let a = from;
    for (let i = 0; i < pts.length; i++) { if (i === pts.length - 1 || !sightline(a, pts[i + 1])) { out.push(pts[i]); a = pts[i]; } }
    return out;
  };
  const freeSpot = (x: number, z: number) => { const [cx, cz] = cellOf(x, z); for (let r = 0; r < 20; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const X = cx + dx, Z = cz + dz; if (X >= 0 && Z >= 0 && X < NX && Z < NZ && freeCell(X, Z)) return centre(X, Z); } return new THREE.Vector2(0, 4); };
  const go = (x: number, z: number) => { P.path = findPath(new THREE.Vector2(P.x, P.z), new THREE.Vector2(clampX(x), clampZ(z))); ring.visible = P.path.length > 0; ring.position.set(clampX(x), 0.03, clampZ(z)); };

  // ---- decorate mode ------------------------------------------------------------------------------------------------------
  let editing = false, sel = -1, dragging = false;
  const edit = { focus: new THREE.Vector3(0.3, 0, -0.5), pan: null as null | { x: number; y: number; fx: number; fz: number } };
  const selFoot = mesh(new THREE.PlaneGeometry(1, 1), T(new THREE.MeshBasicMaterial({ color: '#22E3FF', transparent: true, opacity: 0.35, depthWrite: false })), 0, 0.025, 0, scene, false); selFoot.rotation.x = -Math.PI / 2; selFoot.visible = false; selFoot.receiveShadow = false;
  const selEdge = new THREE.LineSegments(T(new THREE.EdgesGeometry(T(new THREE.PlaneGeometry(1, 1)))), T(new THREE.LineBasicMaterial({ color: '#22E3FF' }))); selEdge.rotation.x = -Math.PI / 2; selEdge.visible = false; scene.add(selEdge);
  const gridTex = kit.canvasTex(64, 64, (g) => { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64); });
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping; gridTex.repeat.set(W / 0.5, D / 0.5);
  const grid = mesh(new THREE.PlaneGeometry(W, D), T(new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false })), 0, 0.02, 0, scene, false); grid.rotation.x = -Math.PI / 2; grid.visible = false; grid.receiveShadow = false;
  const overlaps = (j: number) => {
    const a = items[j]; if (!a || !solidItem(a.p.i)) return false;
    const [w, d] = rot(a.p);
    return items.some((b, k) => {
      if (k === j || !solidItem(b.p.i)) return false; const [w2, d2] = rot(b.p);
      return Math.abs(a.p.x - b.p.x) < (w + w2) / 2 - 0.02 && Math.abs(a.p.z - b.p.z) < (d + d2) / 2 - 0.02;
    });
  };
  const showSel = () => {
    const it = items[sel]; selFoot.visible = selEdge.visible = !!it && editing;
    if (!it) return;
    const [w, d] = ITEM[it.p.i]?.mount === 'wall' ? (Math.abs(it.p.x - 6.9) < 0.31 ? [0.3, ITEM[it.p.i].w] : [ITEM[it.p.i].w, 0.3]) : rot(it.p);
    for (const m of [selFoot, selEdge]) { m.scale.set(w + 0.1, d + 0.1, 1); m.position.set(it.p.x, 0.03, it.p.z); }
    const bad = overlaps(sel);
    (selFoot.material as THREE.MeshBasicMaterial).color.set(bad ? '#FF3D6E' : '#22E3FF'); (selEdge.material as THREE.LineBasicMaterial).color.set(bad ? '#FF3D6E' : '#22E3FF');
  };
  const select = (j: number) => { sel = j; showSel(); o.onSelect?.(j >= 0 ? j : null); };
  /** where a piece may go: inside the room, clear of the doors (wall pieces: on a wall) */
  const clampItem = (id: string, x: number, z: number, r: number) => {
    const m = ITEM[id];
    if (m?.mount === 'wall') { const s = snapWall(x, z, m.w); return { x: Math.round(s.x * 20) / 20, z: Math.round(s.z * 20) / 20, r: s.r }; }
    const [w, d] = r % 2 ? [m.d, m.w] : [m.w, m.d];
    const q = (v: number) => Math.round(v * 4) / 4;
    return {
      x: Math.max(Math.max(-5.4, -5.5 + w / 2), Math.min(Math.min(6.7, W / 2 - w / 2 - 0.02), q(x))),
      z: Math.max(Math.max(-5.7, -D / 2 + d / 2 + 0.02), Math.min(Math.min(5.7, D / 2 - d / 2 - 0.02), q(z))), r,
    };
  };
  const moveSel = (x: number, z: number) => {
    const it = items[sel]; if (!it) return;
    const c = clampItem(it.p.i, x, z, it.p.r);
    it.p.x = c.x; it.p.z = c.z; it.p.r = c.r;
    items.forEach(place); showSel();
  };
  /** somewhere the whole piece fits, as near the middle of the view as possible */
  const fitSpot = (id: string) => {
    const m = ITEM[id]; const hw = m.w / 2 + 0.1, hd = m.d / 2 + 0.1;
    const clash = (x: number, z: number) => walls.some((b) => x + hw > b.x0 + 0.12 && x - hw < b.x1 - 0.12 && z + hd > b.z0 + 0.12 && z - hd < b.z1 - 0.12) || Math.hypot(x - P.x, z - P.z) < 0.6;
    const cx = Math.max(-4, Math.min(5, edit.focus.x)), cz = Math.max(-4, Math.min(4, edit.focus.z));
    for (let r = 0; r < 12; r += 0.5) for (let a = 0; a < Math.PI * 2; a += r ? 0.5 / r : 7) {
      const c = clampItem(id, cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0);
      if (!clash(c.x, c.z)) return new THREE.Vector2(c.x, c.z);
    }
    return new THREE.Vector2(cx, cz);
  };
  const addItem = (id: string, col?: number) => {
    const m = ITEM[id]; if (!m) return -1;
    let x = edit.focus.x, z = edit.focus.z;
    if (m.mount === 'wall') { const s = snapWall(6.9, edit.focus.z, m.w); x = s.x; z = s.z; }
    else { const spot = m.mount === 'rug' || m.mount === 'ceil' || m.small ? new THREE.Vector2(edit.focus.x, edit.focus.z) : fitSpot(id); x = spot.x; z = spot.y; }
    const p: Placed = { i: id, x, z, r: m.mount === 'wall' ? (x > 6 ? 3 : 0) : 0, ...(col != null ? { c: col } : {}) };
    items.push(makeInst(p)); sel = items.length - 1; moveSel(p.x, p.z); walls = solids(); edit.focus.set(items[sel].p.x, 0, items[sel].p.z);
    o.onLayout?.(layout()); select(sel); return sel;
  };
  const rotateSel = () => { const it = items[sel]; if (!it || ITEM[it.p.i]?.mount === 'wall') return; it.p.r = (it.p.r + 1) % 4; moveSel(it.p.x, it.p.z); walls = solids(); o.onLayout?.(layout()); };
  const removeSel = () => { const it = items[sel]; if (!it) return; dropInst(it); items.splice(sel, 1); walls = solids(); items.forEach(place); select(-1); o.onLayout?.(layout()); };
  const recolorSel = (c: number) => { const it = items[sel]; if (!it) return; const p = { ...it.p, c }; dropInst(it); const ni = makeInst(p); items[sel] = ni; items.forEach(place); showSel(); o.onLayout?.(layout()); };

  // ---- input -----------------------------------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const setRay = (e: PointerEvent) => { const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
  const itemAt = () => { const hits = ray.intersectObject(furn, true); if (!hits.length) return -1; let o2: THREE.Object3D | null = hits[0].object; while (o2 && o2.parent !== furn) o2 = o2.parent; return o2 ? items.findIndex((it) => it.holder === o2) : -1; };
  let down: { x: number; y: number; t: number; id: number } | null = null;
  const pd = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    if (editing) {
      setRay(e); const j = itemAt();
      if (j >= 0) { select(j); dragging = true; o.canvas.setPointerCapture?.(e.pointerId); }
      else if (sel >= 0 && ray.ray.intersectPlane(plane, hit) && Math.abs(hit.x - items[sel].p.x) < 0.8 && Math.abs(hit.z - items[sel].p.z) < 0.8) { dragging = true; }
      else edit.pan = { x: e.clientX, y: e.clientY, fx: edit.focus.x, fz: edit.focus.z };
    }
  };
  const pm = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    if (editing) {
      if (dragging && sel >= 0) { setRay(e); if (ray.ray.intersectPlane(plane, hit)) moveSel(hit.x, hit.z); }
      else if (edit.pan) {
        // drag the empty floor to look round the room
        const r = o.canvas.getBoundingClientRect(), k = (2 * camPos.distanceTo(camLook) * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, r.height);
        edit.focus.x = Math.max(-5.5, Math.min(5.5, edit.pan.fx - (e.clientX - edit.pan.x) * k));
        edit.focus.z = Math.max(-5, Math.min(4.5, edit.pan.fz - (e.clientY - edit.pan.y) * k * 1.4));
      }
      return;
    }
    const dx = e.clientX - down.x, dy = e.clientY - down.y, d = Math.hypot(dx, dy);
    if (d > 14) { P.stick = new THREE.Vector2(dx / Math.max(d, 60), dy / Math.max(d, 60)); P.path = []; ring.visible = false; }
  };
  const pu = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8;
    if (editing) {
      if (dragging) { dragging = false; walls = solids(); o.onLayout?.(layout()); }
      else if (!moved) { setRay(e); if (itemAt() < 0) select(-1); }
      edit.pan = null;
      down = null; return;
    }
    const wasStick = !!P.stick; P.stick = null;
    const tap = !wasStick && performance.now() - down.t < 500; down = null;
    if (!tap) return;
    setRay(e);
    // an Inkborn: a happy hop and hearts
    for (const c of critters) if (ray.intersectObject(c.s).length) { c.happy = 1.6; c.st = 'happy'; c.until = 1.6; c.tag.visible = true; for (let k = 0; k < 4; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); s.scale.setScalar(0.25); s.position.set(c.x, 0.9, c.z); scene.add(s); hearts.push({ s, t: 0, vx: (k - 1.5) * 0.25 }); } o.onCreature?.(c.c); return; }
    for (const d of doors) if (ray.intersectObject(d.g, true).length) { go(d.spot.x, d.spot.z); return; }
    for (let i = 0; i < artGroups.length; i++) if (ray.intersectObject(artGroups[i], true).length) { go(artSpots[i].x, artSpots[i].z); return; }
    const j = itemAt();
    if (j >= 0) {
      const it = items[j]; const [w, d] = rot(it.p);
      // the side of it nearest you
      const dx = P.x - it.p.x, dz = P.z - it.p.z;
      if (Math.abs(dx) / w > Math.abs(dz) / d) go(it.p.x + Math.sign(dx || 1) * (w / 2 + 0.45), it.p.z); else go(it.p.x, it.p.z + Math.sign(dz || 1) * (d / 2 + 0.45));
      return;
    }
    if (ray.ray.intersectPlane(plane, hit)) go(hit.x, hit.z);
  };
  const kd = (e: KeyboardEvent) => { const tg = (e.target as HTMLElement)?.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return; const k = e.key.toLowerCase(); if (k === 'a' || k === 'arrowleft') P.keys.x = -1; if (k === 'd' || k === 'arrowright') P.keys.x = 1; if (k === 'w' || k === 'arrowup') P.keys.z = -1; if (k === 's' || k === 'arrowdown') P.keys.z = 1; };
  const ku = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (['a', 'd', 'arrowleft', 'arrowright'].includes(k)) P.keys.x = 0; if (['w', 's', 'arrowup', 'arrowdown'].includes(k)) P.keys.z = 0; };
  o.canvas.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu); window.addEventListener('pointercancel', pu);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  // ---- style --------------------------------------------------------------------------------------------------------------
  let style: Required<HomeStyle> = { ...DEFAULT_STYLE };
  let viewHour = -1;
  const applyStyle = (s: HomeStyle) => {
    style = { ...DEFAULT_STYLE, ...s };
    const wt = wallTexture(style.wall, style.wall_color); wt.repeat.set(3, 1.4);
    wallMat.map?.dispose(); wallMat.map = wt; wallMat.needsUpdate = true;
    const ft = floorTexture(style.floor, style.floor_color); ft.repeat.set(W / 4, D / 4);
    floorMat.map?.dispose(); floorMat.map = ft; floorMat.roughness = style.floor === 'marble' || style.floor === 'checker' ? 0.25 : style.floor === 'carpet' ? 1 : 0.55; floorMat.needsUpdate = true;
    trimMat.color.set(style.trim); wainMat.color.set(shade(style.trim, -0.04)); frameMat.color.set(style.trim);
    const md = MOODS[style.mood] ?? MOODS.warm;
    hemi.color.set(md.hemi[0]); hemi.groundColor.set(md.hemi[1]); hemi.intensity = md.hemi[2]; amb.intensity = md.amb;
    lampK = md.lamp; for (const it of items) if (it.light) it.light.intensity = (ITEM[it.p.i]?.light?.[1] ?? 3) * lampK;
    fill.intensity = style.mood === 'day' ? 6 : style.mood === 'warm' ? 4 : style.mood === 'neon' ? 3 : 1.5; fill.color.set(style.mood === 'neon' ? '#B07BFF' : '#FFE7C4');
    scene.background = new THREE.Color(md.bg); renderer.toneMappingExposure = md.exposure;
    viewHour = -1; refreshView();
  };
  const refreshView = () => {
    const h = new Date().getHours();
    if (h === viewHour && viewMat.map) return; viewHour = h;
    viewMat.map?.dispose(); viewMat.map = viewTexture(style.view, h); viewMat.needsUpdate = true;
    const night = h < 6 || h >= 20, md = MOODS[style.mood] ?? MOODS.warm;
    sun.intensity = md.sun * (night ? 0.25 : 1); sun.color.set(night ? '#9FB4FF' : md.sunCol);
    (pool.material as THREE.MeshBasicMaterial).opacity = night ? 0.03 : 0.12;
  };

  const setArt = (urls: string[]) => {
    artUrls = urls;
    artMats.forEach((m, i) => {
      const u = urls[i];
      if (!u) { m.map?.dispose(); m.map = kit.canvasTex(256, 192, (g) => { g.fillStyle = '#F6F4EE'; g.fillRect(0, 0, 256, 192); g.fillStyle = '#B9AFA3'; g.font = '700 20px ui-rounded, system-ui'; g.textAlign = 'center'; g.fillText('a blank canvas', 128, 100); }); m.needsUpdate = true; return; }
      new THREE.TextureLoader().setCrossOrigin('anonymous').load(u, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; T(tx); m.map = tx; m.needsUpdate = true; });
    });
  };

  // ---- the camera ------------------------------------------------------------------------------------------------------------
  const camPos = new THREE.Vector3(0, 8, 14), camLook = new THREE.Vector3(0, 1, 0);
  const resize = () => { const r = o.canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(o.canvas); resize();
  let raf = 0, last = performance.now(), t = 0, paused = false, frame = 0, near: string | null = null;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const step = (dx: number, dz: number) => {
    const nx = clampX(P.x + dx), nz = clampZ(P.z + dz);
    if (!blocked(nx, nz)) { P.x = nx; P.z = nz; return true; }
    if (!blocked(nx, P.z)) { P.x = nx; return true; }
    if (!blocked(P.x, nz)) { P.z = nz; return true; }
    return false;
  };
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (paused) { last = now; return; }
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now; t += dt; frame++;
    tune(raw);
    if (frame % 600 === 0) refreshView();
    // you
    P.moving = false;
    if (!editing) {
      const kx = P.keys.x || P.stick?.x || 0, kz = P.keys.z || P.stick?.y || 0, speed = 3.6;
      if (kx || kz) { const l = Math.hypot(kx, kz), s = Math.min(1, l) * speed * dt; P.moving = step((kx / l) * s, (kz / l) * s); if (Math.abs(kx) > 0.1) P.face = kx > 0 ? 1 : -1; P.path = []; ring.visible = false; }
      else if (P.path.length) {
        const tg = P.path[0], dx = tg.x - P.x, dz = tg.y - P.z, d = Math.hypot(dx, dz);
        if (d < 0.05) P.path.shift();
        else { const s = Math.min(d, speed * dt); P.moving = step((dx / d) * s, (dz / d) * s); if (!P.moving) P.path.shift(); if (Math.abs(dx) > 0.04) P.face = dx > 0 ? 1 : -1; }
        if (!P.path.length) ring.visible = false;
      }
      if (P.moving) P.walk += dt * 10;
    }
    me.position.set(P.x, P.moving && !o.reduceMotion ? Math.abs(Math.sin(P.walk)) * 0.07 : 0, P.z);
    meTex.repeat.x = P.face; meTex.offset.x = P.face < 0 ? 1 : 0;
    shadow.position.set(P.x, 0.02, P.z); ring.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
    // what you're standing at
    let s = null as HomeSpot | null;
    if (!P.moving && !editing) {
      for (const d of doors) if (Math.hypot(d.spot.x - P.x, d.spot.z - P.z) < 1.0) s = { kind: 'door', door: d.kind };
      for (let i = 0; i < artSpots.length; i++) if (Math.hypot(artSpots[i].x - P.x, artSpots[i].z - P.z) < 1.0 && artUrls[i]) s = { kind: 'art', i };
      // things you can use: the games tables, the record player / jukebox, the guestbook
      let best = 0.9;
      items.forEach((it, i) => {
        if (!INTERACT.has(it.p.i)) return;
        const [w, d] = rot(it.p), dx = Math.max(0, Math.abs(P.x - it.p.x) - w / 2), dz = Math.max(0, Math.abs(P.z - it.p.z) - d / 2), dd = Math.hypot(dx, dz);
        if (dd < best) { best = dd; s = { kind: 'item', i, id: it.p.i }; }
      });
    }
    const nk = !s ? null : s.kind === 'door' ? `d:${s.door}` : s.kind === 'art' ? `a:${s.i}` : `i:${s.i}`;
    if (nk !== near) { near = nk; o.onNear?.(s); }
    // others glide to where they last said they were
    for (const x of others.values()) {
      const dx = x.tx - x.x, dz = x.tz - x.z, d = Math.hypot(dx, dz), mv = d > 0.04;
      if (mv) { const k = Math.min(1, dt * 6); x.x += dx * k; x.z += dz * k; if (Math.abs(dx) > 0.02) x.face = dx > 0 ? 1 : -1; x.walk += dt * 10; }
      x.s.position.set(x.x, mv && !o.reduceMotion ? Math.abs(Math.sin(x.walk)) * 0.07 : 0, x.z);
      (x.s.material.map as THREE.Texture).repeat.x = x.face; (x.s.material.map as THREE.Texture).offset.x = x.face < 0 ? 1 : 0;
      x.tag.position.set(x.x, 1.48, x.z); x.sh.position.set(x.x, 0.02, x.z);
    }
    // Inkborn: wander, look about, nap in the pet bed
    for (const c of critters) {
      c.until -= dt;
      if (c.happy > 0) { c.happy -= dt; if (c.happy <= 0) { c.tag.visible = false; c.st = 'idle'; } }
      else if (c.path.length) {
        c.st = 'walk'; const tg = c.path[0], dx = tg.x - c.x, dz = tg.y - c.z, d = Math.hypot(dx, dz);
        if (d < 0.05) c.path.shift(); else { const sp2 = Math.min(d, 0.9 * dt); c.x += (dx / d) * sp2; c.z += (dz / d) * sp2; if (Math.abs(dx) > 0.02) c.dir = dx > 0 ? 1 : -1; }
        if (!c.path.length) { const bed = petBed(); if (c.goal === 'bed' && bed && Math.hypot(c.x - bed.p.x, c.z - bed.p.z) < 0.35) { c.st = 'sleep'; c.until = 8 + Math.random() * 10; } else { c.st = 'idle'; c.until = 2 + Math.random() * 4; } c.goal = 'roam'; }
      } else if (c.until <= 0 && !editing) {
        const bed = petBed(), r = Math.random();
        if (bed && r < 0.25 && !critters.some((o2) => o2 !== c && o2.goal === 'bed')) {
          c.path = findPath(new THREE.Vector2(c.x, c.z), new THREE.Vector2(bed.p.x, bed.p.z)); c.until = 99;
          if (c.path.length) { c.path.push(new THREE.Vector2(bed.p.x, bed.p.z)); c.goal = 'bed'; } else c.until = 3;
        }
        else if (r < 0.7) { const tgt = freeSpot(-4 + Math.random() * 10, -4 + Math.random() * 9); c.path = findPath(new THREE.Vector2(c.x, c.z), tgt); c.until = 99; if (!c.path.length) c.until = 2; }
        else { c.st = r < 0.85 ? 'look' : 'idle'; c.until = 2 + Math.random() * 3; }
      }
      // pet-bed creatures ignore walls (the bed is "solid" only for people)
      const onBed = !!petBed() && Math.hypot(c.x - petBed()!.p.x, c.z - petBed()!.p.z) < 0.3;
      c.s.position.set(c.x, onBed ? 0.08 : 0, c.z); c.tag.position.set(c.x, 1.25, c.z);
      if (frame % (phone ? 3 : 2) === 0) {
        const g = c.cv.getContext('2d')!; g.clearRect(0, 0, 160, 160);
        drawCreature(g, c.gen, 80, 150, 92, { t: t + c.seed, state: c.st, dir: c.dir, look: c.st === 'look' ? Math.sin(t * 1.3 + c.seed) : 0, seed: c.seed });
        c.tx.needsUpdate = true;
      }
    }
    for (const [id, b] of bubbles) {
      const who = id === 'me' ? { x: P.x, z: P.z } : others.get(id);
      const left = b.until - performance.now();
      if (!who || left <= 0) { scene.remove(b.s); b.s.material.map?.dispose(); b.s.material.dispose(); bubbles.delete(id); continue; }
      b.s.position.set(who.x, 1.45 + (id === 'me' ? 0 : 0.18), who.z); b.s.material.opacity = Math.min(1, left / 400);
    }
    for (let i = hearts.length - 1; i >= 0; i--) { const h = hearts[i]; h.t += dt; h.s.position.y += dt * 0.8; h.s.position.x += h.vx * dt; h.s.material.opacity = Math.max(0, 1 - h.t / 1.2); if (h.t > 1.2) { scene.remove(h.s); h.s.material.dispose(); hearts.splice(i, 1); } }
    // furniture comes alive
    if (!o.reduceMotion) for (const it of items) it.built.tick?.(t, dt);
    else if (frame % 60 === 0) for (const it of items) if (it.p.i.includes('clock')) it.built.tick?.(t, dt);
    for (const it of items) if (it.light && (it.p.i === 'fireplace' || style.mood === 'candle')) it.light.intensity = (ITEM[it.p.i]?.light?.[1] ?? 3) * lampK * (0.85 + 0.15 * Math.sin(t * 9 + it.p.x) * Math.sin(t * 13));
    for (const d of doors) if (d.state === 'open') (d.glow.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.sin(t * 2.4 + d.spot.z) * 0.5;
    // the camera: behind and above you, or a bird's-eye view while decorating
    const wide = camera.aspect < 1 ? 1 + (1 / camera.aspect - 1) * 0.42 : 1;
    if (editing) {
      // a bird's-eye view: the whole room on a wide screen; on a tall one, drag the floor to look round
      const tall = camera.aspect < 1, f = tall ? edit.focus : tmp2.set(0.3, 0, -0.4);
      camPos.lerp(tmp.set(f.x, tall ? 14 : 11.5 * wide, f.z + (tall ? 7.5 : 9.5)), Math.min(1, dt * 4));
      camLook.lerp(tmp2.set(f.x, 0, f.z - 0.4), Math.min(1, dt * 4));
    }
    else {
      // follow you; on a tall screen follow sideways more, and near a side wall swing round to look at it
      const tall = camera.aspect < 1, kx = tall ? 0.8 : 0.45, kl = tall ? 0.92 : 0.7;
      const side = P.x < -3.8 ? -1 : P.x > 4.2 ? 1 : 0;
      camPos.lerp(tmp.set(P.x * kx - side * 1.6, 5.6 * wide, Math.min(P.z, 3.5) + 6.6 * wide), Math.min(1, dt * 3));
      camLook.lerp(tmp2.set(P.x * kl + side * 1.4, 0.9, Math.min(P.z, 3.5) - 2.4), Math.min(1, dt * 3.5));
    }
    camera.position.copy(camPos); camera.lookAt(camLook);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  return {
    setHome(h: { style: HomeStyle; layout: Placed[]; doors: HomeDoor[]; art: string[]; achievements: string[]; inkborn: HomeCreature[] }) {
      ctx = { art: h.art, achievements: h.achievements, reduceMotion: !!o.reduceMotion };
      setDoors(h.doors); setLayout(h.layout); applyStyle(h.style); setArt(h.art); setCreatures(h.inkborn);
    },
    setStyle: applyStyle,
    setLayout: (l: Placed[]) => { setLayout(l); select(-1); },
    setDoors,
    layout,
    setEditing(on: boolean) { editing = on; grid.visible = on; if (!on) select(-1); P.path = []; ring.visible = false; },
    addItem, rotateSel, removeSel, recolorSel, deselect: () => select(-1),
    listen(l: { onSelect?(i: number | null): void; onLayout?(l: Placed[]): void }) { o.onSelect = l.onSelect; o.onLayout = l.onLayout; },
    selected: () => (sel >= 0 ? { index: sel, ...items[sel].p, overlap: overlaps(sel) } : null),
    walkTo(s: HomeSpot | { kind: 'item'; id: string }) {
      if (s.kind === 'door') { const d = doors.find((x) => x.kind === s.door); if (d) go(d.spot.x, d.spot.z); }
      else if (s.kind === 'art') go(artSpots[s.i].x, artSpots[s.i].z);
      else { const it = items.find((x) => x.p.i === s.id); if (it) { const [w, d] = rot(it.p); const sm = ITEM[it.p.i]?.small; const base = sm ? items.find((b) => ITEM[b.p.i]?.top && Math.abs(b.p.x - it.p.x) < 1 && Math.abs(b.p.z - it.p.z) < 1) : null; const bd = base ? rot(base.p)[1] : d; go(it.p.x, (base ? base.p.z : it.p.z) + bd / 2 + 0.45); void w; } }
    },
    setOthers, moveOther, say,
    pose: () => ({ x: P.x, z: P.z, face: P.face }),
    setPaused(p: boolean) { paused = p; },
    debug: () => ({ P: { x: P.x, z: P.z }, near, items: items.length, sel, editing, critters: critters.map((c) => ({ x: c.x, z: c.z, st: c.st })), others: [...others.keys()], path: P.path.length }),
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      o.canvas.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      for (const it of items) dropInst(it); setOthers([]); setCreatures([]);
      wallMat.map?.dispose(); floorMat.map?.dispose(); viewMat.map?.dispose();
      for (const x of bag) x.dispose(); kit.dispose();
      renderer.dispose();
    },
  };
}
export type HomeScene = ReturnType<typeof createHome>;
