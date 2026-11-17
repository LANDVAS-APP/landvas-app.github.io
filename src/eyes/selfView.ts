// Your explorer, seen from its own eyes: what you'd see looking out of the game's explorer.
//  * on foot: your held cosmetic (the very same drawing the game uses, big and crisp) in your right hand, a sleeve in
//    your outfit's own paint and pattern; your left hand comes in to catch things;
//  * look down: the round top of your explorer and its two feet stepping;
//  * on the bike (the game's 🚲): the riser bar, grips, brake levers, bell and lamp, the fork and the front wheel
//    turning below, your hands on the grips;
//  * in the car (the game's 🚗): the red bonnet, the dashboard and its dials, the steering wheel with your hands on
//    it, the pillars and the mirror;
//  * on the jetpack (the game's 🚀, ridden like a broom): the rocket's body and nose ahead, its porthole and fins,
//    your hands on its handles.
// Each piece is its own SVG layer; only the layers' transforms change from frame to frame.
import type { ExplorerStyle } from '../backend/types';
import { SKIN, explorerSvg, heldMarkup, outfitPaint, styleOf } from '../explorer/character';

export type SelfLook = { style: ExplorerStyle | null | undefined; accent: string };
const VB = 'viewBox="0 0 400 300" preserveAspectRatio="xMidYMax meet" overflow="visible" xmlns="http://www.w3.org/2000/svg"';
let uid = 0;

// ---- colour helpers ---------------------------------------------------------------------------------------------------
const hex2 = (c: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()); const n = m ? parseInt(m[1], 16) : 0x888888; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: string, b: string, t: number) => { const x = hex2(a), y = hex2(b); return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`; };
/** a skin's light, mid, shade and outline */
const tones = (c: string) => ({ hi: mix(c, '#ffffff', 0.3), base: c, lo: mix(c, '#6b3420', 0.24), line: mix(c, '#3a1a0e', 0.6) });
type Tones = ReturnType<typeof tones>;
const skinOf = (l: SelfLook) => tones(SKIN[styleOf(l.style).skin] ?? SKIN.peach);

/** a soft drop shadow, so the near things sit in front of the world */
const SHADOW = (k: string) => `<filter id="sh${k}" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#000" flood-opacity="0.32"/></filter>`;
/** a skin gradient (lit from the upper left) */
const skinGrad = (k: string, t: Tones, id = 'sk') => `<linearGradient id="${id}${k}" x1="0" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${t.hi}"/><stop offset="0.45" stop-color="${t.base}"/><stop offset="1" stop-color="${t.lo}"/></linearGradient>`;
/** brushed metal and rubber */
const METAL = (k: string) => `<linearGradient id="mt${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#d6dbe4"/><stop offset="0.7" stop-color="#9aa2b2"/><stop offset="1" stop-color="#6d7486"/></linearGradient>`;
const RUBBER = (k: string) => `<linearGradient id="rb${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4f5e"/><stop offset="0.5" stop-color="#23262f"/><stop offset="1" stop-color="#121318"/></linearGradient>`;
const PAINT = (k: string, c: string, id = 'pt') => `<linearGradient id="${id}${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(c, '#ffffff', 0.45)}"/><stop offset="0.3" stop-color="${c}"/><stop offset="1" stop-color="${mix(c, '#000000', 0.38)}"/></linearGradient>`;

/** a forearm in your outfit: its own fill and pattern stretched over the sleeve, shaded round, a cuff at the wrist */
function sleeve(l: SelfLook, k: string, d: string, box: [number, number, number, number], cuff: string) {
  const o = outfitPaint(l.style, l.accent, `${k}o`);
  const sx = box[2] / 22, sy = box[3] / 19;
  const cuffC = mix(o.fill.startsWith('url(') ? l.accent : o.fill, '#ffffff', 0.55);
  return `<defs>${o.defs}<clipPath id="sl${k}"><path d="${d}"/></clipPath>
      <linearGradient id="sf${k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.38"/><stop offset="0.3" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></linearGradient></defs>
    <g clip-path="url(#sl${k})">
      <g transform="translate(${(box[0] - 12 * sx).toFixed(1)} ${(box[1] - 25.5 * sy).toFixed(1)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})"><rect x="-30" y="-10" width="110" height="100" fill="${o.fill}"/>${o.extra}</g>
      <path d="${d}" fill="url(#sf${k})"/>
    </g>
    <path d="${d}" fill="none" stroke="rgba(10,10,30,0.55)" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${cuff}" fill="${cuffC}" stroke="rgba(10,10,30,0.5)" stroke-width="2"/>`;
}

/**
 * The right hand gripping an upright handle, seen from behind and a little to the left (0,0 = the middle of the
 * grip). Cel-shaded like a cartoon: a flat base, one shadow tone, a highlight, a clean dark outline. Split in two so
 * whatever is held goes between the back of the hand and the curled fingers.
 */
function gripBack(k: string, t: Tones) {
  return `<path d="M4 -40 C 22 -52 50 -44 58 -22 C 64 -4 62 22 52 38 C 42 52 20 56 4 48 Z" fill="${t.base}" stroke="${t.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M56 -8 C 58 14 52 32 40 44 C 30 51 16 52 6 48 L 8 30 C 30 30 46 14 50 -6 Z" fill="${t.lo}" opacity="0.85"/>
    <path d="M18 -40 C 32 -44 46 -38 52 -26" stroke="${t.hi}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
}
function gripFront(k: string, t: Tones) {
  // four fingers curl round the handle from the knuckles (right) to the fingertips (left), each a little shorter
  const fingers = [0, 1, 2, 3].map((i) => {
    const yc = -22 + i * 17.5, th = 18 - i * 1.4, r = th / 2, tip = -36 + i * 3.5, top = yc - r, bot = yc + r;
    return `<path d="M30 ${top + 1} C 12 ${top - 3} -10 ${top - 3} ${tip + r} ${top} A ${r} ${r} 0 0 0 ${tip + r} ${bot} C -8 ${bot + 1} 12 ${bot + 2} 30 ${bot + 1} Z" fill="${t.base}" stroke="${t.line}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M28 ${yc + r * 0.25} C 10 ${yc + r * 0.4} -10 ${yc + r * 0.45} ${tip + r * 0.9} ${yc + r * 0.35} A ${r * 0.62} ${r * 0.62} 0 0 0 ${tip + r} ${bot - 1.5} C -8 ${bot - 0.5} 12 ${bot} 28 ${bot - 0.5} Z" fill="${t.lo}" opacity="0.9"/>
      <path d="M${tip + r + 2} ${top + 4} C ${tip + 12} ${top + 2} ${tip + 20} ${top + 2} ${tip + 28} ${top + 3}" stroke="${t.hi}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path d="M-6 ${top + 3} C -9 ${yc} -9 ${yc + 2} -6 ${bot - 3}" stroke="${t.line}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.55"/>`;
  }).join('');
  // the thumb lies over the index finger, its nail toward the tip
  return `${fingers}
    <path d="M36 -34 C 20 -52 -6 -54 -22 -44 C -32 -38 -28 -24 -16 -26 C -2 -30 14 -26 28 -16 Z" fill="${t.base}" stroke="${t.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M28 -18 C 14 -26 -2 -28 -14 -25 C -22 -24 -26 -30 -24 -34 C -14 -32 6 -34 30 -24 Z" fill="${t.lo}" opacity="0.85"/>
    <path d="M-24 -44 C -16 -48 -8 -48 -4 -44 C -6 -38 -14 -36 -22 -38 Z" fill="${mix(t.base, '#ffffff', 0.55)}" stroke="${t.line}" stroke-width="1.6"/>
    <path d="M0 -46 C 10 -48 20 -46 28 -40" stroke="${t.hi}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
}
/**
 * A fist round a bar running across (a bike's grip, a rocket's handle, the rim of a steering wheel), seen from behind
 * and above: the back of the hand toward you, the knuckles in a row along the bar, the fingers rolling over it and
 * down the far side, the thumb wrapping round under it on the inside (0,0 = the bar under the middle of the hand; the
 * right hand — mirror it for the left). `wrist` is how far the hand runs down toward you before the cuff.
 */
function barFist(k: string, t: Tones, wrist = 34) {
  const W = wrist;
  // the fingers, index (inside) to little finger (outside): seen end-on as they roll over the bar, so short and round
  const F = [
    { x: -21, w: 17.5, top: -49 },
    { x: -5, w: 18.5, top: -52 },
    { x: 10.5, w: 17, top: -49 },
    { x: 24.5, w: 14.5, top: -42 },
  ];
  const fingers = F.map(({ x, w, top }) => {
    const r = w / 2, l = x - r, rr = x + r;
    return `<path d="M${l} -18 L ${l} ${top + r} A ${r} ${r} 0 0 1 ${rr} ${top + r} L ${rr} -18 Z" fill="${t.base}" stroke="${t.line}" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M${x + r * 0.15} ${top + 3} A ${r} ${r} 0 0 1 ${rr - 1.4} ${top + r} L ${rr - 1.4} -18 L ${x + r * 0.2} -18 Z" fill="${t.lo}" opacity="0.75"/>
      <path d="M${l + 3} ${top + r * 1.6} Q ${x} ${top + r * 1.15} ${rr - 3} ${top + r * 1.6}" stroke="${t.line}" stroke-width="1.6" fill="none" opacity="0.45" stroke-linecap="round"/>
      <ellipse cx="${x - r * 0.38}" cy="${top + r * 0.95}" rx="${r * 0.3}" ry="${r * 0.5}" fill="${t.hi}" opacity="0.9"/>`;
  }).join('');
  // the back of the hand: broad at the knuckles, narrowing to the wrist
  const back = `M-26 ${W} C -32 ${W * 0.5} -38 4 -37 -10 C -36 -22 -32 -28 -26 -30 C -16 -34 -12 -33 -5 -35 C 2 -34 6 -33 12 -32 C 20 -31 26 -29 31 -24 C 37 -17 38 -6 36 6 C 34 ${W * 0.55} 30 ${W * 0.8} 24 ${W} Z`;
  return `${fingers}
    <path d="${back}" fill="${t.base}" stroke="${t.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M36 -6 C 37 6 34 ${W * 0.55} 24 ${W} L 6 ${W} C 20 ${W * 0.6} 28 12 30 -10 Z" fill="${t.lo}" opacity="0.85"/>
    <path d="M-28 -18 C -16 -26 6 -27 26 -20" stroke="${t.hi}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.9"/>
    ${F.map(({ x, w }) => `<ellipse cx="${x}" cy="-27" rx="${w * 0.3}" ry="3.2" fill="${t.hi}" opacity="0.7"/>`).join('')}
    <path d="M-14 -16 C -12 -2 -12 10 -14 ${W - 6} M6 -16 C 6 -2 5 10 4 ${W - 8}" stroke="${t.lo}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.7"/>
    <path d="M-33 -6 C -46 -6 -56 4 -54 16 C -52 26 -40 28 -32 20 C -28 14 -28 6 -30 0 Z" fill="${t.base}" stroke="${t.line}" stroke-width="2.8" stroke-linejoin="round"/>
    <path d="M-52 12 C -52 20 -46 24 -40 22 C -44 18 -46 14 -46 9 Z" fill="${t.lo}" opacity="0.8"/>
    <path d="M-48 -1 C -44 -4 -38 -4 -34 -2" stroke="${t.hi}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
}
const handDefs = (k: string, t: Tones) => `${skinGrad(k, t)}<linearGradient id="fg${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.hi}"/><stop offset="0.5" stop-color="${t.base}"/><stop offset="1" stop-color="${t.lo}"/></linearGradient>`;

/** the explorer's own held cosmetic, big, standing up in the hand (its own tilt undone) */
function held(l: SelfLook, scale: number) {
  const m = heldMarkup(l.style);
  const r = /rotate\((-?[\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)\)/.exec(m);
  const own = r ? Number(r[1]) : 0;
  return `<g transform="scale(${scale}) translate(-36 -31.5) rotate(${-own} 36 30)">${m}</g>`;
}

export type SelfLayers = Record<string, string>;

/** on foot: your held cosmetic in your right hand (and the left hand, for catching) */
export function walkLayers(l: SelfLook): SelfLayers {
  const t = skinOf(l), k = `w${++uid}`;
  return {
    right: `<svg ${VB}><defs>${handDefs(k, t)}${SHADOW(k)}</defs><g filter="url(#sh${k})">
      ${sleeve(l, k, 'M300 262 C 318 250 346 244 368 248 L 452 430 L 262 430 Z', [262, 244, 190, 186], 'M296 262 C 316 248 348 241 370 246 L 377 262 C 352 258 322 264 302 278 Z')}
      <g transform="translate(306 226) rotate(-14) scale(0.84)">
        ${gripBack(k, t)}
        <g>${held(l, 11)}</g>
        ${gripFront(k, t)}
      </g></g></svg>`,
    left: `<svg ${VB}><defs>${handDefs(k + 'l', t)}${SHADOW(k + 'l')}</defs><g filter="url(#sh${k}l)">
      ${sleeve(l, k + 'l', 'M58 268 C 76 256 100 254 118 262 L 150 430 L -20 430 Z', [-20, 254, 170, 176], 'M56 268 C 76 254 102 251 120 260 L 122 276 C 102 268 80 270 62 282 Z')}
      <g transform="translate(92 232) rotate(14)">
        ${[-19, -6.5, 6, 18.5].map((x, i) => `<rect x="${x - 6.5}" y="${-58 + Math.abs(i - 1.3) * 5}" width="13" height="40" rx="6.5" fill="url(#fg${k}l)" stroke="${t.line}" stroke-width="2.3"/>`).join('')}
        <path d="M-30 -26 C -32 -40 -12 -46 0 -45 C 18 -46 32 -36 30 -18 L 28 14 C 26 30 -24 32 -28 14 Z" fill="url(#sk${k}l)" stroke="${t.line}" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M26 -10 C 40 -24 52 -22 52 -12 C 52 -2 40 6 30 10 Z" fill="url(#sk${k}l)" stroke="${t.line}" stroke-width="2.4"/>
        <path d="M-14 -30 Q 0 -36 16 -30" stroke="${t.hi}" stroke-width="3.6" fill="none" stroke-linecap="round" opacity="0.7"/>
      </g></g></svg>`,
  };
}

/** look down: the round top of your explorer (in its outfit) and its two feet, stepping */
export function lookDownLayers(l: SelfLook): SelfLayers {
  const k = `d${++uid}`;
  const o = outfitPaint(l.style, l.accent, `${k}o`);
  // the explorer's own little legs, seen from above: dark, round-ended, a highlight on top
  const foot = (x: number) => `<ellipse cx="${x}" cy="4" rx="27" ry="12" fill="#000" opacity="0.25"/>
    <rect x="${x - 22}" y="-30" width="44" height="40" rx="20" fill="#1b1f3d"/><ellipse cx="${x - 6}" cy="-18" rx="11" ry="6" fill="#ffffff" opacity="0.2"/>`;
  return {
    feetL: `<svg ${VB}><g transform="translate(0 236)">${foot(158)}</g></svg>`,
    feetR: `<svg ${VB}><g transform="translate(0 236)">${foot(242)}</g></svg>`,
    belly: `<svg ${VB}><defs>${o.defs}<clipPath id="b${k}"><ellipse cx="200" cy="356" rx="150" ry="86"/></clipPath>
        <radialGradient id="bs${k}" cx="0.45" cy="0.15" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.3"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></radialGradient></defs>
      <g clip-path="url(#b${k})"><g transform="translate(-130 -284) scale(15 17)"><rect x="0" y="0" width="46" height="68" fill="${o.fill}"/>${o.extra}</g>
        <ellipse cx="200" cy="356" rx="150" ry="86" fill="url(#bs${k})"/>
        <path d="M80 300 C 140 282 260 282 320 300" stroke="#fff" stroke-width="14" opacity="0.18" fill="none" stroke-linecap="round"/></g>
      <ellipse cx="200" cy="356" rx="150" ry="86" fill="none" stroke="rgba(10,10,30,0.5)" stroke-width="3"/></svg>`,
  };
}

/** the bike (the game's 🚲, in your colour): what you see from the saddle */
export function bikeLayers(l: SelfLook): SelfLayers {
  const t = skinOf(l), k = `b${++uid}`, A = l.accent;
  const grip = (x: number) => `<rect x="${x - 34}" y="196" width="68" height="30" rx="15" fill="url(#rb${k})" stroke="#0b0c10" stroke-width="2.5"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${x - 26 + i * 9.5}" y="199" width="3" height="24" rx="1.5" fill="#000" opacity="0.35"/>`).join('')}`;
  // the tyre's tread: a ridge down the middle and knobs either side, in a layer of its own that rolls toward you
  // (down the picture) as you ride
  const tread = Array.from({ length: 24 }, (_, i) => {
    const y = 201 + i * 13, w = 18 + (y - 214) * 0.006;
    return `<rect x="${200 - w}" y="${y}" width="${w - 3}" height="7" rx="2.5" fill="#3d4250"/><rect x="${203}" y="${y + 6.5}" width="${w - 3}" height="7" rx="2.5" fill="#3d4250"/>`;
  }).join('');
  const TYRE = 'M181 222 C 181 208 219 208 219 222 L 220 500 L 180 500 Z';
  return {
    // the front wheel, seen from the saddle: the top of the tyre, edge-on, standing up under the bars and running
    // down and away to the road
    wheel: `<svg ${VB}><defs>
        <linearGradient id="ty${k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a0b0e"/><stop offset="0.28" stop-color="#262a33"/><stop offset="0.5" stop-color="#343946"/><stop offset="0.72" stop-color="#262a33"/><stop offset="1" stop-color="#0a0b0e"/></linearGradient>
        <linearGradient id="tf${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient>
        <clipPath id="tc${k}"><path d="${TYRE}"/></clipPath></defs>
      <path d="${TYRE}" fill="url(#ty${k})" stroke="#050608" stroke-width="2.5"/>
      <g clip-path="url(#tc${k})"><g class="lv-fp-tread">${tread}</g>
        <rect x="198.5" y="200" width="3" height="300" fill="#4a505f" opacity="0.6"/>
        <path d="M186 214 L 186 500" stroke="#fff" stroke-width="2.4" opacity="0.12"/>
        <rect x="170" y="200" width="60" height="300" fill="url(#tf${k})"/></g></svg>`,
    bars: `<svg ${VB}><defs>${METAL(k)}${RUBBER(k)}${PAINT(k, A)}${SHADOW(k)}
        <radialGradient id="lp${k}"><stop offset="0" stop-color="#fffbe6"/><stop offset="0.6" stop-color="#ffe9a0"/><stop offset="1" stop-color="#d9b44a"/></radialGradient>
        <radialGradient id="bl${k}" cx="0.35" cy="0.3"><stop offset="0" stop-color="#fff6c8"/><stop offset="0.45" stop-color="#f2c33a"/><stop offset="1" stop-color="#9c6d10"/></radialGradient></defs>
      <g filter="url(#sh${k})">
      <!-- the fork's legs either side of the tyre, down from the crown -->
      <path d="M166 232 L 170 500 L 180 500 L 179 236 Z M234 232 L 230 500 L 220 500 L 221 236 Z" fill="url(#pt${k})" stroke="rgba(0,0,0,0.5)" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M169.5 240 L 173 496" stroke="#fff" stroke-width="2.6" opacity="0.45" stroke-linecap="round"/>
      <path d="M162 222 C 162 214 238 214 238 222 L 236 240 C 236 246 164 246 164 240 Z" fill="url(#pt${k})" stroke="rgba(0,0,0,0.5)" stroke-width="2.5"/>
      <path d="M170 222 C 184 218 216 218 230 222" stroke="#fff" stroke-width="3" opacity="0.45" fill="none" stroke-linecap="round"/>
      <!-- the lamp on the crown -->
      <rect x="184" y="242" width="32" height="20" rx="9" fill="#23262f" stroke="#0b0c10" stroke-width="2"/><ellipse class="lv-fp-lamp" cx="200" cy="252" rx="11" ry="6" fill="url(#lp${k})"/>
      <!-- the stem, the riser bar, the bell -->
      <rect x="187" y="198" width="26" height="28" rx="8" fill="url(#mt${k})" stroke="#4a4f5e" stroke-width="2"/>
      <path d="M40 214 C 90 214 120 196 160 196 L 240 196 C 280 196 310 214 360 214" stroke="#3d4250" stroke-width="20" fill="none" stroke-linecap="round"/>
      <path d="M40 214 C 90 214 120 196 160 196 L 240 196 C 280 196 310 214 360 214" stroke="url(#mt${k})" stroke-width="15" fill="none" stroke-linecap="round"/>
      <path d="M44 209 C 92 209 122 191 160 191 L 240 191 C 278 191 308 209 356 209" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.65"/>
      <rect x="182" y="186" width="36" height="24" rx="6" fill="url(#mt${k})" stroke="#4a4f5e" stroke-width="2"/>
      <rect x="134" y="186" width="8" height="12" fill="#6d7486"/><ellipse cx="138" cy="182" rx="16" ry="12" fill="url(#bl${k})" stroke="#7a520c" stroke-width="1.6"/><ellipse cx="133" cy="177" rx="5" ry="3" fill="#fff" opacity="0.75"/>
      <!-- brake levers in front of the grips, cables looping down to the fork -->
      <path d="M92 204 C 84 222 76 230 58 236" stroke="#3d4250" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M92 204 C 84 222 76 230 58 236" stroke="url(#mt${k})" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M308 204 C 316 222 324 230 342 236" stroke="#3d4250" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M308 204 C 316 222 324 230 342 236" stroke="url(#mt${k})" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M100 200 C 130 214 150 226 168 230 M300 200 C 270 214 250 226 232 230" stroke="#14161c" stroke-width="3" fill="none"/>
      ${grip(46)}${grip(354)}
      </g></svg>`,
    hands: `<svg ${VB}><defs>${handDefs(k, t)}${SHADOW(k + 'h')}</defs><g filter="url(#sh${k}h)">
      ${sleeve(l, k + 'r', 'M332 236 C 346 228 370 228 384 238 L 470 430 L 300 430 Z', [300, 228, 170, 202], 'M330 240 C 346 230 370 230 386 240 L 390 254 C 372 246 348 246 334 254 Z')}
      ${sleeve(l, k + 'l', 'M68 236 C 54 228 30 228 16 238 L -70 430 L 100 430 Z', [-70, 228, 170, 202], 'M70 240 C 54 230 30 230 14 240 L 10 254 C 28 246 52 246 66 254 Z')}
      <g transform="translate(356 210) scale(0.92)">${barFist(k, t)}</g>
      <g transform="translate(44 210) scale(-0.92 0.92)">${barFist(k, t)}</g>
      </g></svg>`,
  };
}

/**
 * Where the driver's arms are (in the 400×300 picture): the wheel turns about `c`; each forearm runs from its elbow
 * (`e`, below the picture) to the hand on the rim (`f`). FirstPersonSelf swings and stretches each forearm so it stays
 * on its hand as the wheel turns.
 */
export const CAR_ARMS = {
  c: [200, 326] as const,
  armR: { e: [410, 560] as const, f: [298, 262] as const },
  armL: { e: [-10, 560] as const, f: [102, 262] as const },
};
const armLen = (a: { e: readonly number[]; f: readonly number[] }) => Math.hypot(a.f[0] - a.e[0], a.f[1] - a.e[1]);
/** the forearm's angle (degrees, clockwise from straight up) and its stretch, for a wheel turned `deg` degrees */
export function carArm(side: 'armR' | 'armL', deg: number) {
  const a = CAR_ARMS[side], [cx, cy] = CAR_ARMS.c, r = (deg * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
  const dx = a.f[0] - cx, dy = a.f[1] - cy;
  const fx = cx + dx * co - dy * si, fy = cy + dx * si + dy * co;
  const vx = fx - a.e[0], vy = fy - a.e[1];
  return { angle: (Math.atan2(vx, -vy) * 180) / Math.PI, stretch: Math.hypot(vx, vy) / armLen(a) };
}

/** the car (the game's red 🚗): what you see from the driver's seat */
export function carLayers(l: SelfLook): SelfLayers {
  const t = skinOf(l), k = `c${++uid}`;
  const RED = '#E0392F';
  const ticks = (cx: number, cy: number, r: number) => Array.from({ length: 13 }, (_, i) => { const a = Math.PI * (0.8 + (i / 12) * 1.4); return `<line x1="${(cx + Math.cos(a) * r * 0.78).toFixed(1)}" y1="${(cy + Math.sin(a) * r * 0.78).toFixed(1)}" x2="${(cx + Math.cos(a) * r * 0.92).toFixed(1)}" y2="${(cy + Math.sin(a) * r * 0.92).toFixed(1)}" stroke="#e8ecf5" stroke-width="${i % 3 ? 1.4 : 2.6}"/>`; }).join('');
  const vent = (x: number) => `<rect x="${x}" y="234" width="70" height="20" rx="8" fill="#0e1018" stroke="#3b4058" stroke-width="2"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${x + 6 + i * 12.5}" y="238" width="6" height="12" rx="2" fill="#2a2f42"/>`).join('')}`;
  // a forearm, drawn standing straight up from its elbow (FirstPersonSelf swings it onto the hand)
  const arm = (side: 'armR' | 'armL') => {
    const a = CAR_ARMS[side], [ex, ey] = a.e, L = armLen(a), top = ey - L, kk = `${k}${side}`;
    const d = `M${ex - 48} ${ey + 40} L ${ex - 27} ${top + 6} C ${ex - 24} ${top - 4} ${ex + 24} ${top - 4} ${ex + 27} ${top + 6} L ${ex + 48} ${ey + 40} Z`;
    const cuff = `M${ex - 28.5} ${top + 22} C ${ex - 12} ${top + 16} ${ex + 12} ${top + 16} ${ex + 28.5} ${top + 22} L ${ex + 30} ${top + 36} C ${ex + 12} ${top + 30} ${ex - 12} ${top + 30} ${ex - 30} ${top + 36} Z`;
    return `<svg ${VB}><defs>${SHADOW(kk)}</defs><g filter="url(#sh${kk})">${sleeve(l, kk, d, [ex - 48, top - 4, 96, L + 44], cuff)}</g></svg>`;
  };
  return {
    dash: `<svg ${VB}><defs>${PAINT(k, RED, 'bn')}
        <linearGradient id="ds${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4058"/><stop offset="0.12" stop-color="#262a3d"/><stop offset="0.45" stop-color="#14161f"/><stop offset="1" stop-color="#0b0c12"/></linearGradient>
        <radialGradient id="dl${k}" cx="0.5" cy="0.35" r="0.7"><stop offset="0" stop-color="#0a0c16"/><stop offset="0.85" stop-color="#151a2e"/><stop offset="1" stop-color="#30364e"/></radialGradient></defs>
      <path d="M-60 196 C 60 168 340 168 460 196 L 460 222 L -60 222 Z" fill="url(#bn${k})"/>
      <path d="M40 186 C 130 172 270 172 360 186" stroke="#fff" stroke-width="5" fill="none" opacity="0.55" stroke-linecap="round"/>
      <path d="M150 178 C 180 175 220 175 250 178" stroke="#fff" stroke-width="9" fill="none" opacity="0.35" stroke-linecap="round"/>
      <path d="M-60 210 C 60 192 340 192 460 210 L 460 620 L -60 620 Z" fill="url(#ds${k})"/>
      <path d="M-60 210 C 60 192 340 192 460 210" stroke="#59607c" stroke-width="3" fill="none"/>
      <path d="M-60 300 C 60 290 340 290 460 300" stroke="#2c3146" stroke-width="3" fill="none"/>
      ${vent(16)}${vent(314)}
      <path d="M118 236 C 140 210 260 210 282 236 L 282 262 L 118 262 Z" fill="#0d0f17" stroke="#3b4058" stroke-width="2.4"/>
      <circle cx="162" cy="244" r="26" fill="url(#dl${k})" stroke="#59607c" stroke-width="2"/>${ticks(162, 244, 26)}
      <circle cx="238" cy="244" r="26" fill="url(#dl${k})" stroke="#59607c" stroke-width="2"/>${ticks(238, 244, 26)}
      <path class="lv-fp-needle" d="M162 244 L162 224" stroke="#ff4a3d" stroke-width="3" stroke-linecap="round" style="transform-origin:162px 244px;transform:rotate(-120deg)"/>
      <path class="lv-fp-rev" d="M238 244 L238 224" stroke="#ff4a3d" stroke-width="3" stroke-linecap="round" style="transform-origin:238px 244px;transform:rotate(-110deg)"/>
      <circle cx="162" cy="244" r="4" fill="#ff4a3d"/><circle cx="238" cy="244" r="4" fill="#ff4a3d"/>
      <!-- the steering column, down from behind the wheel -->
      <path d="M168 330 L 160 640 L 240 640 L 232 330 Z" fill="#101219" stroke="#262a3d" stroke-width="2"/>
    </svg>`,
    // the steering wheel: a leather rim (its stitching catching the light), three spokes, the hub with its badge
    wheel: `<svg ${VB}><defs>${SHADOW(k)}
        <linearGradient id="lw${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f5469"/><stop offset="0.35" stop-color="#262938"/><stop offset="1" stop-color="#121319"/></linearGradient>
        <radialGradient id="hb${k}" cx="0.4" cy="0.3"><stop offset="0" stop-color="#3a3f55"/><stop offset="1" stop-color="#16182a"/></radialGradient></defs>
      <g filter="url(#sh${k})"><g transform="translate(200 326)">
        <path d="M-118 -12 L -34 -8 M118 -12 L 34 -8 M0 34 L 0 118" stroke="#1d2030" stroke-width="24" stroke-linecap="round"/>
        <path d="M-118 -16 L -34 -12 M118 -16 L 34 -12" stroke="#3b4058" stroke-width="4" stroke-linecap="round"/>
        <circle r="126" fill="none" stroke="#0b0c11" stroke-width="31"/>
        <circle r="126" fill="none" stroke="url(#lw${k})" stroke-width="26"/>
        <circle r="133" fill="none" stroke="#8a90ad" stroke-width="2.4" stroke-dasharray="4 7" opacity="0.5"/>
        <path d="M-108 -66 A 126 126 0 0 1 108 -66" stroke="#9aa0bd" stroke-width="3" fill="none" opacity="0.55" transform="translate(0 -7)" stroke-linecap="round"/>
        <ellipse cx="0" cy="2" rx="42" ry="36" fill="url(#hb${k})" stroke="#0b0c12" stroke-width="2.5"/>
        <ellipse cx="-8" cy="-12" rx="22" ry="8" fill="#fff" opacity="0.08"/>
        <circle r="11" fill="none" stroke="#c9cfda" stroke-width="3"/><path d="M-7 -1 L 0 6 L 7 -1" stroke="#c9cfda" stroke-width="3" fill="none"/>
      </g></g></svg>`,
    armL: arm('armL'),
    armR: arm('armR'),
    // your hands on the rim at ten to two: knuckles along the rim's outer edge, thumbs on the inside
    grip: `<svg ${VB}><defs>${handDefs(k, t)}${SHADOW(k + 'g')}</defs><g filter="url(#sh${k}g)"><g transform="translate(200 326)">
        <g transform="translate(${(126 * Math.sin(0.98)).toFixed(1)} ${(-126 * Math.cos(0.98)).toFixed(1)}) rotate(50) scale(0.9)">${barFist(k, t, 18)}</g>
        <g transform="translate(${(-126 * Math.sin(0.98)).toFixed(1)} ${(-126 * Math.cos(0.98)).toFixed(1)}) rotate(-50) scale(-0.9 0.9)">${barFist(k, t, 18)}</g>
      </g></g></svg>`,
  };
}
/** the car's frame round the whole view: pillars at the edges, the roof's edge */
export function carFrame(): string {
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="fpl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#14161f"/><stop offset="1" stop-color="#2e3348"/></linearGradient>
      <linearGradient id="fpr" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#14161f"/><stop offset="1" stop-color="#2e3348"/></linearGradient></defs>
    <path d="M0 0 L 10 0 L 3.6 76 L 0 78 Z" fill="url(#fpl)"/><path d="M100 0 L 90 0 L 96.4 76 L 100 78 Z" fill="url(#fpr)"/>
    <rect x="0" y="0" width="100" height="5.5" fill="#1b1e2c"/><rect x="0" y="5" width="100" height="0.6" fill="#3b4058"/></svg>`;
}

/** the rocket (the game's 🚀), ridden like a broom: its body and nose ahead of you, its handles in your hands */
export function jetLayers(l: SelfLook): SelfLayers {
  const t = skinOf(l), k = `j${++uid}`;
  return {
    flames: `<svg ${VB}>${[-1, 1].map((s) => `<g transform="translate(${200 + s * 150} 300) rotate(${s * 18})">
        <ellipse cx="0" cy="40" rx="26" ry="62" fill="#FF7A1A" opacity="0.75"/><ellipse cx="0" cy="34" rx="16" ry="44" fill="#FFC93D"/><ellipse cx="0" cy="26" rx="7" ry="24" fill="#FFF6D6"/></g>`).join('')}</svg>`,
    grips: `<svg ${VB}><defs>${handDefs(k, t)}${SHADOW(k)}${METAL(k)}
        <linearGradient id="rk${k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8f98aa"/><stop offset="0.3" stop-color="#ffffff"/><stop offset="0.6" stop-color="#e3e8f2"/><stop offset="1" stop-color="#7c8496"/></linearGradient>
        ${PAINT(k, '#E53935', 'rd')}${PAINT(k, '#2F6FE4', 'bu')}
        <radialGradient id="pw${k}" cx="0.35" cy="0.35"><stop offset="0" stop-color="#bfe9ff"/><stop offset="0.6" stop-color="#3f8fd8"/><stop offset="1" stop-color="#16406e"/></radialGradient></defs>
      <g filter="url(#sh${k})">
        <path d="M120 300 C 90 280 40 290 10 330 L 140 330 Z" fill="url(#rd${k})" stroke="#7a1712" stroke-width="2.5"/>
        <path d="M280 300 C 310 280 360 290 390 330 L 260 330 Z" fill="url(#rd${k})" stroke="#7a1712" stroke-width="2.5"/>
        <path d="M110 330 C 120 250 160 196 186 176 L 214 176 C 240 196 280 250 290 330 Z" fill="url(#rk${k})" stroke="#5c6272" stroke-width="2.5"/>
        <path d="M186 176 C 192 150 196 140 200 134 C 204 140 208 150 214 176 Z" fill="url(#rd${k})" stroke="#7a1712" stroke-width="2"/>
        <path d="M150 300 C 158 248 178 208 196 186" stroke="#fff" stroke-width="7" fill="none" opacity="0.6" stroke-linecap="round"/>
        <path d="M128 286 C 176 270 224 270 272 286" stroke="url(#bu${k})" stroke-width="12" fill="none"/>
        <circle cx="200" cy="232" r="22" fill="#c9cfda" stroke="#5c6272" stroke-width="2.5"/><circle cx="200" cy="232" r="15" fill="url(#pw${k})"/><ellipse cx="194" cy="226" rx="5" ry="3.5" fill="#fff" opacity="0.85"/>
        <path d="M118 250 L 66 244 M282 250 L 334 244" stroke="#3d4250" stroke-width="16" stroke-linecap="round"/>
        <path d="M118 250 L 66 244 M282 250 L 334 244" stroke="url(#mt${k})" stroke-width="11" stroke-linecap="round"/>
        ${sleeve(l, k + 'r', 'M330 262 C 346 256 368 256 380 264 L 460 430 L 300 430 Z', [300, 256, 160, 174], 'M328 266 C 346 256 368 256 382 266 L 386 280 C 368 272 348 272 332 280 Z')}
        ${sleeve(l, k + 'l', 'M70 262 C 54 256 32 256 20 264 L -60 430 L 100 430 Z', [-60, 256, 160, 174], 'M72 266 C 54 256 32 256 18 266 L 14 280 C 32 272 52 272 68 280 Z')}
        <g transform="translate(340 244)">${barFist(k, t)}</g>
        <g transform="translate(60 244) scale(-1 1)">${barFist(k, t)}</g>
      </g></svg>`,
  };
}

// ---- pictures of explorers (for the shadow, and for the people in your party) ---------------------------------------
const toImage = async (svg: string) => {
  const img = new Image();
  img.decoding = 'async';
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
  await img.decode();
  return img;
};

/** the explorer as one black silhouette (for its shadow on the ground) */
export async function silhouette(l: SelfLook, w = 96): Promise<HTMLCanvasElement | null> {
  try {
    const img = await toImage(explorerSvg(l.style, l.accent, w));
    const c = Object.assign(document.createElement('canvas'), { width: img.width || w, height: img.height || Math.round(w * 68 / 46) });
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    return c;
  } catch { return null; }
}

const VEH_EMOJI: Record<string, string> = { bike: '🚲', car: '🚗', jet: '🚀' };
/**
 * Someone's explorer as the game draws it: on foot, or riding (on its bike, in its car, astride its rocket — as on the
 * map: the explorer smaller, sat on the vehicle). Bottom-centred.
 */
export async function explorerPicture(style: ExplorerStyle | null | undefined, accent: string, vehicle?: string | null, w = 184): Promise<HTMLCanvasElement | null> {
  try {
    const img = await toImage(explorerSvg(style, accent, w));
    const ew = img.width || w, eh = img.height || Math.round(w * 68 / 46);
    const veh = vehicle && VEH_EMOJI[vehicle] ? vehicle : null;
    if (!veh) {
      const c = Object.assign(document.createElement('canvas'), { width: ew, height: eh });
      c.getContext('2d')!.drawImage(img, 0, 0, ew, eh);
      return c;
    }
    // riding: the vehicle under a smaller explorer (as on the map)
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(ew * 1.5), height: Math.round(eh * 1.15) });
    const g = c.getContext('2d')!;
    const vs = veh === 'car' ? ew * 1.05 : ew * 0.95;
    const k = veh === 'car' ? 0.6 : veh === 'jet' ? 0.66 : 0.72;
    const lift = veh === 'car' ? 0.2 : veh === 'jet' ? 0.3 : 0.24;
    g.drawImage(img, (c.width - ew * k) / 2, c.height - eh * k - eh * lift, ew * k, eh * k);
    g.save();
    g.translate(c.width / 2, c.height - vs * 0.5);
    if (veh === 'jet') g.rotate(-Math.PI / 4);
    g.font = `${Math.round(vs)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(VEH_EMOJI[veh], 0, 0);
    g.restore();
    return c;
  } catch { return null; }
}
